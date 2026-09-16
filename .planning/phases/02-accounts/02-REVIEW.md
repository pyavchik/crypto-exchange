---
phase: 02-accounts
reviewed: 2026-09-16T08:18:46Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - api/.env.example
  - api/package.json
  - api/src/app.test.ts
  - api/src/app.ts
  - api/src/config.ts
  - api/src/db/client.ts
  - api/src/db/migrations/0001_mute_redwing.sql
  - api/src/db/schema.ts
  - api/src/lib/accounts.test.ts
  - api/src/lib/accounts.ts
  - api/src/lib/errors.ts
  - api/src/lib/password.test.ts
  - api/src/lib/password.ts
  - api/src/lib/session.test.ts
  - api/src/lib/session.ts
  - api/src/routes/auth.test.ts
  - api/src/routes/auth.ts
  - api/src/routes/wallet.test.ts
  - api/src/routes/wallet.ts
  - scripts/smoke-dev.mjs
  - web/src/App.tsx
  - web/src/components/ProtectedRoute.tsx
  - web/src/components/ProtectedRoute.test.tsx
  - web/src/lib/api.ts
  - web/src/lib/api.test.ts
  - web/src/lib/auth.tsx
  - web/src/pages/Login.tsx
  - web/src/pages/Signup.tsx
  - web/src/pages/Wallet.tsx
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-16T08:18:46Z
**Depth:** standard
**Files Reviewed:** 26 (plus the remaining test files read for cross-checking test-claim accuracy)
**Status:** issues_found

## Summary

Reviewed all five plans of Phase 2 (Accounts): the sign-up tracer slice (02-01), login/logout/wallet/validation (02-02), the frontend login/guard/field-error layer (02-03), the full-journey smoke extension (02-04), and the QA artifacts (02-05, docs only, not source-reviewed beyond factual spot-checks). This was an adversarial re-derivation, not a trust-the-summary pass: every claim in the required-reading SUMMARY/CONTEXT files that bore on security was independently re-verified against the actual source, and one claim was disproved by running the real code.

**Overall assessment: the session/cookie/isolation/exactly-once-grant machinery is sound and matches D-14..D-25 closely** — `db.transaction`'s callback in `accounts.ts` is genuinely synchronous (no `await` inside it), the concurrent-duplicate-signup test actually fires two unawaited `app.inject()` calls and proves the transaction boundary rather than eventual consistency, session tokens are 256-bit random and only their SHA-256 hash is ever persisted, `requireSession` derives identity exclusively from the cookie, no route in this phase reads an id from path/query/body, login always issues a fresh session token, logout truly deletes the server-side row, cookie set/clear share one options function so they can never scope-drift, and the frontend never touches `localStorage`/`sessionStorage` and renders every value (including a duplicate-email or wrong-password message) as React text, not markup.

**One genuine, provable Critical finding was found by execution, not just reading:** `verifyPassword`'s defensive parsing of a malformed stored hash does not fail closed — see CR-01. It was disproved live with `tsx`, not inferred.

**WR-05 from 01-REVIEW.md (carried forward per this review's brief): not fixed, and its exact pattern was spread to four new production call sites this phase added.** See WR-01 below.

## Critical Issues

### CR-01: `verifyPassword` accepts *any* password when the stored hash's hex component is malformed — a fail-open, not fail-closed, defect in the encoded-format parser

**FIXED:** commit `7e2d3da` (formatting follow-up: `493ba19`). `verifyPassword` now rejects strictly-hex/even-length salt and hash components before ever calling `Buffer.from`, requires the decoded salt/hash to be exactly `SALT_LEN`/`KEY_LEN` bytes rather than deriving at whatever length happened to decode, and bounds `N`/`r`/`p` (integer, power-of-two `N`, within `maxmem`). Regression tests added in `api/src/lib/password.test.ts`, including the reviewer's exact repro, confirmed to fail against the pre-fix code and pass against the fix.

**File:** `api/src/lib/password.ts:44-71`
**Issue:** The function's own comment (lines 60-62) states the intended property: "a corrupted stored string must reject here, not crash the caller." It does not crash — but for one class of corruption it does not reject either; it **authenticates successfully for any input password**.

The bug: `Buffer.from(str, "hex")` in Node is lenient — it does not throw on invalid hex, it silently stops decoding at the first invalid byte pair and returns whatever it managed to decode (which is the empty buffer if the very first pair is invalid):
```js
> Buffer.from("zz", "hex").length
0
> Buffer.from("not-a-real-hash-component", "hex").length
0
```
So if the stored `hashHex` component of `scrypt$N$r$p$salt$hash` is anything that starts with a non-hex character, `expected = Buffer.from(hashHex, "hex")` is a **zero-length buffer**, not a thrown error. `verifyPassword` then derives `actual` at `keylen = expected.length` (line 65) — i.e. `keylen = 0`. Node's `scrypt` happily derives a **zero-length key** for `keylen: 0` (no error), so `actual` is also a zero-length buffer:
```js
crypto.scrypt("anypassword", salt, 0, opts, (err, key) => { /* err === null, key.length === 0 */ })
```
`timingSafeEqual(Buffer.alloc(0), Buffer.alloc(0))` returns `true` for two zero-length buffers. The length-equality guard on line 69 (`if (actual.length !== expected.length) return false;`) does not help — both are `0`, so they *are* equal, and the function returns `true`.

**Proven empirically** (not reasoned from a read) by importing the real module in this repo:
```
corrupted stored value: scrypt$16384$8$1$c040d8c85354a34b607ea346ea804b95$zzzznothex
verifyPassword(wrong password, corrupted-hash) => true
```
`verifyPassword` returned `true` for a password that was never set, against a hash whose hex component was garbage.

**Concrete failure scenario:** the current HTTP surface (`POST /api/signup`, `POST /api/login`) only ever writes `password_hash` via `hashPassword()`'s own well-formed output, so this is not exploitable through today's live endpoints — flagging that honestly. But this is the password-verification primitive itself, the single most security-critical function in the phase, and it is silently wrong for a plausible future/operational scenario: any row whose `password_hash` is corrupted, truncated at write time, hand-edited during an admin/support operation, produced by a future migration or password-reset feature that constructs the string differently, or partially overwritten by a storage-layer bug becomes an account that **any attacker can log into with any password**, with zero error and zero log signal (verification "succeeds" normally). No test in `password.test.ts` exercises this path — the existing "rejects a malformed encoded string instead of throwing" test (line 23-25) uses a string that fails the `parts.length !== 6` check entirely (`"not-a-real-hash"`), and the byte-length-mismatch tests (lines 27-54) always start from a genuinely-derived hash and corrupt it with valid hex, so `expected.length` is never `0` in any existing test. The exact failure mode CR-01 describes has no test coverage anywhere in the suite.
**Fix:** Reject explicitly when either decoded component is empty (or more generally, when re-encoding the decoded bytes doesn't round-trip to the original hex, which also catches truncation), before ever calling `scrypt`:
```ts
try {
  salt = Buffer.from(saltHex ?? "", "hex");
  expected = Buffer.from(hashHex ?? "", "hex");
} catch {
  return false;
}
// Buffer.from(..., "hex") never throws on invalid input — it silently
// truncates. A truncated/garbage hex string that decodes to zero bytes
// must be rejected explicitly, or a zero-length `actual`/`expected` pair
// will compare equal in timingSafeEqual regardless of password.
if (expected.length === 0 || salt.length === 0) return false;
```
Also add a regression test asserting `verifyPassword(anything, "scrypt$16384$8$1$<validsalt>$not-hex")` resolves `false`.

## Warnings

### WR-01 (carried forward from `01-REVIEW.md` WR-05, spread further by this phase): the blanket JSON-parse `catch` that swallows a genuine `AbortError` was not fixed, and its exact pattern was copied into four new production call sites

**FIXED:** commit `a141a75`. The shared `parseJsonBody` helper now re-throws a genuine `AbortError` (checked via `instanceof DOMException && error.name === "AbortError"`) instead of relabelling it `INVALID_RESPONSE_BODY`, mirroring the network-fetch stage's existing check. `fetchHealth`'s own inline duplicate of the same unguarded pattern was folded into a call to the same fixed helper, so every current call site (`fetchHealth`, `signup`, `fetchMe`, `login`, `logout`, `fetchWallet`) benefits from the one fix. Regression tests added in `web/src/lib/api.test.ts` (`fetchHealth` and `fetchWallet`) confirmed to fail against the pre-fix code and pass against the fix. `parseErrorResponse`'s equivalent latent gap on the non-2xx path was noted by the review but was out of scope for this fix pass; it remains open.

**File:** `web/src/lib/api.ts:78-83` (unchanged `fetchHealth`, the original finding) and the new `parseJsonBody` helper at `web/src/lib/api.ts:100-111` (used by `signup`, `fetchMe`, `login` via `parseSessionResponse`, and directly by `logout` and `fetchWallet`)
**Issue:** `01-REVIEW.md` WR-05 flagged that `fetchHealth`'s 2xx-body `try { await response.json() } catch { throw new ApiError(...) }` has no clause distinguishing `AbortError` from a genuinely malformed body, silently violating the function's own documented contract ("every failure rejects with `ApiError` or `AbortError`"). This phase did not fix that instance, and — rather than being an isolated pre-existing issue this phase merely didn't touch — it **generalized the identical unguarded pattern into a new shared helper**:
```ts
async function parseJsonBody<T>(response: Response, headerRequestId: string | null): Promise<ApiResult<T>> {
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
  }
  return { data, requestId: headerRequestId };
}
```
This helper now backs `signup`, `fetchMe`, `login` (via `parseSessionResponse`), `logout`, and `fetchWallet` — five endpoints instead of one. Every one of these functions accepts an optional `signal` in its public options and is documented/positioned as reusable (matching `fetchHealth`'s own pattern), so any future caller that aborts an in-flight `login`/`signup`/`fetchWallet`/`logout` request after headers arrive but while the body is still being read will have a real `AbortError` relabelled `ApiError("INVALID_RESPONSE_BODY")`. The pre-existing `parseErrorResponse` (non-2xx path, `api.ts:287-308`) has the same latent gap and also remains unfixed.
**Concrete failure scenario:** today no caller in this codebase (`AuthProvider`, `Login.tsx`, `Signup.tsx`) passes an `AbortSignal` into any of these calls, so — exactly like the original WR-05 finding — this is currently inert. But the surface area for the bug has grown 5x this phase, and unlike `fetchHealth` (whose one caller, `healthPoller`, is proven to mask it via a `stopped` guard checked before any error-branching), none of the new auth call sites have any such masking analysis performed or documented — the risk is simply unexamined, not proven-safe.
**Fix:** As in the original finding, mirror the network-fetch stage's explicit `AbortError` re-throw inside `parseJsonBody` (and `parseErrorResponse`) once, so every current and future caller gets the fix for free:
```ts
async function parseJsonBody<T>(response: Response, headerRequestId: string | null): Promise<ApiResult<T>> {
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
  }
  return { data, requestId: headerRequestId };
}
```
`fetchHealth`'s own inline duplicate of this pattern (`api.ts:78-83`) should be replaced with a call to the same fixed helper while this is being touched, closing both the original and the newly-spread instances in one pass.

### WR-02: `scripts/smoke-dev.mjs`'s temp SQLite database and log file are never cleaned up after the run

**FIXED:** commit `e6500bc`. `tempDir` is now removed with `rmSync(tempDir, { recursive: true, force: true })` in the same `finally` block that already closes the browser and kills the spawned dev process group, so cleanup runs on both the success and failure exit paths; the removal is itself wrapped in try/catch so a cleanup failure can never mask the real smoke result. Verified by reverting the fix and re-running `npm run smoke`: the `$TMPDIR` `crypto-exchange-smoke-*` directory count went 32 → 33 (leaked) before the fix and stayed at 32 after it, both runs printing `SMOKE OK`.

**File:** `scripts/smoke-dev.mjs:135,144-145,613-629`
**Issue:** `mkdtempSync(join(tmpdir(), "crypto-exchange-smoke-"))` creates a fresh temp directory every run, and this phase's new sections (k3)/(p) reopen the same `databasePath` inside it to assert row counts. The `finally` block (lines 613-629) closes the browser and kills the spawned dev process group, but never removes `tempDir` — no `rmSync`, no `fs.rm`. This predates Phase 2 (the directory/pattern was introduced in 01-10) but Phase 2 is the first plan to give that temp file real, durable content worth caring about: a signed-up account's `password_hash` (a real scrypt-derived hash, not a placeholder) and a session's `token_hash` now persist indefinitely in `$TMPDIR/crypto-exchange-smoke-*/smoke.db` after every `npm run smoke` invocation, across every local run and every CI run that doesn't sweep its own `$TMPDIR`.
**Fix:** Remove the temp directory in the `finally` block:
```js
} finally {
  if (browser) { /* ... */ }
  if (devProcess.pid) { /* ... */ }
  stub.server.close();
  rmSync(tempDir, { recursive: true, force: true });
}
```
(`rmSync` from `node:fs`, already partially imported in this file.)

## Info

### IN-01: `Wallet()`'s `loading`/`anonymous` branches are dead code now that `/wallet` is always wrapped in `ProtectedRoute`

**File:** `web/src/pages/Wallet.tsx:34-55`, `web/src/App.tsx:129-135`
**Issue:** `Wallet()` still contains its own `state.kind === "loading"` and `state.kind === "anonymous"` branches (added in 02-01, before `ProtectedRoute` existed). Since 02-03, `App.tsx` always renders `Wallet` inside `<ProtectedRoute>`, which itself renders a loading shell for `"loading"` and a `<Navigate>` for `"anonymous"`, never passing control to its children (`Wallet`) in either case. `Wallet`'s own copies of those two branches can therefore never execute through the app's only route to this component — they are unreachable, not merely redundant.
**Fix:** Either delete the two dead branches (the component only needs to handle the `authenticated` case, since `ProtectedRoute` is now the sole caller and the sole guard) or, if `Wallet` is intentionally kept renderable standalone for some future reuse, add a code comment saying so — as written it reads like leftover UI-guard logic nobody noticed had become unreachable.

### IN-02: `scripts/smoke-dev.mjs`'s browser Chrome profile lifecycle is sound; noting for completeness per the review brief

**File:** `scripts/smoke-dev.mjs:161-166,281-289,613-620`
**Issue/Note:** Not a defect — recorded because the review brief specifically asked this be checked for Phase 2's new sections. The dev process is spawned `detached: true` and killed only via `process.kill(-devProcess.pid, "SIGTERM")` — its own process group, never a PID this script did not spawn. Chrome is launched `headless: true` with no `userDataDir`, so every run gets a disposable temp profile Chromium itself manages and cleans up; `browser.close()` runs unconditionally in the `finally` block. No leak or kill-scope risk found in either mechanism, including in the new sections (l)-(q) added by 02-04. This item exists only to record that the check was performed, per the review brief's explicit ask — see WR-02 above for the one real gap found in this area (the SQLite/log temp directory, not the browser).

---

_Reviewed: 2026-09-16T08:18:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

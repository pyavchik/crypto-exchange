---
phase: 02-accounts
verified: 2026-09-16T12:55:00Z
status: passed
score: 4/4 must-haves verified
covered_files: [".planning/REQUIREMENTS.md", ".planning/phases/02-accounts/02-01-PLAN.md", ".planning/phases/02-accounts/02-01-SUMMARY.md", ".planning/phases/02-accounts/02-02-PLAN.md", ".planning/phases/02-accounts/02-02-SUMMARY.md", ".planning/phases/02-accounts/02-03-PLAN.md", ".planning/phases/02-accounts/02-03-SUMMARY.md", ".planning/phases/02-accounts/02-04-PLAN.md", ".planning/phases/02-accounts/02-04-SUMMARY.md", ".planning/phases/02-accounts/02-05-PLAN.md", ".planning/phases/02-accounts/02-05-SUMMARY.md", ".planning/phases/02-accounts/02-CONTEXT.md", ".planning/phases/02-accounts/02-REVIEW.md", ".planning/phases/02-accounts/02-UAT.md", "api/src/db/schema.ts", "api/src/lib/accounts.ts", "api/src/lib/errors.ts", "api/src/lib/password.test.ts", "api/src/lib/password.ts", "api/src/lib/session.ts", "api/src/routes/auth.ts", "api/src/routes/wallet.ts", "qa/TEST-PLAN.md", "qa/runs/RUN-2026-09-16-auth.md", "qa/test-cases/auth.md", "scripts/smoke-dev.mjs", "web/src/App.tsx", "web/src/components/ProtectedRoute.tsx", "web/src/lib/api.test.ts", "web/src/lib/api.ts", "web/src/lib/auth.tsx", "web/src/pages/Login.tsx", "web/src/pages/Signup.tsx", "wiki/index.md", "wiki/log.md", "wiki/pages/decisions/session-auth-model.md", "wiki/pages/findings/verify-password-fail-open.md"]
covered_digest: "v1:sha256:347b0a9e54ee4b6fb8d9fd22433454f94d2b1885b99126f3ea83ff272cbc2968"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed:
    - "CR-01: verifyPassword failed OPEN (authenticated any password) on a malformed stored hash — api/src/lib/password.ts"
    - "WR-01: shared parseJsonBody helper relabelled a genuine AbortError as INVALID_RESPONSE_BODY — web/src/lib/api.ts"
    - "WR-02: scripts/smoke-dev.mjs leaked its mkdtempSync temp directory (real scrypt hash + session token hash) on every run"
  gaps_remaining: []
  regressions: []
---

# Phase 2: Accounts Verification Report

**Phase Goal:** Users can create an account and hold a private, pre-funded demo wallet
**Verified:** 2026-09-16T12:55:00Z
**Status:** passed
**Re-verification:** Yes — after post-verification remediation (CR-01, WR-01, WR-02 from `02-REVIEW.md`)

This report **replaces** the prior `02-VERIFICATION.md` (`verified: 2026-09-16T12:40:00Z`), which went stale after remediation commits touched files it covered without the frontmatter fingerprint being refreshed. This is a full independent re-verification, not a diff of the prior report: every gate below was re-run by this verifier against the current tree, and the CR-01 exploit was re-proven live against the fixed module rather than trusted from either the SUMMARY or the prior report's narration.

## What Changed Since The Prior Verification

Three code-review findings from `02-REVIEW.md` were remediated after the prior verification ran, plus documentation of the fix:

- `7e2d3da` (+ formatting follow-up `493ba19`) — **CR-01 fix**, `api/src/lib/password.ts`: `verifyPassword` previously derived `actual`/`expected` at whatever length `Buffer.from(hex)` happened to decode a malformed hex component to (silently truncating rather than throwing) — a hash component starting with a non-hex byte decoded to a zero-length buffer, scrypt derived a zero-length key, and `timingSafeEqual(empty, empty)` returned `true`, so a corrupted stored hash authenticated **any** password. Now rejects non-hex/odd-length hex components via `HEX_RE` before ever calling `Buffer.from`, requires decoded salt/hash to be exactly `SALT_LEN`(16)/`KEY_LEN`(32) bytes, and bounds `N`/`r`/`p` (integer, power-of-two `N`, within Node's `maxmem`). 7 regression tests added to `api/src/lib/password.test.ts`, including the reviewer's exact repro.
- `a141a75` — **WR-01 fix**, `web/src/lib/api.ts`: the shared `parseJsonBody` helper (backing `signup`, `fetchMe`, `login`, `logout`, `fetchWallet`) now re-throws a genuine `AbortError` (`instanceof DOMException && error.name === "AbortError"`) instead of relabelling it `INVALID_RESPONSE_BODY`; `fetchHealth`'s previously-duplicated inline parse now delegates to the same fixed helper. Regression tests added to `web/src/lib/api.test.ts` for both `fetchHealth` and `fetchWallet`.
- `e6500bc` — **WR-02 fix**, `scripts/smoke-dev.mjs`: the `mkdtempSync` temp directory (which holds a real scrypt password hash and session token hash in `smoke.db` after every Phase 2 run) is now removed via `rmSync(tempDir, { recursive: true, force: true })` inside the existing `finally` block, itself wrapped in try/catch so a cleanup failure can never mask the real smoke result.
- `ea1ac0f`, `ecb72f4` — docs: `02-REVIEW.md` findings marked fixed with commit references; `wiki/pages/findings/verify-password-fail-open.md` RCA written and catalogued in `wiki/index.md` / `wiki/log.md`.
- **IN-01 deliberately left open** (accepted, not a gap): `web/src/pages/Wallet.tsx`'s `loading`/`anonymous` branches (lines 37, 46) remain dead code, unreachable because `App.tsx` always wraps `/wallet` in `ProtectedRoute`, which itself handles both states before ever rendering `Wallet`. Confirmed still present in the current tree — this is an accepted low-severity Info finding, not a defect blocking the phase goal.

None of these three findings changed the phase's behavioral contract (session/cookie/isolation/exactly-once-grant machinery), and none of the four ROADMAP success criteria's original evidence depended on the buggy paths — this re-verification independently confirms that rather than assuming it.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---------|------------|-----------|
| 1 | User can sign up, log in, refresh and stay logged in, and log out | ✓ VERIFIED | `npm run smoke` re-run live by this verifier against the current (post-remediation) tree, real Chrome 152.0.7977.84 via `playwright-core`: signup → funded wallet → reload (still signed in) → logout → guarded `/wallet` redirect → re-login → funded wallet again → `SMOKE OK`. Temp-dir count under `$TMPDIR` was 32 both immediately before and immediately after the run (independently re-measured, not taken from any prior report), directly confirming the WR-02 leak fix. Corroborated by `api/src/routes/auth.test.ts` and `web/src/App.test.tsx`/`ProtectedRoute.test.tsx`/`Login.test.tsx`, all re-run in this pass (`npm test`). |
| 2 | Invalid signups (bad email, short password, duplicate email) show clear errors | ✓ VERIFIED | `api/src/routes/auth.ts` `validateCredentials()` rejects malformed email/short password with per-field messages; duplicate email maps the SQLite `UNIQUE` constraint to `409 EMAIL_TAKEN`. Frontend renders inline via `formErrorsFromApiError`, confirmed in `Login.tsx`/`Signup.tsx`. Unaffected by the three remediated findings (none touch validation or error rendering); re-confirmed passing in the fresh `npm test` run (`auth.test.ts`'s "per-field validation (D-27)" block) and unchanged in `qa/test-cases/auth.md`/`qa/runs/RUN-2026-09-16-auth.md`. |
| 3 | A new user sees exactly 10,000 USDT; user A cannot fetch user B's data via the API | ✓ VERIFIED | `api/src/lib/accounts.ts#createWithGrant` remains unchanged by remediation: one synchronous `db.transaction` inserting the user row and a single `STARTING_USDT = "10000.00000000"` balances row, backed by `UNIQUE(user_id, asset)`. Isolation: `request.userId` remains the only identity source; no route accepts an id from path/query/body (re-confirmed by grep against the current route list — still only `/api/signup`, `/api/login`, `/api/logout`, `/api/me`, `/api/wallet`, none parameterized). The CR-01 fix directly *strengthens* this criterion's security posture: the password primitive that gates access to this exactly-once grant and to per-user isolation no longer has a fail-open path. Independently re-proven live: this verifier ran the reviewer's exact CR-01 repro plus four additional variants (empty hash, 1-byte truncated hash, odd-length hex, non-hex salt) against the fixed module — all five return `false` — while a correct password against a real `hashPassword()` output returns `true` and a wrong one `false`. |
| 4 | Auth test cases are written, executed, and results recorded | ✓ VERIFIED | `qa/test-cases/auth.md` (24 `TC-AUTH-NNN` cases) and `qa/runs/RUN-2026-09-16-auth.md` (24/24 pass) are unchanged by remediation and still present and internally consistent with the current source. `02-UAT.md` (independent UAT pass, 4 tests / 15 checks, 0 issues, separate harness from the QA run) also unchanged and still consistent. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `api/src/lib/password.ts` | scrypt hash/verify, self-describing string, fail-closed on malformed input (post-CR-01) | ✓ VERIFIED | `hashPassword`/`verifyPassword` exported, 118 lines. `verifyPassword` now: rejects non-integer/non-power-of-two/out-of-bound `N`/`r`/`p` before touching scrypt; rejects non-hex or odd-length `saltHex`/`hashHex` via `HEX_RE` before `Buffer.from`; requires decoded lengths exactly `SALT_LEN`(16)/`KEY_LEN`(32); `timingSafeEqual` compare only after all of the above pass. |
| `api/src/lib/password.test.ts` | regression coverage for CR-01 | ✓ VERIFIED | 7 `CR-01:`-prefixed tests present: reviewer's exact repro, zero-length hex, wrong decoded hash length, wrong decoded salt length, tampered `N`, tampered `r`/`p`. All pass (`npm test`). |
| `web/src/lib/api.ts` | `parseJsonBody` re-throws genuine `AbortError` (post-WR-01) | ✓ VERIFIED | Single shared helper (lines 99-113) backs `fetchHealth`, `signup`, `fetchMe`, `login`, `logout`, `fetchWallet`; `error instanceof DOMException && error.name === "AbortError"` guard re-throws before the `INVALID_RESPONSE_BODY` fallback. |
| `web/src/lib/api.test.ts` | regression coverage for WR-01 | ✓ VERIFIED | `fetchHealth` and `fetchWallet` each have a "rethrows an AbortError raised mid-body-read instead of wrapping it as INVALID_RESPONSE_BODY" test; both pass. |
| `scripts/smoke-dev.mjs` | temp dir removed on every exit path (post-WR-02) | ✓ VERIFIED | `finally` block (lines 613-639) closes browser, kills the spawned process group, then `rmSync(tempDir, { recursive: true, force: true })` wrapped in its own try/catch. Independently re-measured: `$TMPDIR` `crypto-exchange-smoke-*` count was 32 before and 32 after a fresh `npm run smoke` run in this verification pass. |
| `wiki/pages/findings/verify-password-fail-open.md` | RCA for CR-01 | ✓ VERIFIED | Present, catalogued in `wiki/index.md` (Findings section) and appended to `wiki/log.md`. |
| `web/src/pages/Wallet.tsx` | IN-01 status (accepted open item) | ✓ CONFIRMED OPEN, ACCEPTED | Lines 37/46 (`state.kind === "loading"` / `"anonymous"`) still present and still unreachable through the app's only route (`ProtectedRoute` in `App.tsx`). Not remediated, and this is intentional per the remediation scope — recorded here as accepted, not treated as a gap. |
| All artifacts verified in the prior report (unchanged by remediation) | `api/src/lib/session.ts`, `api/src/lib/accounts.ts`, `api/src/routes/auth.ts`, `api/src/routes/wallet.ts`, `api/src/db/schema.ts`, `web/src/components/ProtectedRoute.tsx`, `web/src/lib/auth.tsx`, `qa/test-cases/auth.md`, `qa/runs/RUN-2026-09-16-auth.md`, `wiki/pages/decisions/session-auth-model.md` | ✓ VERIFIED (regression check) | None of these files appear in the remediation commits' diffs (`git show --stat` on `7e2d3da`, `a141a75`, `e6500bc`, `493ba19`, `ea1ac0f`, `ecb72f4`); re-confirmed present and passing via the fresh full `npm test` run and grep spot-checks (no content drift). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `api/src/routes/wallet.ts` | `api/src/lib/session.ts` | `requireSession` preHandler sets `request.userId`; handler queries by that id alone | ✓ WIRED | Unchanged by remediation; re-confirmed by direct read. |
| `api/src/routes/auth.ts` | `api/src/lib/password.ts` | `login` calls `verifyPassword`, now fail-closed on any malformed stored hash | ✓ WIRED | `verifyPassword` imported and called in the login handler's credential check; the fixed function is the one actually reachable from the HTTP surface. |
| `web/src/lib/api.ts` (`fetchHealth`) | `web/src/lib/api.ts` (`parseJsonBody`) | `fetchHealth` delegates its 2xx-body parse to the shared helper instead of duplicating the pattern | ✓ WIRED | Confirmed at `api.ts:79`, `return parseJsonBody<HealthResponse>(response, headerRequestId);`. |
| `scripts/smoke-dev.mjs` | its own `finally` block | `rmSync(tempDir, ...)` runs on both the `SMOKE OK` and `SMOKE FAIL` paths | ✓ WIRED | Confirmed by re-running `npm run smoke` (success path) and comparing temp-dir counts before/after — no leak. |
| `wiki/index.md` | `wiki/pages/findings/verify-password-fail-open.md` | catalogued under Findings | ✓ WIRED | `grep` confirms the link line in both `wiki/index.md` and `wiki/log.md`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full real-browser auth journey against the post-remediation tree | `npm run smoke` (re-executed live by this verifier) | `browser: Chrome 152.0.7977.84` / `SMOKE OK` | ✓ PASS |
| Smoke temp-dir leak fix (WR-02), measured independently | `ls "$TMPDIR" \| grep -c crypto-exchange-smoke` before and after `npm run smoke` | 32 before, 32 after | ✓ PASS |
| Full workspace unit/integration suite | `npm test` | `9 test files / 93 tests passed (api)`, `8 test files / 72 tests passed (web)` | ✓ PASS |
| Type safety | `npm run typecheck` | clean, no output (api + web) | ✓ PASS |
| Lint | `npm run lint` | clean, exit 0 | ✓ PASS |
| Formatting | `npm run format:check` | "All matched files use Prettier code style!" | ✓ PASS |
| Wiki structural lint | `node scripts/wiki-lint.mjs --base afc60aa` | `pages=19 orphans=0 broken_links=0 duplicates=0 unverified=5 errors=0` | ✓ PASS |
| CR-01 exploit re-test against the fixed module, run directly by this verifier (not from SUMMARY/prior-report narration) | `npx tsx` importing `api/src/lib/password.ts` directly: reviewer's exact repro (non-hex hash) + empty hash + 1-byte-truncated hash + odd-length hex hash + non-hex salt, plus a correct/wrong password against a real `hashPassword()` output | all 5 malformed cases → `false`; correct password → `true`; wrong password → `false` | ✓ PASS |
| Debt-marker scan on the three remediated files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` on `password.ts`, `api.ts`, `smoke-dev.mjs` | no matches | ✓ PASS |
| IN-01 confirmed still open (accepted, not remediated) | `grep -n "kind === \"loading\"\|kind === \"anonymous\""` on `web/src/pages/Wallet.tsx` | lines 37, 46 still present | ✓ CONFIRMED (expected) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 02-01, 02-02, 02-03 | Sign up with email/password, validation, duplicate rejection | ✓ SATISFIED | Unchanged by remediation; re-confirmed. |
| AUTH-02 | 02-01, 02-02, 02-03 | Log in, stay logged in across refresh (httpOnly cookie) | ✓ SATISFIED | Unchanged by remediation; re-confirmed via fresh `npm run smoke`. |
| AUTH-03 | 02-02, 02-03, 02-04 | Log out from any page | ✓ SATISFIED | Unchanged by remediation; re-confirmed via fresh `npm run smoke`. |
| AUTH-04 | 02-01, 02-02 | Cross-user isolation enforced server-side | ✓ SATISFIED | Strengthened by the CR-01 fix (the password primitive gating this now fails closed); re-confirmed structurally and via the independent exploit re-test. |
| AUTH-05 | 02-01, 02-02, 02-04 | Exactly-once 10,000 USDT grant | ✓ SATISFIED | Unchanged by remediation (`accounts.ts` not touched); re-confirmed via fresh `npm run smoke` DB read. |
| QA-02 | 02-05 | Manual auth test cases, executed, traceable | ✓ SATISFIED | Unchanged by remediation; `qa/test-cases/auth.md` and `qa/runs/RUN-2026-09-16-auth.md` re-confirmed present and consistent. |

No orphaned requirements — matches the prior report's finding, re-confirmed against the current `REQUIREMENTS.md` (AUTH-01..05, QA-02 all `[x]` and mapped to Phase 2 / Complete).

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in the three remediated files (`password.ts`, `api.ts`, `smoke-dev.mjs`) or in any of the other phase-core auth files. No new stub handlers, no hardcoded-empty data flowing to render, no `console.log`-only implementations introduced by remediation.

**ℹ️ Info — IN-01 (dead branches in `Wallet.tsx`) confirmed still open, accepted per dispatch scope.** Not a gap: the remediation dispatch explicitly scoped only CR-01/WR-01/WR-02, and this is a pre-existing Info-severity finding with no security or correctness impact (the branches are unreachable, not wrong).

**ℹ️ Info — unpushed branch / CI not yet run on this exact commit.** `git status` confirms local `main` is 31 commits ahead of `origin/main` (still at `afc60aa`, the Phase 1 completion commit); nothing in this phase — including the remediation commits — has been pushed. None of the 4 ROADMAP success criteria for this phase require CI-green-on-GitHub, so this remains a pre-ship action item, not a phase-goal gap. The orchestrator has stated it will push immediately after this verification.

### Deferred Items

None. All four ROADMAP success criteria are met now, by this phase's own artifacts, independent of any later phase.

### Human Verification Required

None. Every observable truth had either a live, verifier-executed behavioral proof (`npm run smoke` re-run fresh against the post-remediation tree, real Chrome, real SQLite/temp-dir reads) or a passing, content-reviewed automated test exercising the exact state transition/invariant claimed, plus — for the CR-01 fix specifically — a direct, independent exploit re-test run by this verifier against the live module rather than trusted from the SUMMARY or the review/orchestrator narration.

### Gaps Summary

No gaps. All 4 ROADMAP Success Criteria remain verified against the current, post-remediation code:

1. The full signup → login → refresh-persistence → logout journey was re-executed live by this verifier via `npm run smoke` against the current tree, with an independent before/after temp-dir count confirming the WR-02 leak fix held.
2. Invalid-signup error handling is unchanged by remediation and was re-confirmed via the fresh `npm test` run.
3. The exactly-once 10,000 USDT grant and cross-user isolation are unchanged structurally, and the security posture underneath them is strengthened by the CR-01 fix — independently re-exploited and confirmed closed (5 malformed-hash variants all now reject; a correct password still authenticates).
4. The QA deliverable (24 written + 24 executed test cases, plus a separate 4-test/15-check independent UAT pass) is unchanged and remains internally consistent with the current code.

The one open item — the local branch not yet pushed to `origin/main`, so GitHub Actions has not run on this commit — is disclosed for visibility and is not a phase-goal blocker; it is a pre-ship action item. IN-01 (dead branches in `Wallet.tsx`) is recorded as a deliberately accepted open Info-severity item, not a gap.

---

_Verified: 2026-09-16T12:55:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 01-foundation-project-memory
reviewed: 2026-09-16T05:55:22Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - web/src/lib/healthPoller.ts
  - web/src/lib/healthPoller.test.ts
  - web/src/lib/api.ts
  - web/src/lib/api.test.ts
  - scripts/smoke-dev.mjs
  - web/index.html
  - web/public/favicon.svg
  - package.json
  - package-lock.json
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-16T05:55:22Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the gap-closure work from plans 01-09 (browser timer-receiver fix + programming-error
separation), 01-10 (real-browser `playwright-core` smoke step + favicon), and 01-11 (documentation
only — not in this review's file scope, referenced only to confirm prior findings' status). This
is a re-review of `01-REVIEW.md`'s prior findings against the current tree, plus adversarial
review of the newly changed code.

**Headline bug (receiver rule) — confirmed fixed, no remaining loophole.** `grep`-verified: no
call site anywhere in `web/src/` still invokes `timers.setTimeout(...)` / `timers.clearTimeout(...)`
as a member call; both the default timers and any injected `timers` option are copied into local
consts (`scheduleTimeout`/`cancelTimeout`) at `healthPoller.ts:71-72` and called only as bare,
unqualified functions. The new `describe("... under the browser timer-receiver rule")` block
reproduces the WebIDL "Illegal invocation" check with a strict-receiver shim and the 01-09 SUMMARY's
RED excerpts show it genuinely failed pre-fix (`TypeError: Illegal invocation` / promises resolving
`undefined` instead of rejecting) — not tautological.

**"Stuck checking" concern — traced and ruled out.** In every branch of `performFetch`'s
`.then(fulfilled, rejected)` (ok, ApiError, non-ApiError-rethrow), `checking = false` is set
synchronously *before* `onUpdate`/the throw, so a thrown programming error can never leave
`isChecking()` — and therefore the Re-check button — stuck `disabled`. Confirmed by reading, not
just trusting the SUMMARY's claim.

**Unhandled rejection — confirmed present, but by design and functionally inert.** A non-ApiError
thrown from `fetchHealth` or from `onUpdate` is deliberately re-thrown out of `performFetch()`;
`start()` and the visibility listener discard that promise with `void` (→ browser console
"Uncaught (in promise)"), and `HealthBadge.tsx`'s `handleRecheck` does the same
(`void poller.refresh();`). `afterSettled()` still runs first in every such path, so polling is
never interrupted — this is an intentional, well-commented trade-off (never disguise a programming
bug as "API unreachable"), not a defect. See IN-04 for the one narrower, unintended consequence
of this design found during review.

**New finding not covered by 01-09/10's own testing:** the 01-09 fix to `fetchHealth`'s 2xx path
(closing REVIEW WR-01) introduced a new `try/catch` around `response.json()` that is *broader*
than intended — it also swallows a genuine `AbortError` if the poller's fetch is aborted while the
body is still being read, converting it into a synthetic `ApiError` and violating the function's
own stated contract ("every failure rejects with `ApiError` or `AbortError`"). See WR-05.

**Prior-review findings, re-verified against the current tree:**

| ID | Status | Note |
|----|--------|------|
| WR-01 (malformed 2xx body → raw `SyntaxError`) | **Closed** by 01-09 | `api.ts:68-73` now wraps `response.json()`; see `api.test.ts:68-81` |
| WR-02 (unsafe `error as ApiError` cast) | **Closed** by 01-09 | `healthPoller.ts:139` now narrows with `error instanceof ApiError` (value import, confirmed at `healthPoller.ts:1`) |
| WR-03 (CI doesn't run smoke/wiki-lint) | **Closed (reworded)** by 01-11 | `qa/TEST-PLAN.md` now documents the real-browser smoke step as a local Entry Criterion, not a CI job, matching the second remediation option the prior review offered. CI itself (`.github/workflows/ci.yml`) is unchanged and still does not run `npm run smoke` or `wiki-lint.mjs` — this is a documented, deliberate scope deferral to Phase 6 (AUT-02), not a silent gap. Not re-opened. |
| WR-04 (`buildRotationOptions` `.log`-suffix assumption) | **Still open** | `api/src/lib/logger.ts` was not touched by 01-09/10/11 (confirmed via `git diff 030a0c5..HEAD -- api/src/lib/logger.ts` outside this range) — out of this review's file scope, carried forward unverified against current HEAD beyond confirming it wasn't touched. |
| IN-01 (dead `?? request.url` fallback) | **Still open** | `api/src/lib/errors.ts`, `api/src/app.ts` — untouched by this plan range. |
| IN-02 (`wiki-lint.mjs` ad hoc frontmatter parser) | **Still open** | untouched by this plan range. |
| IN-03 (`ensureLogSymlink` non-atomic check-then-act) | **Still open** | untouched by this plan range. |

`scripts/smoke-dev.mjs`'s new browser step (checks h0/h/i/j, `waitForBadge`) was read in full:
process/port lifecycle (`spawn(..., { detached: true })`, `process.kill(-devProcess.pid, ...)`) is
unchanged from before this plan range and only ever targets the process group it itself spawned —
no new kill-scope risk was introduced. The mutation-check procedure described in the 01-10 SUMMARY
(temporarily restoring `healthPoller.ts` from `7e14902`) is a manual step the executor performed
by hand during that session — it is **not** encoded into `smoke-dev.mjs` itself (confirmed via
`grep` for `7e14902`/`git checkout`/`execSync` in the script: no matches), so running `npm run
smoke` today carries no risk of mutating the repo. The Chrome profile is a fresh temp profile per
run (`headless: true`, no `userDataDir`) and `browser.close()` runs in the existing `finally`
block; no leak was found.

## Warnings

### WR-05: `fetchHealth`'s new 2xx JSON-parse catch also swallows a genuine `AbortError`

**File:** `web/src/lib/api.ts:68-73`
**Issue:** The 01-09 fix (closing prior REVIEW WR-01) added:
```ts
let data: HealthResponse;
try {
  data = (await response.json()) as HealthResponse;
} catch {
  throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
}
```
This `catch` has no clause, so it treats *every* rejection from `response.json()` — including a
genuine `AbortError` — as a malformed body. Contrast with the network-fetch stage nine lines above
it in the same function:
```ts
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw error;
  }
  throw new ApiError(null, "NETWORK_ERROR", null);
}
```
which explicitly re-throws `AbortError` untouched. The function's own comment two lines above the
new code states the contract this violates: *"the `fetchHealth` contract ('every failure rejects
with `ApiError` or `AbortError`') is silently violated for this one path"* — that sentence was
written to justify wrapping the JSON-parse SyntaxError case, but the blanket `catch` it introduces
also silently violates the *other* half of that same contract for the abort case.

**Concrete failure scenario:** if an in-flight `GET /health` is aborted (via
`AbortController.abort()`) after the response headers/status have arrived but while the body is
still being read/parsed — a real, spec-defined race (aborting a `fetch()` also errors any
in-progress `response.json()`/body read with an `AbortError`) — `fetchHealth` now rejects with
`ApiError(status, "INVALID_RESPONSE_BODY", requestId)` instead of the original `AbortError`. In the
one current caller (`healthPoller.ts`), this is *masked*: the only code path that ever aborts is
`stop()`, which sets `stopped = true` synchronously before calling `controller.abort()`, so the
poller's rejected handler's `if (stopped) return;` guard fires before the `isAbortError`/
`instanceof ApiError` branching is ever reached — no user-visible symptom today. But `fetchHealth`
is an exported, documented-as-reusable function; any other/future direct caller that passes a
`signal` and relies on `isAbortError`-style discrimination (as this exact codebase's own poller
does) would misclassify a cancelled request as an API failure.
**Fix:** Mirror the network-fetch stage's pattern:
```ts
let data: HealthResponse;
try {
  data = (await response.json()) as HealthResponse;
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw error;
  }
  throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
}
```
The same blanket-`catch` pattern also exists in the untouched, adjacent `parseErrorResponse`
(non-2xx path, `api.ts:88-102`) — not modified by this plan range, but worth fixing in the same
pass for consistency since it has the identical latent issue.

### WR-04 (carried forward, still open): `buildRotationOptions` silently mis-derives the rotated filename for a non-`.log` `LOG_FILE`

**File:** `api/src/lib/logger.ts:51-62` (unchanged by plans 01-09/10/11)
**Issue/Fix:** See original `01-REVIEW.md` entry — unmodified by this plan range, not re-verified
against current HEAD beyond confirming the file was untouched.

## Info

### IN-04: No test covers `onUpdate` throwing while handling an `ApiError` state

**File:** `web/src/lib/healthPoller.ts:139-146`
**Issue:** The 01-09 fix wraps the `ApiError` branch in the same try/finally pattern as the `ok`
branch:
```ts
if (error instanceof ApiError) {
  try {
    onUpdate({ kind: "error", error });
  } finally {
    afterSettled();
  }
  return;
}
```
so by construction an exception thrown by `onUpdate` here propagates and reschedules, exactly like
the `ok` branch's D4 behavior. This is almost certainly correct (same pattern, same guarantee), but
unlike the `ok` branch, there is no test exercising "`onUpdate` throws while rendering an error
state" — `healthPoller.test.ts`'s only onUpdate-throws test (`"an exception from onUpdate after a
successful fetch propagates..."`) only covers the fulfilled path. This is a coverage gap for a
branch that was directly touched by this plan's fix, not a proven bug.
**Fix:** Add a parallel test: `fetchHealth` rejects with an `ApiError`, `onUpdate` throws on that
call, assert the rejection propagates and the next poll still fires — mirroring the existing D4
test's structure.

### IN-01, IN-02, IN-03 (carried forward, still open)

Unmodified by plans 01-09/10/11 — see original `01-REVIEW.md` entries for `api/src/lib/errors.ts`
/ `api/src/app.ts` (dead `?? request.url` fallback), `scripts/wiki-lint.mjs` (ad hoc frontmatter
parser), and `api/src/lib/logger.ts` (`ensureLogSymlink` non-atomic check-then-act).

---

_Reviewed: 2026-09-16T05:55:22Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

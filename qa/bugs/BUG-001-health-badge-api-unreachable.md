# BUG-001: Health badge shows "API unreachable" while GET /health returns 200

| Field | Value |
|-------|-------|
| **ID** | BUG-001 |
| **Title** | Health badge shows "API unreachable" while GET /health returns 200 |
| **Severity** | S2 Major — a core Phase 1 feature (ROADMAP success criterion 1, the footer health badge) gives wrong results with no data corruption, matching the TEST-PLAN S2 definition ("a core feature is broken or gives wrong results, but the app is not corrupted"). |
| **Priority** | P1 — every S1/S2 bug is P1 per `qa/TEST-PLAN.md` Priority section, and this blocks the Phase 1 exit criterion of 0 open S2 bugs. |
| **Status** | Fixed. Retest is the Phase 1 UAT re-run of tests 1-3 (`.planning/phases/01-foundation-project-memory/01-UAT.md`). |
| **Environment** | Local dev, isolated copy (API `:3100`, web `:5174`, scratch SQLite). Google Chrome, headed, driven by Playwright 1.63 (`chromium.launch({ channel: "chrome" })` — Chrome version `152.0.7977.84` as recorded in `01-10-SUMMARY.md`). macOS `13.7.8`. |
| **Build commit** | `36028fa` (`git log -1 --format=%h 7e14902 -- web/src`; local dev reports `commit: "dev"` in `GET /health` unless `GIT_COMMIT` is set, so this SHA is taken from git history rather than the health payload). |
| **Request ID** | N/A. The defect is client-side (a `TypeError` thrown in browser JS, never surfaced as an API error response); every `GET /health` returned 200 and the UAT run captured no request ID. |
| **Linked test case** | None — Phase 1 has no `TC-*` files yet. Found by Phase 1 UAT tests 1-3: `.planning/phases/01-foundation-project-memory/01-UAT.md`. |
| **Linked requirement** | FND-01, FND-03 |
| **Found in run** | None — found during Phase 1 UAT, not a scripted `RUN-*` execution report. |
| **Reporter** | Claude, Phase 1 UAT run at the user's request |
| **Date** | 2026-09-15 |

## Summary

The footer health badge permanently reads "API unreachable" in a real browser even though every
`GET /health` call returns 200, because `web/src/lib/healthPoller.ts` throws an uncaught
`TypeError: Illegal invocation` on every fetch cycle. The same throw prevents the 60s poll timer
from ever being scheduled and prevents the badge from recovering after an API restart.

## Steps to Reproduce

At build commit `36028fa`:

1. Run `npm run dev`.
2. Open `http://localhost:5173` in Chrome with DevTools Console and Network open (filter "health").
3. Read the footer badge.
4. Leave the tab visible for 70 s.
5. Stop the API, click Re-check, restart the API and click Re-check again.

## Expected Result

The badge reads "API ok" plus the CoinGecko status; it reads "API unreachable" only while the
API is actually down, and recovers to "API ok" after the API restarts and Re-check is clicked;
the badge re-polls `GET /health` once every 60 s while the tab stays visible.

## Actual Result

From UAT tests 1-3 (`01-UAT.md`):

- The badge reads "API unreachable" even though every `GET /health` call returned 200.
- The browser console shows `TypeError: Illegal invocation`.
- No 60 s poll ever fires — the hidden-tab visibility pass in test 2 was vacuous because the poll
  timer is never scheduled in the first place.
- After stopping and restarting the API, clicking Re-check does not return the badge to "API ok"
  — the down state and the up state are indistinguishable, because the badge already read "API
  unreachable" while the API was up.

## Evidence

> Redact before posting — remove API keys, session cookies and Authorization headers from
> screenshots, HAR files and excerpts; this repository is public.

- Screenshot: none captured — observations were recorded directly in `01-UAT.md` by the Playwright-driven session.
- Network excerpt: every `GET /health` request during the UAT run returned `200`; no `X-Request-Id` was captured for this defect because the failure is entirely client-side (no API error response is involved).
- Log excerpt: N/A — the API logged only successful `200` request lines throughout; the defect lives entirely in browser JavaScript and never reaches the API log.
- Console excerpt: `TypeError: Illegal invocation`.

## Impact

The badge reports a false "API unreachable" outage while the API is healthy, which would also
hide a genuine outage behind the same permanently-stuck message, and the 60 s visible-tab poll
never runs at all — so the badge never refreshes on its own even if the underlying bug is fixed
by a page reload.

## Root Cause and Fix

`createHealthPoller` defaulted `timers = { setTimeout, clearTimeout }` and invoked
`timers.setTimeout(...)` as a member call, so the receiver (`this`) was the plain `timers`
object instead of `window`. Browsers enforce a WebIDL receiver check on native timer functions
and throw `TypeError: Illegal invocation` for a non-`window` receiver; Node's `setTimeout` has no
such check, so the Vitest suite (Node environment) passed while the browser failed. The throw
happened inside `afterSettled()` after a *successful* fetch, and the poller's
`.then().catch()` chain caught that thrown `TypeError` and converted it into
`onUpdate({ kind: "error" })` — rendering "API unreachable" after every fetch, success or not,
and never storing a timer id for the next poll.

See [[health-poller-illegal-invocation]](../../wiki/pages/findings/health-poller-illegal-invocation.md)
for the full root-cause write-up.

**Fix (plan 01-09):** timer functions (default and injected via the `timers` option) are now
invoked as unqualified calls via local `const` bindings, never as `obj.method(...)`, so the
receiver is always `undefined`/global regardless of the caller-supplied object — commits
`36f0419` (RED), `0cc2053` (GREEN — invoke health poller timers without a receiver). The fetch
chain was also split into `.then(fulfilled, rejected)` so an exception thrown while handling a
*successful* fetch (a programming error) can never be caught by the rejected handler and
disguised as an API error, and `fetchHealth`'s 2xx JSON parse now throws
`ApiError INVALID_RESPONSE_BODY` instead of a raw `SyntaxError` on a malformed body — commits
`56a3f35` (RED), `bc236b9` (GREEN — separate programming errors from API errors).

Regression tests added in `web/src/lib/healthPoller.test.ts` and `web/src/lib/api.test.ts`
reproduce the browser's WebIDL receiver rule inside Vitest by stubbing `globalThis.setTimeout`/
`clearTimeout` with strict-receiver shims:
- "default timers work when the global timer functions reject a non-global receiver"
- "injected timer functions are invoked without a receiver"
- "refresh() recovers from an error state to ok under the browser receiver rule"
- "an exception from onUpdate after a successful fetch propagates and is not reported as an error state"
- "a non-ApiError rejection from fetchHealth is rethrown, not rendered"
- "rejects with ApiError INVALID_RESPONSE_BODY when a 2xx response body is not valid JSON"

**Detection gap closed (plan 01-10):** the `npm run smoke` browser step (`scripts/smoke-dev.mjs`,
commits `3da79b8`, `75795ac`, `add040a`) now drives the developer's installed Google Chrome via
`playwright-core` (`channel: "chrome"`) and proves the badge shows "API ok" / "CoinGecko: ok"
within 30 s, that a second `GET /health` fires 50-70 s later while the tab is visible (real
timers, not a fake clock), and that the badge correctly shows "API unreachable" during a
simulated outage and recovers to "API ok" via Re-check afterward. A mutation run proved the new
step actually catches this exact bug: restoring the pre-fix `healthPoller.ts` from commit
`7e14902` made `npm run smoke` fail with `SMOKE FAIL: browser: badge did not show "API ok" and
"CoinGecko: ok" within 30000ms (last text: "API unreachableRe-check")`; restoring the fixed file
(`git checkout --`, `git diff --exit-code` clean) and re-running produced `SMOKE OK`.

Phase 6 RCA-01 may expand this bug report into a full RCA write-up with log/network evidence,
once the API test collection and Playwright suite exist to generate that evidence trail.

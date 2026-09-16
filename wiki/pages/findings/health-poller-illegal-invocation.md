---
title: Health badge always shows "API unreachable" (setTimeout Illegal invocation)
type: finding
updated: 2026-09-16
sources: []
related: [[foundation-skeleton-conventions]], [[tech-stack]]
---

# Health badge always shows "API unreachable" (setTimeout Illegal invocation)

**Found:** Phase 1 UAT (`.planning/phases/01-foundation-project-memory/01-UAT.md`, tests 1-3), driven with Playwright against real Chrome.
**Status:** Fixed by plan 01-09; detection added by plan 01-10. Retest is the Phase 1 UAT re-run of tests 1-3. Bug report: `qa/bugs/BUG-001-health-badge-api-unreachable.md`.

## Symptom

In a real browser the footer badge reads "API unreachable" even though every `GET /health` returns 200. After the API restarts, clicking Re-check never brings back "API ok", and the 60s poll never fires while the tab is visible.

## Root cause

`web/src/lib/healthPoller.ts` defaults `timers = { setTimeout, clearTimeout }` and calls `timers.setTimeout(...)`. That makes `this` the plain `timers` object. Browsers require `this` to be `window` for timer functions and throw `TypeError: Illegal invocation`. Node does not care, so the Vitest suite (Node environment) passes.

Sequence: fetch resolves -> `onUpdate({kind:"ok"})` -> `afterSettled()` -> `scheduleFromNow()` throws -> the `.catch` turns the TypeError into `onUpdate({kind:"error"})`. The badge flips to "API unreachable" and no next poll is scheduled.

Confirmed in Chrome by importing the real module and running it with a stub `fetchHealth`: states went `ok` -> `error: TypeError: Illegal invocation`.

## Fix

Timers are invoked as plain functions with lazy arrow-wrapper defaults (`setTimeout: (handler, delayMs) => setTimeout(handler, delayMs)`), and copied into local consts (`scheduleTimeout`/`cancelTimeout`) immediately after destructuring so every call — default or injected via the `timers` option — is an unqualified plain call, never `timers.setTimeout(...)`. The receiver is therefore always `undefined`/global, satisfying the browser's WebIDL receiver check. Separately, the fulfilled and rejected handlers of the fetch chain are split (`.then(fulfilled, rejected)` instead of `.then().catch()`), so an exception thrown while handling a *successful* fetch (a post-settlement programming error) and a non-`ApiError` rejection both propagate out of the poller instead of being caught and rendered as "API unreachable" (REVIEW WR-02). `fetchHealth`'s 2xx JSON parse now throws `ApiError INVALID_RESPONSE_BODY` instead of a raw `SyntaxError` on an unparsable body (REVIEW WR-01 folded in).

## Regression checks

- Vitest strict-receiver tests in `web/src/lib/healthPoller.test.ts` stub `globalThis.setTimeout`/`clearTimeout` with strict-receiver shims that reproduce the browser's WebIDL rule inside Node: "default timers work when the global timer functions reject a non-global receiver", "injected timer functions are invoked without a receiver", "refresh() recovers from an error state to ok under the browser receiver rule", "an exception from onUpdate after a successful fetch propagates and is not reported as an error state", "a non-ApiError rejection from fetchHealth is rethrown, not rendered".
- `web/src/lib/api.test.ts`: "rejects with ApiError INVALID_RESPONSE_BODY when a 2xx response body is not valid JSON".
- The `npm run smoke` browser step (`scripts/smoke-dev.mjs`, plan 01-10) drives the developer's installed Google Chrome via `playwright-core` and proves the badge, the 60s visible-tab poll, and outage/recovery all work in a real browser. A mutation run proved the step catches this exact bug: restoring the pre-fix `healthPoller.ts` from commit `7e14902` made `npm run smoke` fail with `SMOKE FAIL: browser: badge did not show "API ok" and "CoinGecko: ok" within 30000ms (last text: "API unreachableRe-check")`; restoring the fix and re-running produced `SMOKE OK`.

## Lessons

- Unit tests running in a Node environment cannot catch browser-only host-object rules. Phase 1 had no real-browser check (`npm run smoke` hits the API, not a browser), so this reached UAT.
- Poller `.then` handlers catch their own bugs and report them as network errors. A programming error should not render as "API unreachable".
- Node tests can apply the browser receiver rule by stubbing the timer globals with strict-receiver functions.
- Browser checks for timer behaviour must use real timers, because a fake page clock replaces native timers and hides receiver bugs.

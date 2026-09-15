---
status: complete
phase: 01-foundation-project-memory
source: [01-VERIFICATION.md]
started: 2026-09-15T18:40:00Z
updated: 2026-09-15T19:05:00Z
---

## Current Test

[testing complete]

## Execution Notes

At the user's request, tests 1-3 were run by Claude with Playwright 1.63 driving installed Google Chrome (headed), not by hand.
- Stack: an isolated copy of the app (API :3100, web :5174, scratch SQLite, `LOG_FILE=off`), so the user's own `npm run dev` on :3000/:5173 was left untouched.
- Hiding the tab: opening a second tab did not change `document.visibilityState` under Playwright. Test 2 hid the page by overriding `document.visibilityState` and dispatching a real `visibilitychange` event.
- In-flight window: test 2 slowed `/health` by 2.5s with `page.route` so the Re-check in-flight window could be observed.
- Test 4 is Claude's review of the QA docs, not the user's. The user can override it.
- Result: 19/23 automated checks passed. All 4 failures trace to one root cause (see Gaps).

## Tests

### 1. Dark shell and footer health badge render in a real browser
expected: Dark background, yellow-accented top nav (Markets/Trade/Wallet/Orders active-link highlighting); `/` lands on `/markets`; footer badge reads "API ok" / "CoinGecko: not configured" (or ok/degraded/down) plus a "Powered by CoinGecko" link opening in a new tab.
result: issue
reported: "Playwright (Claude): shell passes — body rgb(11,14,17), active link rgb(240,185,11) with matching underline vs inactive rgb(132,142,156), / redirects to /markets, each nav click activates only that link, 'Powered by CoinGecko' has target=_blank rel=noopener noreferrer and opens a new tab. FAILS: badge reads 'API unreachable' although both GET /health calls return 200; console shows 'TypeError: Illegal invocation'. Also a 404 for /favicon.ico."
severity: blocker

### 2. Tab-visibility polling and Re-check button behave correctly
expected: With the app open, switch to another tab for over 60s, then return; separately click Re-check once, then again while the first request is in flight. No `/health` requests fire while the tab is hidden; exactly one fires immediately on becoming visible if >=60s elapsed; Re-check fires exactly one request and the button stays disabled until it resolves; a second click during the in-flight window starts no second request.
result: issue
reported: "Playwright (Claude): hidden 65s -> 0 requests; on becoming visible -> exactly 1 request, immediately; Re-check -> exactly 1 request, button disabled while in flight, forced + programmatic second clicks start no second request, button re-enabled after resolve. BUT the hidden-tab pass is vacuous: the 60s poll timer is never scheduled at all (setTimeout throws Illegal invocation after every fetch), so there is no periodic polling while visible either. Load fires 2 requests in dev (React StrictMode double-mount, first one aborted) — expected in dev, not a bug."
severity: major

### 3. Badge shows "API unreachable" when the API is stopped
expected: Stop the API process while the web app is open. Within the next poll or a Re-check click, the badge shows "API unreachable" (with a Request ID if the error carries one).
result: issue
reported: "Playwright (Claude): after killing the API, Re-check shows 'API unreachable' and the button is usable again; a mocked 503 error envelope shows 'API unreachable Request ID: req-uat-123'. BUT the badge already read 'API unreachable' while the API was up, so the down state is indistinguishable from the up state; after restarting the API, Re-check does NOT return the badge to 'API ok'."
severity: major

### 4. qa/TEST-PLAN.md reads as a rigorous, trading-aware test strategy
expected: Read `qa/TEST-PLAN.md` in full (plus `qa/README.md` and the templates). Risk register rows feel concrete (not generic), severity/priority examples are convincing, and sections read naturally — credible Senior QA Engineer judgment for a reviewer.
result: issue
reported: "Claude review: strong overall — risk rows are concrete and trading-specific (exact-equal limit crossing, double-credit on cancel, IDOR, 5 USDT min-notional boundaries), open questions are flagged rather than assumed, templates are consistent. Problems: (a) the Priority section contradicts itself — it says 'S1/S2 bugs are always P1 per the Exit Criteria' and then gives 'a rare S2 defect ... could reasonably sit at P3', which also conflicts with the '0 open S2 bugs' exit criterion; the Priority prose is wordy/repetitive. (b) The Test Approach has no real-browser check before Phase 6 even though Chrome is the primary browser — exactly the gap that let tests 1-3's bug through unit tests and smoke."
severity: minor

## Summary

total: 4
passed: 0
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-1
  truth: "Footer badge reads 'API ok' / 'CoinGecko: <status>' in a real browser when GET /health returns 200"
  status: failed
  reason: "Playwright (Claude) observed: badge reads 'API unreachable' although GET /health returns 200; console TypeError: Illegal invocation"
  severity: blocker
  test: 1
  root_cause: "web/src/lib/healthPoller.ts defaults timers = { setTimeout, clearTimeout } and calls timers.setTimeout(...), so `this` is the plain object; browsers throw TypeError: Illegal invocation (Node does not, so Vitest passes). The throw happens in afterSettled() inside the fetch .then, the .catch converts it to onUpdate({kind:'error'}), and no next poll is scheduled. Confirmed in Chrome by importing the module with a stub fetchHealth: states ok -> error 'Illegal invocation'."
  artifacts:
    - path: "web/src/lib/healthPoller.ts"
      issue: "timer functions invoked as methods of a plain object (unbound this)"
    - path: "web/src/lib/healthPoller.test.ts"
      issue: "tests run in Node / inject timers, so the browser-only failure is invisible"
  missing:
    - "Call timers with a valid receiver (e.g. default to arrow wrappers or globalThis-bound functions)"
    - "Regression test that fails when timer functions are called with a non-global `this`"
    - "Don't let exceptions from onUpdate/scheduling be reported as API errors (separate programming errors from network errors)"
  debug_session: ""

- gap_id: G-01-2
  truth: "Health is re-polled every 60s while the tab is visible (and not while hidden)"
  status: failed
  reason: "Playwright (Claude) observed: visibility/Re-check mechanics pass, but the 60s poll timer is never scheduled, so the hidden-tab pass is vacuous"
  severity: major
  test: 2
  root_cause: "Same as G-01-1: scheduleFromNow() throws Illegal invocation before a timer id is ever stored."
  artifacts:
    - path: "web/src/lib/healthPoller.ts"
      issue: "scheduleFromNow -> timers.setTimeout unbound"
  missing:
    - "Covered by the G-01-1 fix; add a browser-level check that a second /health fires ~60s after load while visible"
  debug_session: ""

- gap_id: G-01-3
  truth: "Badge distinguishes API down from API up, and returns to 'API ok' after the API comes back"
  status: failed
  reason: "Playwright (Claude) observed: badge already 'API unreachable' with API up; after API restart Re-check does not recover to 'API ok'"
  severity: major
  test: 3
  root_cause: "Same as G-01-1: every successful fetch is converted into an error state by the scheduling throw."
  artifacts:
    - path: "web/src/lib/healthPoller.ts"
      issue: "success path throws after onUpdate(ok)"
  missing:
    - "Covered by the G-01-1 fix; re-run stop/restart check in a real browser"
  debug_session: ""

- gap_id: G-01-4
  truth: "qa/TEST-PLAN.md severity/priority guidance is internally consistent and the strategy includes a real-browser check before Phase 6"
  status: failed
  reason: "Claude review: Priority section says S1/S2 are always P1, then says a rare S2 could sit at P3 (also conflicts with '0 open S2' exit criterion); no real-browser check exists before Phase 6"
  severity: minor
  test: 4
  root_cause: "Priority prose written with two overlapping examples; Test Approach defers all browser automation to Phase 6."
  artifacts:
    - path: "qa/TEST-PLAN.md"
      issue: "Priority section lines ~160-175 self-contradictory; Test Approach table has no browser-level check for Phases 1-5"
  missing:
    - "Rewrite the Priority independence example so it does not contradict 'S1/S2 always P1'"
    - "Add a minimal real-browser smoke (e.g. Playwright check of shell + badge) to the Phase 1 test approach, and file BUG-001 for G-01-1 under qa/bugs/ linking wiki finding health-poller-illegal-invocation"
    - "Minor: add a favicon to stop the /favicon.ico 404 console error"
  debug_session: ""

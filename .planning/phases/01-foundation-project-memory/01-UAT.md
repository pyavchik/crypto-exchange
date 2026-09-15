---
status: testing
phase: 01-foundation-project-memory
source: [01-VERIFICATION.md]
started: 2026-09-15T18:40:00Z
updated: 2026-09-15T18:40:00Z
---

## Current Test

number: 1
name: Dark shell and footer health badge render in a real browser
expected: |
  From repo root run `npm run dev`, open http://localhost:5173 with DevTools Network filtered to "health".
  Dark background, yellow-accented top nav (Markets/Trade/Wallet/Orders with active-link highlighting);
  `/` lands on `/markets`; footer badge reads "API ok" / "CoinGecko: not configured" (or ok/degraded/down)
  plus a "Powered by CoinGecko" link that opens in a new tab.
awaiting: user response

## Tests

### 1. Dark shell and footer health badge render in a real browser
expected: Dark background, yellow-accented top nav (Markets/Trade/Wallet/Orders active-link highlighting); `/` lands on `/markets`; footer badge reads "API ok" / "CoinGecko: not configured" (or ok/degraded/down) plus a "Powered by CoinGecko" link opening in a new tab.
result: [pending]

### 2. Tab-visibility polling and Re-check button behave correctly
expected: With the app open, switch to another tab for over 60s, then return; separately click Re-check once, then again while the first request is in flight. No `/health` requests fire while the tab is hidden; exactly one fires immediately on becoming visible if >=60s elapsed; Re-check fires exactly one request and the button stays disabled until it resolves; a second click during the in-flight window starts no second request.
result: [pending]

### 3. Badge shows "API unreachable" when the API is stopped
expected: Stop the API process while the web app is open. Within the next poll or a Re-check click, the badge shows "API unreachable" (with a Request ID if the error carries one).
result: [pending]

### 4. qa/TEST-PLAN.md reads as a rigorous, trading-aware test strategy
expected: Read `qa/TEST-PLAN.md` in full (plus `qa/README.md` and the templates). Risk register rows feel concrete (not generic), severity/priority examples are convincing, and sections read naturally — credible Senior QA Engineer judgment for a reviewer.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

---
status: complete
phase: 03-live-markets
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md]
started: 2026-09-16T14:05:00Z
updated: 2026-09-16T14:35:00Z
---

## Current Test

[testing complete]

## Execution Notes

The user delegated this phase, so Claude ran UAT. This is an INDEPENDENT pass, written from the phase's success criteria and deliberately separate from plan 03-05's QA harness, so a bug in that harness cannot hide a bug in the app.

- Driver: Playwright `channel: "chrome"` against installed Google Chrome, headed (bundled Chromium cannot install on macOS 13). Script: `scratchpad/uat/uat3.mjs`.
- Stack: an isolated instance (API :3400, web :5474, scratch SQLite, `LOG_FILE=off`) hitting the REAL CoinGecko API with the configured Demo key. The user's own `npm run dev` on :3000/:5173 was left untouched.
- Result: **12/12** after two corrections to the TEST, not the app (both documented under tests 4 and 5 below).
- Run against commit `60693ae` (end of plan 03-05), before the WR-01..WR-04 review fixes landed.

## Tests

### 1. Markets table shows live, correctly formatted data
expected: /markets lists ~20 curated pairs with pair, price, 24h %, volume and market cap, formatted for a trading UI; the USDT quote convention is stated rather than silently implied; CoinGecko attribution is visible.
result: pass
evidence: "20 rows. First row: 'BTC/USDT $76,181.00 -0.90% 38.7B 1.5T'. Convention note rendered: 'This exchange treats USDT as 1:1 with USD.' 'Powered by CoinGecko' present. USDT correctly excluded from its own pair."

### 2. Search and sort work client-side
expected: Typing filters the table without a server round-trip (D-46); clicking a column header reorders rows.
result: pass
evidence: "Search 'bit' narrowed 20 rows to 2 with ZERO new /api/markets requests. Clicking the Price header reordered the table (first row changed between ascending and descending)."

### 3. Trade page chart renders and does not leak
expected: Opening a pair shows a real chart; switching 1D/7D/30D redraws in place; leaving and returning tears the chart down cleanly.
result: pass
evidence: "Chart rendered at 1264x272. lightweight-charts composes 7 stacked canvases per instance; the count held at exactly 7 across all three window switches AND across a navigate-away-and-return cycle — so the unmount teardown genuinely runs. This is the case code review flagged as unproven by the smoke script (IN-03); it is verified here manually instead."

### 4. Polling respects tab visibility
expected: No /api/markets polling while the tab is hidden; polling resumes on becoming visible (D-40).
result: pass
evidence: "Zero requests across 40s hidden. On restore, a request fired IMMEDIATELY and the next came ~31s later, matching the 30s interval. NOTE: this check first reported a false failure — the immediate request landed before the script captured its 'requests so far' baseline, so the delta read zero. Re-probed in isolation with timestamped logging: requests at 12:12:40 (on restore) and 12:13:11. The app is correct; the first test was wrong. This is also the case plan 03-05 had to record Blocked (TC-MKT-020), since headless Chrome cannot simulate tab visibility."

### 5. No page errors, and every browser request is same-origin
expected: No uncaught page errors; the CoinGecko key never appears in browser traffic; no request leaves localhost.
result: pass
evidence: "No page errors, no off-origin requests — every call went to localhost. Two console 401s appeared and were investigated rather than ignored: both are GET /api/me for an anonymous visitor, which is D-29's auth bootstrap behaving exactly as designed (twice because React StrictMode double-mounts in dev). Not a defect; the smoke script already filters them by URL."

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Notes for later phases

- **The USDT convention is a real modelling decision, not cosmetics.** CoinGecko rejects `vs_currency=usdt` (verified live, 400), so prices are USD with a display-only USDT label. Phase 4's order math inherits this; if a reviewer asks "is this really USDT?", the honest answer is no, and the UI says so.
- The curated list is the live top 20 (D-36, the user's choice), so it changes over time. Phase 4/5 tests must not hardcode which coins appear.
- Code review left four Info findings unfixed by decision: dead `Wallet.tsx` branches (IN-01), no keyless scenario in the smoke script (IN-02), chart unmount not asserted by smoke (IN-03 — verified manually here), and unbounded chart-cache growth as coins rotate out of the top 20 (IN-04). IN-04 is the one worth revisiting when the cache lives longer than a demo session.

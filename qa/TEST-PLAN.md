# Test Plan — CoinGecko Paper Exchange

**Project:** CoinGecko Paper Exchange (Railsware Senior QA Engineer portfolio project)
**Document owner:** QA (pyavchik)
**Last updated:** 2026-09-16
**Status:** Living document — updated at every phase boundary as scope is delivered

## Purpose

This document defines the test strategy for the CoinGecko Paper Exchange: a simulated
(paper-trading) crypto exchange where users sign up, receive a virtual 10,000 USDT balance,
browse live markets priced from the CoinGecko Demo API, and place market and limit orders.
The app under test is a portfolio artifact for a Senior QA Engineer (TradeZella) application at
Railsware — this document, the test cases, bug reports and automation it links to are the
headline deliverable, not a formality bolted onto the app.

The Core Value the whole test effort exists to protect: a reviewer can open the live demo,
place a trade, and then open the QA docs and see a rigorous, trading-aware test effort against
that exact flow — balances, orders and P&L must be correct and demonstrably tested.

## Scope

v1 feature areas by requirement family, with the phase that delivers and tests each:

| Family | Area | Phase |
|--------|------|-------|
| FND | Foundation: monorepo, CI, health endpoint, structured logging | Phase 1 |
| MEM | Project memory (LLM Wiki) | Phase 1 |
| QA | Test strategy and templates (this document) | Phase 1 |
| AUTH | Sign-up, login, logout, session persistence, cross-user isolation | Phase 2 |
| DATA | CoinGecko proxy, caching, rate-limit handling, stale-data fallback | Phase 3 |
| MKT | Markets table, search, sort, trade-page chart, price refresh | Phase 3 |
| WAL | Wallet balances, portfolio value, decimal math, account reset | Phase 4 |
| TRD | Market and limit orders, fees, minimum notional, crossing, cancel, concurrency | Phase 4 and 5 |
| ORD | Open orders, order history, trade history, realized/unrealized P&L | Phase 5 |
| AUT | API test collection, Playwright smoke suite, network-mocked edge cases, order-math unit tests | Phase 6 (AUT-04 unit tests land alongside TRD in Phase 4) |
| RCA | Root-cause-analysis write-ups | Phase 6 |
| SHIP | Deployment, seeded demo account, reviewer README | Phase 7 |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real money, deposits, withdrawals, KYC | Legal/custody burden; paper trading only |
| User-to-user matching engine | CoinGecko provides no order book; fills are simulated against a reference price, not matched against other users |
| Futures, margin, leverage, staking | Scope creep beyond spot trading; spot demonstrates the core flows |
| OAuth, 2FA, email verification | Email+password is sufficient to demonstrate auth testing |
| Native mobile apps | Responsive web is enough for reviewers |
| Real-time tick data / WebSockets from the exchange | CoinGecko Demo is REST with upstream caching, not a streaming feed |

Deferred to v2 (tracked in `.planning/REQUIREMENTS.md`, not in the current roadmap, not tested in v1):

| v2 item | Reason deferred |
|---------|-----------------|
| Simulated order book / depth chart and recent trades ticker | Cosmetic-only feature, not required to demonstrate trading correctness |
| Stop-limit orders | Adds an order type beyond what the job posting requires to demonstrate |
| Watchlist / favourite pairs | Convenience feature, no QA-differentiating value |
| Price alerts | Requires a notification channel out of budget/scope |
| Trade journal notes & tags per trade | TradeZella-style feature, not needed to prove exchange correctness |
| Visual regression tests | Requires a baseline-image pipeline beyond the $0 budget |
| Performance/load test of the price-cache layer (k6) | Load testing is a different discipline than the functional/manual focus of this role |
| Accessibility audit (axe + manual screen-reader pass) | Valuable but secondary to the trading-correctness story; may be added opportunistically |

## Test Approach

| Level | Tool | From phase | Notes |
|-------|------|-----------|-------|
| Unit tests | Vitest (api + web workspaces) | Phase 1 | Fast, colocated with source; order math, decimal precision and logger redaction get dedicated unit coverage in Phase 4 (AUT-04) |
| Full-stack smoke | `npm run smoke` (`scripts/smoke-dev.mjs`) | Phase 1 | Runs the real `npm run dev`, proves the whole web -> API -> SQLite -> CoinGecko -> logs path end to end |
| Real-browser smoke | The `npm run smoke` browser step in `scripts/smoke-dev.mjs`, using `playwright-core` to drive installed Google Chrome headless | Phase 1 | Badge reads API ok / CoinGecko status with zero page or console errors; 60 s visible poll timing; outage and recovery through Re-check; real timers, no fake clock |
| Manual scripted test cases | `qa/test-cases/<feature>.md` per feature | Phases 2-5 | One table per feature area, written against that phase's requirements before or during implementation, executed and reported per cycle |
| API test collection | Bruno or Postman | Phase 6 | Covers every backend endpoint, auth, and negative cases; runnable in CI |
| Automated e2e smoke | Playwright (TypeScript), with network mocking for 429/stale scenarios | Phase 6 | Sign up -> market buy -> limit order -> cancel -> verify balances; deterministic upstream failure simulation |
| Exploratory testing + UX review | Charter-based session notes | Phase 6 | Time-boxed charters against the trading flow; a separate usability review pass |
| Release and post-release checklists | Manual checklist | Phase 7 | Run once before and once after the production deploy |

Why the real-browser smoke exists from Phase 1: `qa/bugs/BUG-001-health-badge-api-unreachable.md`
passed the Node-environment unit tests and the fetch-only full-stack smoke because Node does not
enforce browser host-object rules (the WebIDL receiver check that a real browser applies to
native timer functions). Phases 2-5 must keep this step green before each phase's UAT. It is a
local Entry Criterion, not a CI job — it needs Google Chrome installed and takes about the
duration recorded in `01-10-SUMMARY.md` (~69 s, dominated by the real-time 60 s poll wait). The
Phase 6 Playwright suite (AUT-02, AUT-03) adds the CI job on the same tool line.

Per-phase QA cycle: write test cases against that phase's requirements -> execute against the
built feature -> file a run report -> raise bug reports for failures -> retest fixed bugs ->
close the cycle in the run report's exit-criteria checklist.

## Risks

Trading-aware risk register. Likelihood and Impact are High / Medium / Low. Requirements and
Phase columns point at what implements and what will test each risk. Two items in this table
(rate limits and stale-price trading rule) are explicitly flagged as open/unverified rather than
asserted as settled.

| ID | Risk | Trading impact | Likelihood | Impact | Test focus | Requirements | Phase |
|----|------|-----------------|------------|--------|------------|---------------|-------|
| R-01 | Decimal precision and rounding errors in balance/quantity math | Wrong balances, wrong fill quantities, silently wrong P&L | Medium | High | Unit tests across representative precisions and rounding boundaries; manual boundary test cases | WAL-03, AUT-04 | 4 |
| R-02 | Fee calculation or display is wrong | User is charged the wrong fee, or the fee shown doesn't match the fee taken | Medium | High | Unit test the 0.1% fee formula; manual verification that the displayed fee matches the fill | TRD-04 | 4 |
| R-03 | Minimum notional (5 USDT), zero/negative and too-many-decimals input not validated | Sub-minimum, negative, or malformed orders are accepted; balances become inconsistent | Medium | High | Boundary and negative test cases at exactly 5 USDT, just below it, zero, negative, and extra-decimal quantities | TRD-03 | 4 |
| R-04 | Stale prices served during a CoinGecko outage without a clear signal to the user | User trades on outdated price data without knowing it | Medium | Medium | Verify `stale: true` flag propagates to the UI banner; manual and mocked-network test cases | DATA-03, MKT-05 | 3 |
| R-05 | Rate limits, 429s and the monthly Demo call cap **(limits unverified — to confirm on the CoinGecko dashboard)** | Health checks or market data calls exhaust the Demo quota, degrading the app for all users | Medium | Medium | Mocked 429 responses; monitor real call volume in Phase 3 caching design; health check budget test in Phase 1 | DATA-02, DATA-03, FND-03 | 1 and 3 |
| R-06 | Limit-order crossing boundary at exactly equal price (buy price == limit, sell price == limit) | Off-by-one crossing logic fills or fails to fill orders that should behave deterministically at the boundary | High | High | Boundary test cases at price == limit exactly, one tick above, one tick below | TRD-06 | 5 |
| R-07 | Locked funds not released, or released incorrectly, on order cancel | User's funds appear permanently locked, or funds are released twice (double-credit) | Medium | High | Cancel-then-check-balance test cases; verify exact locked-amount arithmetic | TRD-05, TRD-07 | 5 |
| R-08 | Concurrency / double-spend on double-click or parallel requests | Same funds spent twice across two near-simultaneous order placements or cancels | Medium | High | Parallel-request test cases (double-click simulation, concurrent API calls) against place/cancel/fill | TRD-08 | 5 |
| R-09 | Cross-user data isolation failure (IDOR) | User A can read or modify User B's wallet, orders, or trades | Low | High | Security test cases: authenticated User A requesting User B's resource IDs directly | AUTH-04 | 2 |
| R-10 | Session handling: session doesn't persist across refresh, or doesn't clear on logout | User is unexpectedly logged out mid-session, or a shared/public machine leaks a session after logout | Medium | Medium | Refresh-persistence and logout-clears-session test cases | AUTH-02, AUTH-03 | 2 |
| R-11 | API key exposure to the browser or in logs | CoinGecko Demo key leaked publicly (this repo is public), enabling key abuse or revocation | Low | High | Structural grep of bundled frontend code and log output for the key pattern; redaction unit test | DATA-01, FND-04 | 1 and 3 |
| R-12 | Average-cost realized/unrealized P&L calculated incorrectly | Reviewer sees wrong profit/loss figures, undermining the whole trading-correctness story | Medium | High | Unit tests for average-cost method across buy/sell sequences; manual verification against hand-calculated expected P&L | ORD-03, ORD-04 | 5 |
| R-13 | Request-ID traceability gaps that would block root-cause analysis | A bug report can't be linked back to a concrete log line, stalling RCA investigation | Low | Medium | Verify every error response and log line carries the same request ID end to end | FND-04, RCA-01 | 1 and 6 |
| R-14 | Account reset has unintended side effects (partial clear, wrong balance after reset) | Reset leaves a user's account in an inconsistent state instead of a clean 10,000 USDT slate | Low | Medium | Reset-then-verify test cases: balance, open orders, and history all clear/reset correctly | WAL-04 | 4 |

Open questions carried from `wiki/pages/concepts/order-rules.md`, deliberately left open rather
than resolved by assumption — each will be settled in the phase that implements it and then
folded into the relevant risk row above:

- Fill price for a crossed limit order: the limit price, or the reference price at check time? (affects R-06)
- Is the trading fee taken in the quote asset or the base asset for buy orders? (affects R-02)
- What is the trading rule when price data is stale — block market orders, or trade anyway with a warning? (affects R-04)

## Environments

| Environment | Details |
|-------------|---------|
| Local dev | Web at `http://localhost:5173`, API at `http://localhost:3000`, SQLite at `api/data/app.db`, logs at `api/logs/api.log`, Node 24, started with `npm run dev` |
| CI | GitHub Actions, `ubuntu-latest`, Node 24, independent jobs: `lint`, `typecheck`, `test` |
| Production | Free hosting; provider to be decided in Phase 7 — **Planned** |
| Browsers | Chrome (latest) is primary; Firefox and Safari get spot checks per cycle. The `npm run smoke` browser step drives the installed Google Chrome directly (via `playwright-core`, `channel: "chrome"`) |
| Viewports | Desktop 1280px and mobile 390px |
| Test data | Fresh accounts created per test run (no shared/reused accounts across test cases) |
| Upstream data source | CoinGecko: either the real Demo API key, or a local stub reachable via `COINGECKO_BASE_URL` for deterministic 429 and stale-price scenarios |

## Entry Criteria

Before a test cycle for a phase begins:

- The phase's requirements are implemented and merged to `main`
- CI is green on the commit under test
- The commit SHA under test is recorded (visible as `commit` in `GET /health`)
- Test cases for the phase are written and reviewed against its requirements
- `npm run smoke` passes on the target environment, including its real-browser step (needs
  Google Chrome installed locally)
- Any known blockers are listed in the run report before execution starts

## Exit Criteria

A test cycle for a phase may close when all of the following hold:

- All P1 test cases and at least 90% of P2 test cases are executed
- 0 open S1 bugs and 0 open S2 bugs
- Every open S3/S4 bug has a filed bug report with a priority and a target phase
- A run report is committed under `qa/runs/`
- Every requirement in the phase maps to at least one executed test case or one passing automated test
- CI is green on the commit the cycle was executed against

## Severity

Definitions with trading-specific examples. Severity measures how bad the defect is; it is set
independently of Priority (see below).

| Severity | Definition | Examples |
|----------|------------|----------|
| S1 Critical | Data loss, financial correctness failure, or a security breach affecting users | Wrong balance after a fill; double-spend on double-click; User A can read User B's wallet; API key visible in the browser |
| S2 Major | A core feature is broken or gives wrong results, but the app is not corrupted | A limit order does not fill when the price crosses the limit; cancel does not release locked funds; the app serves stale prices with no "prices delayed" banner |
| S3 Minor | A visible but non-blocking defect | Wrong sort order for tied values in the markets table; wrong colour for a negative 24h change; the health badge does not re-poll after the tab regains focus |
| S4 Trivial | Cosmetic issue with no functional impact | Typos; misaligned icons; inconsistent spacing |

## Priority

Priority measures how urgently the defect must be fixed; Severity measures how bad the defect
is. The two are set independently, with one fixed project rule: **Every S1 and S2 bug is P1.**
This ties directly to the Exit Criteria above, which require 0 open S1 bugs and 0 open S2 bugs
before a phase can close.

| Priority | Definition |
|----------|------------|
| P1 | Fix before the current phase exits, or before a release |
| P2 | Fix in the current or next phase |
| P3 | Backlog — fix opportunistically, no phase commitment |

Example showing the two axes are independent, using only S3/S4 defects (S1/S2 are never anything
but P1, so they cannot illustrate independence): an S4 typo on the sign-up button that appears in
the reviewer demo is P1 (cosmetic, but actively confusing every reviewer right now); an S3 wrong
colour for a negative 24h change on the markets table is P2; an S3 tie-break sort issue on a
rarely used column is P3.

## Traceability

ID conventions:

- Requirement IDs: `REQUIREMENTS.md` (e.g. `AUTH-01`, `TRD-06`)
- Test cases: `TC-AREA-NNN`, stored one file per feature at `qa/test-cases/<feature>.md`, with a `Req` column linking back to requirement IDs — see `qa/templates/test-case-template.md`
- Run reports: `RUN-YYYY-MM-DD-SCOPE`, stored at `qa/runs/` — see `qa/templates/run-report-template.md`
- Bug reports: `BUG-NNN`, stored at `qa/bugs/BUG-NNN-<slug>.md`, linking a test case (`TC-...`) and a requirement (`REQ`) — see `qa/templates/bug-report-template.md`

Phase 1 automated checks (verified to exist by plan 01-08):

| Requirement | Automated check |
|-------------|------------------|
| FND-01 | `scripts/smoke-dev.mjs` (`npm run smoke`, including the real-browser step) |
| FND-02 | `.github/workflows/ci.yml` |
| FND-03 | `api/src/routes/health.test.ts`, `api/src/lib/coingecko.test.ts`, `web/src/lib/healthPoller.test.ts`, `web/src/lib/api.test.ts` |
| FND-04 | `api/src/app.test.ts`, `api/src/lib/logger.test.ts` |
| MEM-01..04 | `scripts/wiki-lint.mjs` |
| QA-01 | Review of this document |

## Evidence and Defect Workflow

The request-ID evidence thread ties a user-visible error to its root cause:

1. The UI shows the request ID alongside an API error message
2. The browser DevTools Network tab shows the same value in the `X-Request-Id` response header
3. Searching `api/logs/api.log` for that request ID (`grep <requestId> api/logs/api.log`) finds the matching structured log line(s)
4. The bug report quotes the request ID and the relevant log excerpt
5. An RCA write-up (Phase 6) links the log and network evidence to the root cause, the fix, and a regression test

Bugs are canonical as files under `qa/bugs/BUG-NNN-<slug>.md`; a GitHub issue mirror
(`.github/ISSUE_TEMPLATE/bug_report.md`) is optional and, when used, points back to the
canonical file.

**Redaction rule:** never paste API keys, session cookies, or Authorization headers into
screenshots, HAR files, or log/network excerpts attached to a bug report or GitHub issue. The
API redacts these from its own structured logs, but browser-captured evidence (screenshots,
HAR exports, DevTools copies) is not redacted automatically — the reporter must redact manually
before posting, especially because this repository is public.

## Deliverables and Status

Only Phase 1 artifacts are Done. Every other artifact is Planned and will be delivered in the
phase that implements the requirement it tests — no run results, coverage numbers, or pass
rates exist yet for any of them.

| Artifact | Requirement | Phase | Status |
|----------|-------------|-------|--------|
| `qa/TEST-PLAN.md` (this document) | QA-01 | 1 | Done (Phase 1) |
| `qa/templates/test-case-template.md` | QA-01 | 1 | Done (Phase 1) |
| `qa/templates/run-report-template.md` | QA-01 | 1 | Done (Phase 1) |
| `qa/templates/bug-report-template.md` | QA-01 | 1 | Done (Phase 1) |
| `.github/ISSUE_TEMPLATE/bug_report.md` | QA-01 | 1 | Done (Phase 1) |
| Phase 1 automated checks (smoke incl. real-browser step, CI, health/logger tests, wiki lint) | FND-01..04, MEM-01..04 | 1 | Done (Phase 1) |
| `qa/bugs/BUG-001-health-badge-api-unreachable.md` | FND-01 | 1 | Fixed (Phase 1), retest in UAT re-run |
| Manual test cases — Auth | QA-02 | 2 | Planned (Phase 2) |
| Manual test cases — Markets & Market Data | QA-03 | 3 | Planned (Phase 3) |
| Manual test cases — Wallet & market orders | QA-04 | 4 | Planned (Phase 4) |
| Manual test cases — Limit orders & history | QA-05 | 5 | Planned (Phase 5) |
| Exploratory session notes + UX review | QA-06 | 6 | Planned (Phase 6) |
| Bug reports | QA-07 | 6 | Planned (Phase 6) (BUG-001 already filed from Phase 1 UAT) |
| API test collection | AUT-01 | 6 | Planned (Phase 6) |
| Playwright smoke suite | AUT-02 | 6 | Planned (Phase 6) |
| Playwright network-mocked edge cases | AUT-03 | 6 | Planned (Phase 6) |
| Order-math unit tests | AUT-04 | 4 | Planned (Phase 4) |
| RCA write-ups | RCA-01 | 6 | Planned (Phase 6) |
| Release + post-release checklists | QA-08 | 7 | Planned (Phase 7) |

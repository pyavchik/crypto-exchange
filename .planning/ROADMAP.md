# Roadmap: CoinGecko Paper Exchange

## Overview

Build a Binance-style paper-trading exchange as vertical slices — every feature phase delivers **FE + BE + manual test cases** together, so the QA story grows alongside the product. Phase 1 lays the monorepo, logging (for later RCA) and the LLM Wiki memory. Phases 2–5 add accounts, live markets, wallet + market orders, then limit orders + history. Phase 6 is a dedicated QA hardening pass (API tests, Playwright, exploratory testing, bug reports, RCA write-ups). Phase 7 ships the live demo with a reviewer-oriented README.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation & Project Memory** - Monorepo, CI, health + structured logs, LLM Wiki, test strategy (completed 2026-09-16)
- [x] **Phase 2: Accounts** - Sign up / login / logout, per-user isolation, 10k USDT grant (completed 2026-09-16)
- [ ] **Phase 3: Live Markets** - CoinGecko proxy + cache + stale handling, markets table, trade page chart
- [ ] **Phase 4: Wallet & Market Orders** - Balances, decimal-safe market buy/sell with fees and validation
- [ ] **Phase 5: Limit Orders & History** - Limit orders with locked funds, fill-on-cross, cancel, order/trade history, P&L
- [ ] **Phase 6: QA Hardening** - API collection, Playwright suite with mocks, exploratory sessions, bug reports, RCA
- [ ] **Phase 7: Ship** - Free-tier deploy, demo account, reviewer README, release checklists

## Phase Details

### Phase 1: Foundation & Project Memory

**Goal**: A running skeleton (web + api) with CI and traceable logs, plus the wiki memory and test strategy every later phase builds on
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, MEM-01, MEM-02, MEM-03, MEM-04, QA-01
**Success Criteria** (what must be TRUE):

  1. `npm run dev` starts web and api; the web page shows API health status
  2. CI goes green on GitHub for lint, typecheck and unit tests
  3. Every API response carries an `X-Request-Id` that can be found in the JSON logs
  4. `wiki/index.md`, `wiki/log.md`, `wiki/SCHEMA.md` exist and the job posting + CoinGecko notes are ingested
  5. `qa/TEST-PLAN.md` defines scope, risks, severity/priority and entry/exit criteria

**Plans**: 11/11 plans executed

Plans:

- [x] 01-01-PLAN.md
- [x] 01-02-PLAN.md
- [x] 01-03-PLAN.md
- [x] 01-04-PLAN.md
- [x] 01-05-PLAN.md
- [x] 01-06-PLAN.md
- [x] 01-07-PLAN.md
- [x] 01-08-PLAN.md
- [x] 01-09-PLAN.md — Gap closure: health poller timer receiver fix + programming-error separation (G-01-1..3)
- [x] 01-10-PLAN.md — Gap closure: real-browser step in `npm run smoke` (playwright-core + installed Chrome) + favicon (G-01-2..4)
- [x] 01-11-PLAN.md — Gap closure: BUG-001, wiki finding/tech-stack update, TEST-PLAN priority + browser-check docs (G-01-4)

**Wave 1**

- [x] 01-01: BE+FE — Monorepo scaffold (Vite React TS, Node TS API, SQLite), `/health`, request-ID logging, CI

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02: MEM — LLM Wiki structure, schema, initial ingests, CLAUDE.md wiki rules

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03: QA — Test strategy / test plan, bug report + test case templates

### Phase 2: Accounts

**Goal**: Users can create an account and hold a private, pre-funded demo wallet
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, QA-02
**Success Criteria** (what must be TRUE):

  1. User can sign up, log in, refresh and stay logged in, and log out
  2. Invalid signups (bad email, short password, duplicate email) show clear errors
  3. A new user sees exactly 10,000 USDT; user A cannot fetch user B's data via the API
  4. Auth test cases are written, executed, and results recorded

**Plans**: 5/5 plans executed

Plans:

- [x] 02-01-PLAN.md — Tracer: sign up in a real browser and land on a funded wallet (schema, scrypt, session cookie, atomic 10k grant, auth bootstrap, smoke proof)
- [x] 02-02-PLAN.md — BE: login, logout, wallet endpoint, per-field validation, isolation and exactly-once proofs
- [x] 02-03-PLAN.md — FE: login screen, route guards, Log out on every page, inline field errors
- [x] 02-04-PLAN.md — Integration: full real-browser auth journey in `npm run smoke`, repo green, wiki decision page
- [x] 02-05-PLAN.md — QA: auth test cases (incl. isolation/IDOR) + executed run report + test plan update

**Wave 1**

- [x] 02-01: Tracer — one vertical signup slice wired through every layer and proven in Chrome

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02: BE — account lifecycle, validation, isolation and exactly-once proofs
- [x] 02-03: FE — login, guards, logout control, inline errors *(parallel with 02-02, no shared files)*

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04: Integration — browser journey, green repo, project memory

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05: QA — write and execute the auth cases, file the run report

### Phase 3: Live Markets

**Goal**: Users see live, rate-limit-safe CoinGecko market data in a Binance-like markets and trade view
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, MKT-01, MKT-02, MKT-03, MKT-04, MKT-05, QA-03
**Success Criteria** (what must be TRUE):

  1. Markets table lists the curated pairs with price, 24h %, volume, market cap; search and sort work
  2. Trade page shows a 1D/7D/30D chart for the selected pair
  3. The CoinGecko key does not appear anywhere in browser network traffic
  4. When CoinGecko returns 429 or times out, the UI shows cached prices with a "prices delayed" banner
  5. Market data test cases are written and executed

**Plans**: 5/5 plans executed

Plans:

- [x] 03-01-PLAN.md — Tracer: keyed TTL cache + dedupe, CoinGecko markets client, `GET /api/markets`, formatting module, markets table, real-browser key-exposure proof
- [x] 03-02-PLAN.md — BE: stale-serve fallback with request-id logging, deterministic TTL seam, chart series, `GET /api/markets/:id/chart` with curated-list validation
- [x] 03-03-PLAN.md — FE: shared receiver-safe poller, 30s visibility-aware refresh, client-side search/sort, prices-delayed banner
- [x] 03-04-PLAN.md — FE: `lightweight-charts` controller, trade page with 1D/7D/30D chart, and the real-browser proof of the chart, interactions and degraded path
- [x] 03-05-PLAN.md — QA: market-data test cases + executed run report, verified rate limits in TEST-PLAN, wiki decision record

**Wave 1**

- [x] 03-01: Tracer — one vertical slice from the CoinGecko client to a rendered markets table, proven in Chrome

**Wave 2** (parallel — no file overlap)

- [x] 03-02: BE expansion — stale serving and the chart endpoint
- [x] 03-03: FE expansion — polling, search, sort, stale banner

**Wave 3**

- [x] 03-04: Trade page, chart, and the full real-browser proof

**Wave 4**

- [ ] 03-05: QA execution and project memory

### Phase 4: Wallet & Market Orders

**Goal**: Users can buy and sell at market with correct, decimal-safe balances and fees
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: WAL-01, WAL-02, WAL-03, WAL-04, TRD-01, TRD-02, TRD-03, TRD-04, AUT-04, QA-04
**Success Criteria** (what must be TRUE):

  1. User can market-buy by USDT amount or quantity and market-sell owned assets
  2. Wallet shows available/locked/total per asset and total value in USDT
  3. Orders violating balance, min notional or precision rules are rejected with clear messages
  4. Fee of 0.1% is shown on each fill and balances reconcile to the cent in unit tests
  5. Wallet & market order test cases are written and executed

**Plans**: 4 plans

Plans:

- [ ] 04-01: BE — Balances ledger, decimal math library, market order engine, fees, validation rules
- [ ] 04-02: BE — Unit tests for order math (fees, rounding, min notional)
- [ ] 04-03: FE — Buy/sell panel, wallet page, confirmations, error and empty states, reset account
- [ ] 04-04: QA — Wallet & market order test cases (boundary values, rounding, fees) + execution report

### Phase 5: Limit Orders & History

**Goal**: Users can manage limit orders and review a correct history of orders, trades and P&L
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: TRD-05, TRD-06, TRD-07, TRD-08, ORD-01, ORD-02, ORD-03, ORD-04, QA-05
**Success Criteria** (what must be TRUE):

  1. Placing a limit order locks funds; cancelling releases them exactly
  2. A limit order fills automatically when the reference price crosses its limit
  3. Double-submitting or concurrent requests cannot double-spend a balance
  4. Open orders, order history and trade history display correct statuses, fees and realized/unrealized P&L
  5. Limit order & history test cases are written and executed

**Plans**: 4 plans

Plans:

- [ ] 05-01: BE — Limit order placement, fund locking, cancel, idempotency keys / transactions
- [ ] 05-02: BE — Fill-on-cross worker driven by price refresh; average-cost P&L
- [ ] 05-03: FE — Limit order form, open orders / order history / trade history tabs, P&L display
- [ ] 05-04: QA — Limit order & P&L test cases (crossing boundaries, cancel races) + execution report

### Phase 6: QA Hardening

**Goal**: The product is covered by an API test collection, a Playwright smoke suite, exploratory testing, documented bugs and RCA write-ups
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: AUT-01, AUT-02, AUT-03, QA-06, QA-07, RCA-01
**Success Criteria** (what must be TRUE):

  1. API collection runs in CI and covers every endpoint including negative and auth cases
  2. Playwright smoke suite (sign up → buy → limit → cancel → balances) passes in CI
  3. 429/stale scenarios are reproduced deterministically via network mocking
  4. Exploratory session notes, UX review and bug reports with evidence exist in `qa/`
  5. At least 3 RCA write-ups link logs/network evidence to the fix and regression test

**Plans**: 4 plans

Plans:

- [ ] 06-01: QA — API test collection (Bruno/Postman) + CI job
- [ ] 06-02: QA — Playwright TS smoke suite with page objects and network mocks + CI job
- [ ] 06-03: QA — Exploratory sessions, UX review, bug reports
- [ ] 06-04: QA — RCA investigations and write-ups; fixes + regression tests

### Phase 7: Ship

**Goal**: Reviewers can click a link, log in with a demo account, and find every QA artifact within a minute
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: SHIP-01, SHIP-02, SHIP-03, QA-08
**Success Criteria** (what must be TRUE):

  1. App is live on a public URL on free hosting
  2. Demo credentials on the landing page log straight into a seeded account
  3. README gives a 60-second tour, architecture diagram and links to all QA artifacts
  4. Release and post-release smoke checklists are executed against production and recorded

**Plans**: 2 plans

Plans:

- [ ] 07-01: BE+FE — Deploy (web + api + SQLite volume), env secrets, seed demo account
- [ ] 07-02: QA — Release checklist, production smoke run, reviewer README

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Project Memory | 11/11 | Complete    | 2026-09-16 |
| 2. Accounts | 5/5 | Complete    | 2026-09-16 |
| 3. Live Markets | 5/5 | In Progress|  |
| 4. Wallet & Market Orders | 0/4 | Not started | - |
| 5. Limit Orders & History | 0/4 | Not started | - |
| 6. QA Hardening | 0/4 | Not started | - |
| 7. Ship | 0/2 | Not started | - |

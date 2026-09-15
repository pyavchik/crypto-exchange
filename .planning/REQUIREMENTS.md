# Requirements: CoinGecko Paper Exchange

**Defined:** 2026-09-15
**Core Value:** A reviewer can open the live demo, place a trade, and then open the QA docs and see a rigorous, trading-aware test effort against that exact flow — balances, orders and P&L must be correct and demonstrably tested.

Tracks: **FE** = frontend (React+TS), **BE** = backend (Node+TS, SQLite), **QA** = manual tests & test automation. Every feature phase ships FE + BE + QA together.

## v1 Requirements

### Foundation (FND)

- [x] **FND-01**: Developer can run web + api locally with one command (monorepo: `web/`, `api/`, `qa/`)
- [x] **FND-02**: CI runs lint, typecheck and unit tests on every push to GitHub
- [x] **FND-03**: API exposes `GET /health` returning version and upstream (CoinGecko) status
- [x] **FND-04**: API writes structured JSON logs with a request ID that is also returned in a response header (enables log-based RCA)

### Project Memory (MEM)

- [x] **MEM-01**: `wiki/` follows Karpathy's LLM Wiki pattern: `raw/` (immutable sources), wiki pages (LLM-owned), `SCHEMA.md` (conventions)
- [x] **MEM-02**: `wiki/index.md` catalogs every wiki page by category and is updated on every ingest
- [x] **MEM-03**: `wiki/log.md` is an append-only log with parseable prefixes (`INGEST`, `QUERY`, `LINT`, `DECISION`)
- [x] **MEM-04**: Project instructions (`CLAUDE.md`) tell the agent to consult and update the wiki at phase boundaries

### Authentication (AUTH)

- [ ] **AUTH-01** [FE+BE]: User can sign up with email and password (validation: email format, password ≥ 8 chars, duplicate email rejected)
- [ ] **AUTH-02** [FE+BE]: User can log in and stay logged in across browser refresh (httpOnly session cookie)
- [ ] **AUTH-03** [FE+BE]: User can log out from any page
- [ ] **AUTH-04** [BE]: A user can never read or modify another user's wallet, orders or trades (authorization enforced server-side)
- [ ] **AUTH-05** [FE+BE]: New account is credited 10,000 USDT virtual balance exactly once

### Market Data (DATA)

- [ ] **DATA-01** [BE]: API proxies CoinGecko; the Demo API key is never sent to the browser
- [ ] **DATA-02** [BE]: API caches market responses (TTL ≈ 30–60 s) so any number of clients stays within Demo rate limits
- [ ] **DATA-03** [BE+FE]: On upstream 429/timeout the API serves last cached data flagged `stale: true`, and the UI shows a "prices delayed" banner
- [ ] **DATA-04** [BE]: Tradable pairs are a curated list (e.g. top 20 by market cap) quoted in USDT

### Markets (MKT)

- [ ] **MKT-01** [FE]: User can view a markets table: coin, last price, 24h change %, 24h volume, market cap
- [ ] **MKT-02** [FE]: User can search markets by name or symbol
- [ ] **MKT-03** [FE]: User can sort markets by price, 24h change and volume
- [ ] **MKT-04** [FE]: User can open a pair's trade page showing a price chart (1D / 7D / 30D)
- [ ] **MKT-05** [FE]: Prices auto-refresh without page reload and show "last updated" time; "Powered by CoinGecko" attribution visible

### Wallet (WAL)

- [ ] **WAL-01** [FE+BE]: User can see balances per asset: available, locked (in open orders), total
- [ ] **WAL-02** [FE+BE]: User can see total portfolio value in USDT at current prices
- [ ] **WAL-03** [BE]: All money/quantity math uses decimal arithmetic with defined precision per asset; no floating-point errors
- [ ] **WAL-04** [FE+BE]: User can reset their demo account back to 10,000 USDT (clears orders and trades)

### Trading (TRD)

- [ ] **TRD-01** [FE+BE]: User can place a market buy by quote amount (USDT) or base quantity; fills at current reference price
- [ ] **TRD-02** [FE+BE]: User can place a market sell of an owned asset
- [ ] **TRD-03** [FE+BE]: Orders are rejected with a clear message for: insufficient balance, below minimum notional (5 USDT), invalid/zero/negative quantity, too many decimals
- [ ] **TRD-04** [BE]: A 0.1% trading fee is applied and shown on every fill
- [ ] **TRD-05** [FE+BE]: User can place a limit buy/sell; required funds are locked while the order is open
- [ ] **TRD-06** [BE]: Open limit orders fill when the reference price crosses the limit (buy: price ≤ limit; sell: price ≥ limit), checked on each price refresh
- [ ] **TRD-07** [FE+BE]: User can cancel an open limit order; locked funds are released
- [ ] **TRD-08** [BE]: Placing/cancelling/filling is atomic and idempotent — double-click or concurrent requests cannot double-spend

### Orders & History (ORD)

- [ ] **ORD-01** [FE+BE]: User can view open orders (pair, side, type, price, qty, filled, time)
- [ ] **ORD-02** [FE+BE]: User can view order history with status (filled, cancelled, rejected)
- [ ] **ORD-03** [FE+BE]: User can view trade history with fill price, fee and realized P&L per sell (average-cost method)
- [ ] **ORD-04** [FE+BE]: User can see unrealized P&L per held asset

### Manual QA (QA)

- [x] **QA-01**: Test strategy / test plan document (scope, risks, environments, entry/exit criteria, severity & priority definitions)
- [ ] **QA-02**: Manual test cases for Auth (positive, negative, security/isolation) with traceability to AUTH-*
- [ ] **QA-03**: Manual test cases for Markets & Market Data incl. stale data, rate limit and attribution checks
- [ ] **QA-04**: Manual test cases for Wallet & market orders incl. precision/rounding, fees, min notional, insufficient balance
- [ ] **QA-05**: Manual test cases for limit orders & history incl. crossing logic, cancel, locked funds, P&L correctness
- [ ] **QA-06**: Exploratory testing session notes (charter-based) and a UX/usability review of the trading flow
- [ ] **QA-07**: Bug reports for every defect found (steps, expected/actual, severity, evidence: screenshot + network/log excerpt)
- [ ] **QA-08**: Release checklist + post-release smoke checklist for the live deployment

### API & Automated Tests (AUT)

- [ ] **AUT-01**: API test collection (Bruno or Postman) covering all backend endpoints, auth, and negative cases, runnable in CI
- [ ] **AUT-02**: Playwright (TypeScript) smoke suite: sign up → market buy → limit order → cancel → verify balances
- [ ] **AUT-03**: Playwright tests use network mocking to reproduce CoinGecko 429/stale scenarios deterministically
- [ ] **AUT-04**: Backend unit tests for order math (fees, rounding, crossing, average-cost P&L)

### Root Cause Analysis (RCA)

- [ ] **RCA-01**: At least 3 L3-style investigation write-ups (symptom → reproduction → logs/network evidence → root cause → fix → regression test)

### Ship (SHIP)

- [ ] **SHIP-01**: App deployed to free hosting with a public URL
- [ ] **SHIP-02**: Seeded demo account so reviewers can log in instantly
- [ ] **SHIP-03**: README aimed at reviewers: 60-second tour, architecture diagram, links to every QA artifact, how to run tests

## v2 Requirements

Deferred. Tracked but not in current roadmap.

- **V2-01**: Simulated order book / depth chart and recent trades ticker
- **V2-02**: Stop-limit orders
- **V2-03**: Watchlist / favourite pairs
- **V2-04**: Price alerts
- **V2-05**: Trade journal notes & tags per trade (TradeZella-style)
- **V2-06**: Visual regression tests
- **V2-07**: Performance/load test of the price-cache layer (k6)
- **V2-08**: Accessibility audit (axe + manual screen-reader pass)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real money, deposits, withdrawals, KYC | Legal/custody burden; paper trading only |
| User-to-user matching engine | CoinGecko provides no order book; fills simulated vs reference price |
| Futures, margin, leverage, staking | Scope creep; spot trading demonstrates the core flows |
| OAuth, 2FA, email verification | Email+password suffices to demonstrate auth testing |
| Native mobile apps | Responsive web is enough for reviewers |
| Real-time tick data / WebSockets from exchange | Demo API is REST with upstream caching |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| MEM-01 | Phase 1 | Complete |
| MEM-02 | Phase 1 | Complete |
| MEM-03 | Phase 1 | Complete |
| MEM-04 | Phase 1 | Complete |
| QA-01 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| QA-02 | Phase 2 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| DATA-04 | Phase 3 | Pending |
| MKT-01 | Phase 3 | Pending |
| MKT-02 | Phase 3 | Pending |
| MKT-03 | Phase 3 | Pending |
| MKT-04 | Phase 3 | Pending |
| MKT-05 | Phase 3 | Pending |
| QA-03 | Phase 3 | Pending |
| WAL-01 | Phase 4 | Pending |
| WAL-02 | Phase 4 | Pending |
| WAL-03 | Phase 4 | Pending |
| WAL-04 | Phase 4 | Pending |
| TRD-01 | Phase 4 | Pending |
| TRD-02 | Phase 4 | Pending |
| TRD-03 | Phase 4 | Pending |
| TRD-04 | Phase 4 | Pending |
| AUT-04 | Phase 4 | Pending |
| QA-04 | Phase 4 | Pending |
| TRD-05 | Phase 5 | Pending |
| TRD-06 | Phase 5 | Pending |
| TRD-07 | Phase 5 | Pending |
| TRD-08 | Phase 5 | Pending |
| ORD-01 | Phase 5 | Pending |
| ORD-02 | Phase 5 | Pending |
| ORD-03 | Phase 5 | Pending |
| ORD-04 | Phase 5 | Pending |
| QA-05 | Phase 5 | Pending |
| AUT-01 | Phase 6 | Pending |
| AUT-02 | Phase 6 | Pending |
| AUT-03 | Phase 6 | Pending |
| QA-06 | Phase 6 | Pending |
| QA-07 | Phase 6 | Pending |
| RCA-01 | Phase 6 | Pending |
| SHIP-01 | Phase 7 | Pending |
| SHIP-02 | Phase 7 | Pending |
| SHIP-03 | Phase 7 | Pending |
| QA-08 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-15*
*Last updated: 2026-09-15 after initial definition*

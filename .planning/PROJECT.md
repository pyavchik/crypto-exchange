# CoinGecko Paper Exchange

## What This Is

A Binance-style **simulated (paper-trading) crypto exchange**: users sign up, get a virtual USDT balance, browse live markets, and place market and limit orders priced from the free CoinGecko Demo API. It is a portfolio project for a **Senior QA Engineer (TradeZella) application at Railsware**. The app is the system under test; the **QA artifacts** (manual test plan, test cases, bug reports, API tests, Playwright e2e, root-cause write-ups) are the headline deliverable.

## Core Value

A reviewer can open the live demo, place a trade, and then open the QA docs and see a rigorous, trading-aware test effort against that exact flow — balances, orders and P&L must be correct and demonstrably tested.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Markets page: live coin list from CoinGecko with price, 24h change, search, sort
- [ ] Trade page: price chart + buy/sell panel with market and limit orders
- [ ] Limit orders fill when the CoinGecko price crosses the limit price
- [ ] Wallet: virtual starting balance (10,000 USDT), per-asset balances, total portfolio value
- [ ] Orders: open orders (cancellable), order history, trade history with realized P&L
- [ ] Accounts: email/password sign-up and login; each user has an isolated wallet
- [ ] Backend proxies and caches CoinGecko (API key never reaches the browser; rate limits respected)
- [ ] Manual QA pack: test plan, test cases, checklists, exploratory session notes, bug reports
- [ ] API test collection for the backend (and CoinGecko edge cases: 429, timeouts, bad input)
- [ ] Playwright (TypeScript) smoke e2e suite for critical trading flows
- [ ] Root-cause-analysis write-ups in L3-support ticket style (log + network evidence)
- [ ] Live demo on free hosting + public GitHub repo with a reviewer-oriented README
- [ ] Project memory maintained as an LLM Wiki (Karpathy pattern)

### Out of Scope

- Real money, deposits/withdrawals, KYC — legal/custody burden; paper trading only
- Real user-to-user order-book matching engine — CoinGecko has no order book; fills are simulated against reference price (a cosmetic simulated order book is allowed)
- Futures, margin, leverage, staking — scope creep; spot only
- Mobile apps — responsive web is sufficient for reviewers
- OAuth / 2FA / email verification — email+password is enough to demonstrate auth testing

## Context

- **Target job:** Railsware, Senior QA Engineer for TradeZella (trading journal product), posted 2026-08-31. Emphasises manual + end-to-end testing, UX/usability validation, requirements analysis (defects, confusions, edge cases), L3 root-cause investigation, log analysis, HTTP/API/web architecture knowledge, Git, AI tools in workflow, hands-on trading experience. Nice-to-have: **Playwright (TypeScript)**. Source: `wiki/raw/railsware-senior-qa-tradezella.md`.
- **Data source:** CoinGecko Demo API — base `https://api.coingecko.com/api/v3/`, header `x-cg-demo-api-key`. Useful endpoints: `/coins/markets`, `/simple/price`, `/coins/{id}/market_chart`, `/coins/{id}/ohlc`, `/search`, `/search/trending`. Free tier is rate-limited (≈30 calls/min, ≈10k calls/month — verify on dashboard) and data is cached upstream (~60 s), so prices are near-real-time, not tick data. Attribution ("Powered by CoinGecko") expected on free tier — verify.
- **Testing opportunities to design in deliberately:** decimal precision/rounding, insufficient balance, min order size, stale-price handling, upstream 429/timeout, limit order crossing logic, concurrent orders, session expiry, cross-user data isolation.
- **Tooling:** Planned with GSD Core (`.planning/`). Long-lived project knowledge kept in `wiki/` following Karpathy's LLM Wiki pattern (raw sources → LLM-maintained wiki → schema), with `wiki/index.md` and append-only `wiki/log.md`.

## Constraints

- **Budget**: $0 — CoinGecko Demo key, free-tier hosting and database
- **Tech stack**: React + TypeScript (Vite) frontend; Node + TypeScript backend; SQLite; Playwright TS — one language across app and automation, matches the job's nice-to-have
- **Rate limits**: All CoinGecko calls go through a backend cache — the UI must never call CoinGecko directly, and polling must stay within Demo limits
- **Money math**: Balances and quantities use decimal-safe arithmetic (no floating-point) — correctness is what the QA story is about
- **Audience**: Reviewers spend minutes, not hours — demo account, seeded data and a README that links straight to QA artifacts

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Simulated paper-trading exchange, Binance-style UI | CoinGecko is market data only; real exchange needs licensing ([wiki](../wiki/pages/decisions/paper-trading-scope.md)) | — Pending |
| Limit orders fill on reference-price cross (no matching engine) | Deterministic, testable, fits available data ([wiki](../wiki/pages/decisions/limit-order-fill-model.md)) | — Pending |
| React+TS / Node+TS / SQLite | Single language; aligns with Playwright TS ([wiki](../wiki/pages/decisions/tech-stack.md)) | — Pending |
| Backend proxy + cache for CoinGecko | Hide API key, respect rate limits, enable 429/timeout testing ([wiki](../wiki/pages/decisions/coingecko-proxy.md)) | — Pending |
| QA artifacts are first-class deliverables with their own phase(s) | Target role is QA, not dev ([wiki](../wiki/pages/decisions/qa-first-class.md)) | — Pending |
| LLM Wiki (Karpathy) for project memory in `wiki/` | User preference; persistent compounding knowledge ([wiki](../wiki/pages/decisions/llm-wiki-memory.md)) | — Pending |
| Deploy on free hosting + public repo | Reviewers can click through ([wiki](../wiki/pages/decisions/free-hosting-public-repo.md)) | — Pending |
| Request-ID JSON logs, lazy 5-min-cached `/health`, Markdown QA docs, public repo from day one | Traceable evidence for RCA; protect Demo call budget; reviewer-readable ([wiki](../wiki/pages/decisions/foundation-skeleton-conventions.md)) | — Pending (Phase 1) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-15 after initialization*

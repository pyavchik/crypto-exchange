---
title: Paper-trading exchange scope (Binance-style UI, no real money)
type: decision
updated: 2026-09-15
sources: []
related: [[project-overview]], [[coingecko-api]], [[order-rules]]
---

# Paper-trading exchange scope

**Status:** Accepted (project init, 2026-09-15). Recorded in `.planning/PROJECT.md` Key Decisions row
1.

## Context

CoinGecko's Demo API is market data only — no order book, no custody, no way to run a real
exchange. Building this as a real-money exchange would require licensing and custody
infrastructure far outside a portfolio project's scope.

## Decision

- Build a simulated (paper-trading) exchange with a Binance-style UI: users sign up, get a
  virtual USDT balance, and place market/limit orders priced from CoinGecko reference prices
  ([[coingecko-api]]).
- Spot trading only; a cosmetic simulated order book is allowed for visual fidelity, but there
  is no real user-to-user matching engine ([[order-rules]]).
- Out of scope per `.planning/REQUIREMENTS.md`: real money, deposits/withdrawals, KYC, a real
  matching engine, futures/margin/leverage/staking, native mobile apps,
  OAuth/2FA/email verification.

## Consequences

- No custody risk, no regulatory burden — the project can ship as a public demo.
- Since nothing real is at stake financially, the QA story is entirely about *correctness*:
  balances, fills and P&L must be provably right, which is exactly what the target QA role
  tests for.
- Every "trade" is simulated against a reference price, not a live counterparty, so all trading
  tests are deterministic and reproducible.

---
title: Order & balance rules
type: concept
updated: 2026-09-15
sources: []
related: [[coingecko-api]], [[market-data-caching]], [[qa-portfolio-alignment]]
---

# Order & balance rules

Initial rules from REQUIREMENTS.md (WAL-*, TRD-*, ORD-*). These are the test oracle for QA-04/QA-05.

- Starting balance 10,000 USDT, granted once per account; reset restores it.
- Decimal-safe math only; per-asset precision defined in config.
- Market order: fills at current reference price; buy by USDT amount or base quantity.
- Fee: 0.1% of notional on every fill.
- Minimum notional: 5 USDT. Reject: insufficient balance, zero/negative, too many decimals.
- Limit order: locks funds while open. Buy fills when price ≤ limit; sell fills when price ≥ limit. Checked on each price refresh.
- Cancel releases locked funds exactly.
- Place/cancel/fill must be atomic and idempotent (no double-spend).
- Realized P&L: average-cost method. Unrealized P&L per held asset at current price.

## Open questions (resolve during phase discussion)
- Fill price for a crossed limit: the limit price or the reference price at check time?
- Fee taken in quote or base asset for buys?
- Behaviour when price data is stale ([[market-data-caching]]).

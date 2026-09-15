---
title: CoinGecko API (Demo plan)
type: entity
updated: 2026-09-15
sources: [raw/2026-09-15-coingecko-demo-api.md]
related: [[market-data-caching]], [[order-rules]]
---

# CoinGecko API (Demo plan)

Free market-data source for the exchange. **Market data only** — no order book, no trading.

- Base URL `https://api.coingecko.com/api/v3/`; key in header `x-cg-demo-api-key` (backend only — never the browser).
- Billing: each HTTP 200 costs 1 monthly credit.
- Endpoints we use: `/coins/markets` (markets table), `/simple/price` (reference price for fills),
  `/coins/{id}/market_chart` or `/ohlc` (trade page chart), `/search` (optional).
- Limits (unverified): ≈30 calls/min, ≈10k calls/month, ≈60 s upstream cache, attribution expected.

## Implications
- All calls go through the backend cache → [[market-data-caching]].
- Prices are reference prices refreshed ~every minute, so limit orders fill on cross, not on ticks → [[order-rules]].
- 429 and timeouts are realistic → deliberate test scenarios (QA-03, AUT-03).

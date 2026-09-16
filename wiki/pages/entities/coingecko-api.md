---
title: CoinGecko API (Demo plan)
type: entity
updated: 2026-09-16
sources: [raw/2026-09-15-coingecko-demo-api.md]
related: [[market-data-caching]], [[market-data-cache-and-stale]], [[order-rules]]
---

# CoinGecko API (Demo plan)

Free market-data source for the exchange. **Market data only** — no order book, no trading.

- Base URL `https://api.coingecko.com/api/v3/`; key travels **only** as the header
  `x-cg-demo-api-key` (backend only — never the browser, and never as the alternative
  `?x_cg_demo_api_key=` query-parameter form, which CoinGecko's own docs warn risks exposure in
  logs and browser history).
- Billing: each HTTP 200 costs 1 monthly credit; 4xx/5xx responses still count toward the
  per-minute rate limit even though they consume no monthly credit.
- Endpoints this project calls (Phase 3): `GET /coins/markets` (the markets table; params
  `vs_currency=usd&order=market_cap_desc&per_page=25&page=1&sparkline=false&price_change_percentage=24h`)
  and `GET /coins/{id}/market_chart` (the trade-page chart; params `vs_currency=usd&days=1|7|30`).
  `/simple/price` and `/ohlc` remain candidates for a future phase, not yet called.
- **`vs_currency=usdt` is rejected** — verified live 2026-09-16: `400 {"error":"invalid
  vs_currency"}`, and "usdt" is absent from the live `/simple/supported_vs_currencies` list (63
  entries checked). Every upstream call in this project uses `vs_currency=usd`; "USDT" pairs are
  this project's own 1:1 display convention on top of that, not a literal upstream currency — see
  [[market-data-cache-and-stale]].
- **`market_chart`'s auto-granularity** (when `interval` is omitted, which this project always
  does — `1m`/`5m` are Enterprise-only): 5-minute samples for `days=1`, hourly for `days=2-90`,
  daily beyond that. Response shape: `{ prices, market_caps, total_volumes }`, each an array of
  `[millisecond_timestamp, value]` pairs — only `prices` is consumed here.
- **Verified Demo plan limits (2026-09-16):** **100 calls/min, 10,000 call credits/month**,
  cross-checked directly against `docs.coingecko.com/docs/errors-and-rate-limits` and
  `coingecko.com/en/api/pricing`. An older "≈30 calls/min" figure still circulating in
  search-indexed support content is superseded by these two directly-fetched official pages.
- **The upstream's own error body shape is undocumented.** A real 429 captured live this session
  returned `{"status":{"error_code":429,"error_message":"..."}}"` (plus an undocumented
  `retry-after` header) — CoinGecko has never committed to this shape in writing, so this
  project's classification logic keys on the HTTP status code alone, never on parsing the body.
- Attribution ("Powered by CoinGecko") expected on the free tier — implemented as a footer/page
  link throughout the app.

## Implications
- All calls go through the backend cache → [[market-data-caching]], [[market-data-cache-and-stale]].
- Prices are reference prices refreshed on the cache's own TTL (not tick data), so limit orders
  fill on cross, not on ticks → [[order-rules]].
- 429 and timeouts are realistic → deliberately reproduced via a local stub, never the real API
  (D-51) → deterministic test scenarios (QA-03, AUT-03).

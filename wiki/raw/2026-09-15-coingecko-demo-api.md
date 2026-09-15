# Raw source: CoinGecko Demo API docs (notes)

- URLs: https://docs.coingecko.com/v3.0.1/reference/authentication · https://docs.coingecko.com/llms.txt
- Captured: 2026-09-15 (extracted via web fetch)

## Confirmed from docs
- Base URL: `https://api.coingecko.com/api/v3/`
- Auth header (recommended): `x-cg-demo-api-key`; query param alternative: `x_cg_demo_api_key`
- "Each successful request (HTTP 200) deducts 1 credit from your monthly quota."
- "Monthly credits and rate limits depend on your plan" (numbers not on that page)
- Demo endpoints relevant to an exchange UI:
  - `/simple/price` — coin price by IDs, symbols or names
  - `/coins/markets` — coins list with market data
  - `/coins/{id}/market_chart` and `/coins/{id}/market_chart/range` — historical chart data
  - `/coins/{id}/ohlc` — OHLC chart
  - `/search`, `/search/trending`
  - `/exchange_rates` — BTC-to-currency rates

## Not confirmed (from prior knowledge — verify on dashboard/pricing page)
- Demo rate limit ≈ 30 calls/min; ≈ 10,000 calls/month
- Upstream cache ≈ 60 s on Demo
- Attribution ("Powered by CoinGecko") expected for free usage

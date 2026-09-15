# API Coverage — CoinGecko Demo API

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Surface source: the Demo reference section of https://docs.coingecko.com/llms.txt (checked 2026-09-15), plus `wiki/raw/2026-09-15-coingecko-demo-api.md` and `wiki/pages/entities/coingecko-api.md`. Pro-only endpoints (Recently Added Coins, API Usage) are not part of the Demo surface and are not listed. Phase 1 uses CoinGecko only for the `GET /health` upstream status (D-04, D-05, D-08); every market-data capability is picked up by the phase that needs it.

| capability | decision | reason |
|---|---|---|
| auth via x-cg-demo-api-key request header | INTEGRATE | Phase 1 — header sent server-side only on the /ping call; key never in logs or the browser (D-08, plans 01-01, 01-03) |
| auth via x_cg_demo_api_key query parameter | OPT-OUT | explicitly out of scope — the key stays in the header so it can never appear in a logged URL (D-08, RESEARCH Pitfall 5) |
| GET /ping (API server status) | INTEGRATE | Phase 1 — lazy upstream status for GET /health with a 5-minute SQLite cache and ok/degraded/down/not_configured (D-04, D-05, plans 01-01, 01-04) |
| GET /simple/price | OPT-OUT | not needed yet — Phase 4 market-order fills at the current reference price (TRD-01) and Phase 5 fill-on-cross checks on each price refresh (TRD-06) |
| GET /coins/markets | OPT-OUT | not needed yet — Phase 3 markets table with price, 24h change, volume and market cap for the curated USDT pairs (MKT-01, MKT-03, DATA-04) |
| GET /coins/{id}/market_chart | OPT-OUT | not needed yet — Phase 3 trade page 1D/7D/30D price chart (MKT-04) |
| GET /coins/{id}/market_chart/range | OPT-OUT | not needed yet — Phase 3 chart alternative for MKT-04; Phase 3 planning picks one chart endpoint |
| GET /coins/{id}/ohlc | OPT-OUT | not needed yet — Phase 3 chart candidate for MKT-04 (listed in wiki coingecko-api) |
| GET /search | OPT-OUT | not needed yet — Phase 3 candidate for market search (MKT-02); Phase 3 may filter the curated pair list locally instead |
| GET /coins/list (coin id map) | OPT-OUT | not needed yet — Phase 3 candidate for mapping curated pair symbols to CoinGecko coin ids (DATA-04) |
| GET /search/trending (trending search list) | OPT-OUT | not needed — no roadmap requirement shows trending coins; tradable pairs are a fixed curated list (DATA-04) |
| GET /simple/supported_vs_currencies | OPT-OUT | not needed — every pair is quoted in USDT (DATA-04), so the quote currency is fixed |
| GET /exchange_rates | OPT-OUT | not needed — no fiat or BTC conversion requirement; portfolio value is shown in USDT only (WAL-02) |
| GET /coins/{id} (coin data by id) | OPT-OUT | not needed — markets table fields come from /coins/markets (MKT-01); no coin detail page exists in the roadmap |
| GET /coins/{id}/tickers | OPT-OUT | not needed — per-venue tickers are irrelevant; fills are simulated against one reference price per pair |
| GET /coins/{id}/history | OPT-OUT | not needed — no historical snapshot requirement; charts use the chart endpoints (MKT-04) |
| token contract address endpoints (price, coin data, market charts) | OPT-OUT | explicitly out of scope — curated pairs are identified by coin id, never by on-chain contract address (DATA-04) |
| GET /asset_platforms | OPT-OUT | explicitly out of scope — no on-chain platform or token-address handling in a spot paper exchange |
| categories (categories list, categories with market data) | OPT-OUT | not needed — no category filter in any requirement; the markets table shows a curated list (DATA-04) |
| exchanges family (list, names, by id, tickers, volume chart) | OPT-OUT | explicitly out of scope — the app is its own simulated venue; no requirement shows third-party exchange data |
| derivatives family (derivatives, exchanges list, exchange by id, tickers) | OPT-OUT | explicitly out of scope — futures, margin and leverage are excluded in REQUIREMENTS.md Out of Scope |
| NFTs family (list, collection by id, by contract address) | OPT-OUT | explicitly out of scope — spot crypto pairs only; no NFT requirement |
| real world assets family (RWA list, markets, by id, issuers) | OPT-OUT | explicitly out of scope — tradable pairs are crypto assets quoted in USDT (DATA-04) |
| public treasury family (holdings by coin, entities, charts, transactions) | OPT-OUT | not needed — no requirement shows corporate or entity treasury holdings |
| global market data (global, global DeFi) | OPT-OUT | not needed — no requirement shows global market cap or DeFi statistics |
| onchain DEX data (GeckoTerminal networks, pools, tokens, OHLCV, trades) | OPT-OUT | explicitly out of scope — DEX pool data is not part of a spot paper exchange priced from reference prices |

The phase that builds a "not needed yet" capability (Phase 3 plan 03-01 for the market-data rows, Phase 4 for /simple/price) starts from this matrix and re-decides that row as INTEGRATE.

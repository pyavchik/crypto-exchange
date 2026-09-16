# Phase 3: Live Markets - Research

**Researched:** 2026-09-16
**Domain:** CoinGecko Demo API (market data + chart endpoints), server-side TTL cache + in-flight dedupe generalized to multiple keyed resources, TradingView `lightweight-charts` in React 19, stale-data serving
**Confidence:** MEDIUM-HIGH (the CoinGecko endpoint shapes, rate limits and key-handling facts are cross-checked against two-to-three directly-fetched official docs pages AND three live, unauthenticated API probes made this session — including a real captured 429 body/headers and a real `invalid vs_currency` rejection of `usdt`; the `lightweight-charts` version/license/React pattern are corroborated by the official GitHub Pages docs, the npm registry, and the `gsd-tools` package-legitimacy gate; the riskiest in-repo fact — the Vitest browser-receiver-timer test pattern this phase must reuse for the market poller — was read directly from `healthPoller.test.ts` this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**API key handling (USER DECISION — answer 1a)**
- **D-35:** The app is **keyless-capable**. It sends `x-cg-demo-api-key` when `COINGECKO_API_KEY` is set and falls back to unauthenticated public endpoints when it is not; the health badge keeps reporting `not_configured` honestly in that case. No code path requires the key to exist. **Rationale:** the user can add, rotate or remove a key without a code change, CI and any fresh clone work with no secret, and the key stays a deployment concern.
  - A Demo key IS configured locally in `api/.env` (gitignored, never committed, never sent to the browser — DATA-01). Verified working on 2026-09-16: authenticated `/ping` returned 200 and `/coins/markets` returned live data.
  - **The key must never reach the browser.** Every CoinGecko call is server-side; the FE only ever talks to our own API. Success criterion 3 is proven by inspecting real browser network traffic, not by reading code.

**Curated pair list (USER DECISION — answer 2a)**
- **D-36:** The tradable set is the **top 20 by market cap, fetched dynamically** from CoinGecko and cached, quoted against USDT (DATA-04). **Consequence the user accepted:** the list changes over time, so Phase 4-5 tests must not hardcode "the top 20 are X" — they pin whatever the cache currently holds, or stub the upstream. Record this explicitly for the later phases.
  - Stablecoins that appear in the top 20 (USDT itself, USDC, DAI…) are still listed; a USDT/USDT pair is nonsensical and must be excluded from the tradable set.

**Chart (USER DECISION — answer 3a)**
- **D-37:** Use **TradingView `lightweight-charts`** for the 1D/7D/30D price chart (MKT-04) — it gives the Binance-like feel the project is aiming at. It is a new runtime dependency, so it goes through the same Package Legitimacy Audit `playwright-core` did, and a blocking human gate before install if the audit turns up anything unexpected. Data comes from CoinGecko's `market_chart` range endpoints through our own API, never called from the browser.

**Caching and rate limits**
- **D-38:** Market data is cached server-side with a **45s TTL** (DATA-02 asks for 30-60s), so any number of browser clients collapses into at most one upstream call per TTL window per resource. Chart series are cached longer — **10 minutes for 7D/30D, 2 minutes for 1D** — since their shape barely moves within a TTL and they are the most expensive calls. **[ASSUMED]**
- **D-39:** Concurrent cache misses for the same resource are **deduplicated in flight** (one upstream call, all waiters share it), extending the pattern already proven in `api/src/lib/coingecko.ts` (T-01-17). This is what actually protects the Demo quota under a burst, not the TTL alone.
- **D-40:** The FE polls our own API (never CoinGecko) on a **30s interval, only while the tab is visible**, reusing the Phase 1 visibility-aware poller discipline — including its lesson that browser-only behavior must be proven in a real browser (`wiki/pages/findings/health-poller-illegal-invocation.md`). "Last updated" shows the data's `fetchedAt`, not the time of the local request. **[ASSUMED]**

**Stale behavior (DATA-03)**
- **D-41:** On upstream 429, timeout or 5xx, the API serves the **last good cached payload** with `stale: true` plus the original `fetchedAt`, rather than failing. Only when there is no cached data at all does it return an error envelope (D-09 shape).
- **D-42:** `stale: true` drives a visible **"prices delayed" banner** naming how old the data is. Staleness is a property of the payload, not a separate endpoint, so every consumer sees it.
- **D-43:** Serving stale data is never silent server-side: it is logged with the request ID and the upstream failure reason, so an RCA can reconstruct what happened (FND-04, RCA-01).

**API shape**
- **D-44:** New endpoints are public (no session required) — market data is not user-specific, and `/markets` must render for a logged-out visitor (D-28 kept `/markets` public). They live under `/api/markets` and `/api/markets/:id/chart`, returning the D-09 error envelope on failure and carrying `fetchedAt` + `stale` on success. **[ASSUMED]**
- **D-45:** The coin id in a path is validated against the cached curated list before any upstream call, so the endpoint cannot be used as an open proxy to arbitrary CoinGecko paths.

**Frontend**
- **D-46:** The markets table (MKT-01/02/03) does search and sort **client-side** over the cached top-20 payload — 20 rows needs no server round-trip, and it keeps interactions instant. Sorting covers price, 24h % and volume; search matches name or symbol, case-insensitive.
- **D-47:** Money and percentage formatting is centralized in one module so Phase 4-5 reuse it: prices to a sensible per-magnitude precision, 24h change with sign and colour (green/red on the dark shell), volume and market cap abbreviated (1.2B). No floating-point arithmetic on money — display formatting only; decimal-safe math arrives with WAL-03. **[ASSUMED]**
- **D-48:** "Powered by CoinGecko" attribution stays visible (MKT-05) — the footer link from Phase 1 already satisfies it; the trade page additionally attributes chart data.

**QA (QA-03)**
- **D-49:** `qa/test-cases/markets.md` (IDs `TC-MKT-NNN`) covering: table contents and formatting, search, sort (including ties and negative values), auto-refresh and "last updated", the 1D/7D/30D chart, the stale banner via a forced upstream failure, attribution, and **a browser-network assertion that the API key never appears in any request the browser makes** (success criterion 3).
- **D-50:** Executed into `qa/runs/RUN-YYYY-MM-DD-markets.md`; failures filed as `qa/bugs/BUG-NNN-*.md`. An unexecuted case file does not satisfy QA-03 (same rule as D-33).
- **D-51:** Deterministic upstream failures (429, timeout, malformed body) are exercised against a **local stub** via `COINGECKO_BASE_URL`, which `scripts/smoke-dev.mjs` already supports — never by hammering the real CoinGecko API into rate-limiting us.

### Claude's Discretion
- Cache implementation (in-memory map vs the existing SQLite table), exact endpoint payload shapes, chart component structure, table component structure, and how the curated list is refreshed.

### Deferred Ideas (OUT OF SCOPE)
Placing orders, wallet mutations, fees, P&L (Phases 4-5); a real order book or depth chart (v2, explicitly deferred in TEST-PLAN.md); WebSocket/streaming prices (CoinGecko Demo is REST); per-user watchlists or alerts (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | API proxies CoinGecko; the Demo API key is never sent to the browser | §Key Handling (Pattern 1), live-probe-verified 429 body shows no key echoed even server-side; §Pitfalls #7 (URL log field never carries the key) |
| DATA-02 | API caches market responses (TTL ≈ 30-60s) so any number of clients stays within Demo rate limits | §Caching + In-Flight Dedupe (Pattern 2), §Rate Limits (verified 100/min, 10k/mo), §Common Pitfalls #1 (monthly-budget math for R-05) |
| DATA-03 | On upstream 429/timeout the API serves last cached data flagged `stale: true`; UI shows a banner | §Stale-Data Pattern (Pattern 3), verified live 429 body/headers to build an accurate local stub |
| DATA-04 | Tradable pairs are a curated list (top 20 by market cap) quoted in USDT | §CoinGecko `/coins/markets` (Pattern 1), **verified finding**: `vs_currency=usdt` is rejected — must request `usd` and treat it as the USDT quote by convention |
| MKT-01 | Markets table: coin, last price, 24h change %, 24h volume, market cap | §`/coins/markets` response shape (live-verified), §Number Formatting pitfall |
| MKT-02 | Search markets by name or symbol | §Frontend Patterns — client-side filter (D-46) |
| MKT-03 | Sort markets by price, 24h change, volume | §Common Pitfalls #5 (null-safe sort comparator) |
| MKT-04 | Trade page price chart (1D/7D/30D) | §`lightweight-charts` (Pattern 4-6), §`market_chart`/`market_chart/range` (Pattern 1), §Package Legitimacy Audit |
| MKT-05 | Auto-refresh + "last updated"; CoinGecko attribution visible | §Poller reuse (Pattern 7, Common Pitfalls #4), §Attribution (lightweight-charts NOTICE requirement) |
| QA-03 | Manual test cases for Markets & Market Data incl. stale data, rate limit and attribution checks | §Validation Architecture, §D-51 stub-based determinism, existing `qa/test-cases/auth.md`/`qa/templates/*` conventions |
</phase_requirements>

## Summary

CoinGecko's Demo plan is a single well-documented REST API (`https://api.coingecko.com/api/v3`), and this session's live probes settle every open fact this phase needed: the Demo/keyless rate limit is **100 calls/min with a 10,000 call/month credit cap** (cross-checked across two directly-fetched official pages, superseding an older "30 calls/min" figure still floating around search-indexed support content), the key goes in the `x-cg-demo-api-key` **header only**, `/coins/markets` and `/coins/{id}/market_chart` return exactly the shapes this session captured live, and — critically — **`vs_currency=usdt` is rejected by the API** (`400 {"error":"invalid vs_currency"}`, confirmed by a direct call and against the live `/simple/supported_vs_currencies` list). D-36's "quoted against USDT" must therefore be implemented as `vs_currency=usd` plus a 1:1 USDT≈USD display convention, not a literal upstream parameter — this is the single most load-bearing correction this research makes to CONTEXT.md's assumptions and the planner should treat it as authoritative, not open for re-litigation.

The backend work is a generalization, not a rewrite: `api/src/lib/coingecko.ts`'s TTL-cache-plus-in-flight-dedupe pattern (T-01-17) is exactly right, but it is currently hard-wired to one resource (`/ping`) with one module-scoped `inFlight` variable and one "latest row" DB query. Phase 3 needs the same shape keyed by resource (`markets`, `chart:{id}:{window}`) — a `Map<key, {cached, inFlight}>` — plus a new failure-classification layer that, unlike `classifyPing`, must **serve the last-good cached payload with `stale: true`** instead of just recording "down" (D-41). This session's live 429 capture (`retry-after: 53` header, `{"status":{"error_code":429,"error_message":"..."}}"` body, `server: cloudflare`) gives the local stub (D-51) an accurate shape to imitate, though the classification logic should key only on HTTP status (mirroring `classifyPing`'s existing discipline of never trusting response-body shape) since CoinGecko's own docs never commit to that body format.

`lightweight-charts` 5.2.1 (Apache-2.0, TradingView's official npm package, 777k weekly downloads, no `postinstall` script) is an imperative canvas library, not a React component — the correct integration is `useEffect` creating the chart once via `createChart`/`addSeries` and returning a cleanup that calls `chart.remove()`, with a `window`-resize listener calling `chart.applyOptions({ width })` (this is the pattern shown verbatim in TradingView's own React tutorial, fetched this session). Its `Time` values must be **UTCTimestamp in seconds, not milliseconds** — CoinGecko's `market_chart` arrays are `[ms_timestamp, value]` pairs, so every point needs `Math.floor(ms / 1000)`, and the series requires strictly ascending, unique timestamps. The library also carries its own attribution requirement independent of D-48's CoinGecko credit — its Apache-2.0 NOTICE file requires a link to tradingview.com, which the default `attributionLogo: true` layout option satisfies automatically; do not disable it without adding an equivalent link elsewhere.

**Primary recommendation:** Extend `coingecko.ts`'s proven TTL+dedupe pattern into a keyed `Map`-based cache serving `GET /api/markets` (single shared resource, `vs_currency=usd&order=market_cap_desc&per_page=20`) and `GET /api/markets/:id/chart?window=1d|7d|30d` (per-coin, per-window keys, validated against the cached curated list before any upstream call per D-45); build the stale-serve layer as a thin wrapper that falls back to the last-good value on any non-2xx/timeout rather than a new failure mode; and mount `lightweight-charts` via a single `useEffect` with `chart.remove()` cleanup and a resize listener, feeding it CoinGecko's `market_chart` pairs converted to seconds.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CoinGecko HTTP calls (markets, chart) | API / Backend | — | DATA-01 requires the key and every upstream call stay server-side; the browser never talks to CoinGecko |
| TTL cache + in-flight dedupe (keyed by resource) | API / Backend | — | Generalizes the existing `coingecko.ts` pattern; protects the shared Demo quota regardless of browser client count (D-38/D-39) |
| Stale-fallback decision (`stale: true`, `fetchedAt`) | API / Backend | — | The payload's staleness is computed once server-side and shipped as data, not recomputed per client (D-41/D-42) |
| Curated top-20 list refresh + validation | API / Backend | Database / Storage | The list itself is a cached CoinGecko response; validating a path `:id` against it (D-45) is a backend authorization-adjacent concern (prevents open-proxy abuse) |
| Markets table search/sort | Browser / Client | — | D-46: 20 rows is client-side-instant; no server round-trip per keystroke or sort click |
| Price chart rendering (`lightweight-charts`) | Browser / Client | — | An imperative canvas library — mount/teardown/resize is inherently a browser-lifecycle concern (D-37) |
| Auto-refresh polling (30s, visibility-aware) | Browser / Client | API / Backend | The FE poller only ever calls our own API (D-40); the API's cache is what actually bounds upstream calls, not the poller's cadence |
| "Prices delayed" banner | Browser / Client | API / Backend | Purely a rendering of the `stale` flag the API already computed (D-42) — no client-side staleness logic of its own |
| CoinGecko + TradingView attribution | Browser / Client | — | Static, presentational; driven by D-48 and the `lightweight-charts` NOTICE requirement, not by any runtime data |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lightweight-charts` | 5.2.1, published 2026-08-12 `[VERIFIED: npm view lightweight-charts version/time.modified, this session]` | 1D/7D/30D price line/area chart on the trade page | TradingView's own official package (D-37, USER DECISION); Apache-2.0; 777,522 downloads/week `[VERIFIED: api.npmjs.org/downloads/point, this session]`; no `postinstall` script `[VERIFIED: npm view lightweight-charts scripts.postinstall, this session — empty]` |
| `fastify` (existing) | 5.12.4 | New `GET /api/markets`, `GET /api/markets/:id/chart` routes | Already the project's API framework; reuse the `healthRoutes`/Fastify-schema conventions from `api/src/routes/health.ts` |
| Node global `fetch`/`AbortSignal.timeout` (existing) | Node 24.14.0 | Upstream HTTP calls to CoinGecko | Already what `coingecko.ts`'s `performCheck` uses (no new HTTP client needed) |
| `react` / `react-router` (existing) | 19.3.0 / 8.4.0 | Markets table, Trade page, chart wrapper component | Already the project's FE stack; `lightweight-charts` is framework-agnostic and mounts via a plain `useEffect`, not a React-specific chart wrapper package |

### Supporting
No new backend packages — the cache/dedupe/stale-serve layer is hand-rolled on top of `coingecko.ts`'s existing pattern (Node built-ins only), consistent with the project's "don't add a dependency for something ~60 lines of code already proven in-repo" precedent from 02-RESEARCH.md.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lightweight-charts` (D-37, locked) | `recharts`, `visx`, `d3` directly, `chart.js` | Already decided by the user for the Binance-like feel; general-purpose charting libraries need much more hand-built code to get a financial-chart look, and none carry TradingView's specific candlestick/line-series ergonomics |
| Hand-rolled keyed `Map` cache | A generic caching library (e.g. `lru-cache`) | The existing `coingecko.ts` pattern (TTL + in-flight dedupe via a plain `Map`) is ~80 lines, already proven, and the project's precedent (02-RESEARCH.md) is to avoid a dependency for something this small and already working |
| SQLite-backed cache table (extending `upstream_checks`'s pattern) | Pure in-memory `Map` | In-memory resets on every process restart (acceptable — a cold cache just means the first request after restart pays one upstream call, not a stampede, thanks to dedupe) vs DB-backed survives restarts but adds write-amplification for a value that's rebuilt every 45s-10min anyway; **left as Claude's Discretion per CONTEXT.md** — see Pitfall #2 for the tradeoff detail |
| Server computing `stale` purely from `now() - fetchedAt > TTL` | A separate "freshness" endpoint | D-42 requires staleness to travel with the payload as data, not be re-derived per client — computing it once at serve time (not per-request client-side) is simpler and matches the existing `getStatus()` cache-hit path in `coingecko.ts` |

**Installation:**
```bash
npm install lightweight-charts --workspace=web
```

**Version verification:** `npm view lightweight-charts version` → `5.2.1`, `time.modified` → `2026-08-12T11:37:41.838Z` `[VERIFIED: npm registry, this session]`.

## Package Legitimacy Audit

| Package | Registry | Age (last publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|--------------|-------------|---------|-------------|
| `lightweight-charts` | npm | 2026-08-12 | 777,522 | github.com/tradingview/lightweight-charts | OK `[VERIFIED: gsd-tools package-legitimacy check]` | Approved |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none — `lightweight-charts` is published by the `tradingview` GitHub org (matches the well-known TradingView product), 777k weekly downloads, Apache-2.0, no `postinstall` script `[VERIFIED: npm view lightweight-charts scripts.postinstall, this session — empty]`. CONTEXT.md's D-37 already flags this as a "blocking human gate before install if the audit turns up anything unexpected" — nothing unexpected turned up, so the planner may proceed without an extra `checkpoint:human-verify` gate specifically for legitimacy (though D-37's own text still calls for one; the planner should decide whether the clean audit satisfies it or a lightweight confirmation is still warranted per CONTEXT.md's literal wording).

Per the package-name provenance rule: `lightweight-charts` was named directly in a **USER DECISION** (D-37), not discovered by this research session via WebSearch/training data — so the `[VERIFIED]` tag on the registry/GitHub-org match above is earned (an authoritative source — the npm registry entry's own `repository.url` pointing at the official `tradingview` GitHub org — corroborates the user's chosen name), not merely asserted.

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────────┐   GET /api/markets                    ┌──────────────────────────────────────────────┐
│  Browser (React SPA)           │   GET /api/markets/:id/chart?window=  │  Fastify API (api/)                           │
│                                 │──────────────────────────────────────▶│  ┌──────────────────────────────────────────┐ │
│  MarketsTable (D-46: client-    │   (no credentials needed — D-44,      │  │ routes/markets.ts                        │ │
│  side search/sort over cached   │   public route, no session cookie)    │  │  GET /api/markets  -> marketDataService  │ │
│  top-20 payload)                │                                       │  │   .getMarkets()                          │ │
│                                 │◀──────────────────────────────────────│  │  GET /api/markets/:id/chart -> validate  │ │
│  TradeChart (lightweight-charts │   { data: [...], fetchedAt, stale }   │  │   :id against cached curated list (D-45) │ │
│  mounted in useEffect, D-37)    │                                       │  │   -> marketDataService.getChart(id,win)  │ │
│                                 │                                       │  └──────────────┬────────────────────────────┘ │
│  Poller (D-40: reuses           │                                       │                 │                              │
│  healthPoller.ts's visibility-  │                                       │  ┌──────────────▼────────────────────────────┐ │
│  aware discipline, 30s while    │                                       │  │ lib/marketData.ts (extends coingecko.ts's  │ │
│  visible)                       │                                       │  │ T-01-17 pattern)                          │ │
│                                 │                                       │  │  Map<cacheKey, {cached, inFlight}>        │ │
│  "Prices delayed" banner (D-42, │                                       │  │  cacheKey = "markets" |                   │ │
│  renders payload.stale)         │                                       │  │    "chart:{id}:{1d|7d|30d}"               │ │
│                                 │                                       │  │  on upstream failure: serve last-good     │ │
└───────────────────────────────┘                                       │  │    cached value + stale:true (D-41),      │ │
                                                                          │  │    log request id + reason (D-43)         │ │
                                                                          │  └──────────────┬────────────────────────────┘ │
                                                                          │                 │ x-cg-demo-api-key header     │
                                                                          │                 │ (never in URL/query, D-35)   │
                                                                          │  ┌──────────────▼────────────────────────────┐ │
                                                                          │  │ CoinGecko Demo API                        │ │
                                                                          │  │  GET /coins/markets?vs_currency=usd...    │ │
                                                                          │  │  GET /coins/{id}/market_chart?days=...    │ │
                                                                          │  │  (COINGECKO_BASE_URL stub seam, D-51)     │ │
                                                                          │  └────────────────────────────────────────────┘ │
                                                                          └──────────────────────────────────────────────┘
```

### Recommended Project Structure
```
api/src/
├── lib/
│   ├── coingecko.ts        # existing ping/health service — unchanged
│   └── marketData.ts       # NEW — keyed cache/dedupe/stale-serve for markets + chart
├── routes/
│   └── markets.ts          # NEW — GET /api/markets, GET /api/markets/:id/chart

web/src/
├── lib/
│   ├── api.ts               # extend with fetchMarkets(), fetchChart(id, window)
│   ├── marketsPoller.ts      # NEW — reuses healthPoller.ts's shape (visibility-aware, 30s)
│   └── format.ts             # NEW — D-47: centralized money/% formatting module
├── components/
│   ├── MarketsTable.tsx      # NEW — MKT-01/02/03
│   ├── PriceChart.tsx        # NEW — lightweight-charts wrapper (Pattern 4-6)
│   └── StaleBanner.tsx       # NEW — D-42
└── pages/
    ├── Markets.tsx           # NEW — replaces the ComingSoon placeholder (App.tsx:114-118)
    └── Trade.tsx              # NEW — replaces the ComingSoon placeholder (App.tsx:119-127)
```

### Pattern 1: CoinGecko `/coins/markets` — exact parameters and a live-captured response
**What:** The single call that backs the entire markets table (MKT-01) and the curated top-20 list (DATA-04).
**Verified parameters** `[CITED: docs.coingecko.com/reference/coins-markets, fetched this session]`:

| Parameter | Required | Notes |
|---|---|---|
| `vs_currency` | Yes | **Must be `usd`, not `usdt`** — see the verified finding below |
| `order` | No | `market_cap_desc` (default) gives the top-N directly, no client-side re-sort needed for the initial fetch |
| `per_page` | No | 1-250, default 100 — set to `20` to get exactly the curated set in one call |
| `page` | No | Default 1 |
| `sparkline` | No | Default `false`; **no credit cost either way** — credits are flat-rate per call regardless of parameters (see §Rate Limits) — but leave it `false` since this phase's chart comes from `market_chart`, not the sparkline field, and a `false` value keeps the payload smaller |
| `price_change_percentage` | No | Comma-separated of `1h,24h,7d,14d,30d,200d,1y` — request `24h` only; MKT-01 needs only 24h change |

**Verified finding (falsifies a literal reading of D-36): `vs_currency=usdt` is rejected.**
```bash
$ curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usdt&per_page=1&page=1"
{"error":"invalid vs_currency"}
HTTP_STATUS:400
```
`[VERIFIED: live unauthenticated API call, this session]`. Cross-checked against the live supported list:
```bash
$ curl -s "https://api.coingecko.com/api/v3/simple/supported_vs_currencies"
["btc","eth","ltc","bch","bnb","eos","xrp","xlm","link","dot","yfi","sol","usd", ... ]
```
`[VERIFIED: live unauthenticated API call, this session — full 63-entry array captured, "usdt" absent]`. **Implication for D-45/DATA-04:** request `vs_currency=usd` and treat the result as the USDT quote by the project's own stablecoin-peg convention (1 USDT ≈ $1) — this is an implementation detail, not a contradiction of D-36's product decision to display pairs as `<COIN>/USDT`; it just means the upstream call itself is always in USD.

**Live-captured response shape** (2 entries, `sparkline=false`, `price_change_percentage=24h`):
```json
[
  {
    "id": "bitcoin", "symbol": "btc", "name": "Bitcoin",
    "image": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400",
    "current_price": 75755, "market_cap": 1521766040123, "market_cap_rank": 1,
    "fully_diluted_valuation": 1521769828420, "total_volume": 39122950768,
    "high_24h": 77163, "low_24h": 75038,
    "price_change_24h": -1174.6699812207517, "price_change_percentage_24h": -1.53973,
    "market_cap_change_24h": -23338846668.16333, "market_cap_change_percentage_24h": -1.5105,
    "circulating_supply": 20085093.0, "total_supply": 20085143.0, "max_supply": 21000000.0,
    "ath": 126080, "ath_change_percentage": -39.91497, "ath_date": "2025-10-06T10:57:42.000Z",
    "atl": 67.81, "atl_change_percentage": 111618.41229, "atl_date": "2013-07-05T16:00:00.000Z",
    "roi": null, "last_updated": "2026-09-16T09:14:20.000Z",
    "price_change_percentage_24h_in_currency": -1.53973
  },
  {
    "id": "ethereum", "symbol": "eth", "name": "Ethereum",
    "current_price": 2400.26, "market_cap": 292987353189, "market_cap_rank": 2,
    "max_supply": null, "roi": { "times": 41.37, "currency": "btc", "percentage": 4137.13 },
    "last_updated": "2026-09-16T09:14:20.000Z"
  }
]
```
`[VERIFIED: live unauthenticated API call to /coins/markets, this session — abbreviated; every field name and its type is exactly as shown]`. Note `roi` is `null` for Bitcoin and a populated object for Ethereum, and `max_supply` is `null` for Ethereum — schemas for the markets response MUST treat both as nullable, and MKT-01/03's price/volume/market-cap fields are never null for large-cap coins in this dataset but the sort comparator should still be defensive (see Pitfall #5).

### Pattern 2: CoinGecko chart endpoints — which one, granularity, and response shape
**What:** Backs the 1D/7D/30D chart (MKT-04).
**`GET /coins/{id}/market_chart`** `[CITED: docs.coingecko.com/reference/coins-id-market-chart, fetched this session]`:

| Parameter | Required | Notes |
|---|---|---|
| `vs_currency` | Yes | `usd` (same finding as Pattern 1 — `usdt` is not a valid `vs_currency` anywhere in the API) |
| `days` | Yes | Integer or `"max"` — use `1`, `7`, `30` for the three windows |
| `interval` | No | `1m`/`5m` are **Enterprise-only**; `hourly` and `daily` are available on the Demo plan, but **omitting `interval` and letting CoinGecko auto-select is the recommended default** |
| `precision` | No | `full` or `0`-`18` — leave unset (default) and let the FE's formatting module (D-47) decide display precision, not the API |

**Auto-granularity on the Demo/Public plan (when `interval` is omitted):**

| `days` requested | Granularity actually returned |
|---|---|
| `1` | 5-minute intervals |
| `2`-`90` | Hourly |
| `>90` | Daily (00:00 UTC) |

`[CITED: docs.coingecko.com/reference/coins-id-market-chart, fetched this session]` — so `days=1` (1D window) returns roughly 288 points, `days=7` returns roughly 168 points, `days=30` returns roughly 720 points. This matters for both payload size and for `lightweight-charts`' ascending-unique-timestamp requirement (Pitfall #6).

**`GET /coins/{id}/market_chart/range`** `[CITED: docs.coingecko.com/reference/coins-id-market-chart-range, fetched this session]` takes `from`/`to` (Unix timestamps or `YYYY-MM-DD`) instead of `days`, with the same auto-granularity table. **Recommendation: use `market_chart` with `days`, not `market_chart/range`** — the three windows this phase needs (1D/7D/30D) map directly onto `days=1|7|30` with no need to compute `from`/`to` boundaries, and `market_chart` is one fewer thing to get wrong (no timestamp-arithmetic bugs). Reserve `market_chart/range` only if a future phase needs an arbitrary custom date range.

**Response shape (both endpoints, identical):**
```json
{
  "prices": [[1757980800000, 75755.12], [1757981100000, 75812.44], ...],
  "market_caps": [[1757980800000, 1521766040123], ...],
  "total_volumes": [[1757980800000, 39122950768], ...]
}
```
`[CITED: docs.coingecko.com/reference/coins-id-market-chart(-range), fetched this session]` — each entry is `[number, number]`: a **millisecond** Unix timestamp and the value. Only `prices` is needed for MKT-04's line/area chart; the schema for the chart endpoint response should type all three arrays (or narrow the upstream call to omit unused ones if CoinGecko supported it — it does not, all three always come back together) but the FE only consumes `prices`.

### Pattern 3: Rate limits — verified numbers, and what a real 429 looks like
**Verified current Demo plan limits** (two independent official pages, fetched directly this session, in agreement):
- **100 calls/min**, **10,000 call credits/month** `[CITED: docs.coingecko.com/docs/errors-and-rate-limits, fetched this session — "100 calls/min" for the Demo plan]` `[CITED: coingecko.com/en/api/pricing, fetched this session — Demo tier: "100" calls/min, "10k" call credits/mo]`.
- A **flat 1 credit per successful (HTTP 200) call**, regardless of parameters (`sparkline=true`, multiple `price_change_percentage` timeframes, etc. cost the same 1 credit) — surfaced via WebSearch summary of `support.coingecko.com/hc/en-us/articles/13962109374489` (direct `WebFetch` to `support.coingecko.com` returned HTTP 403 this session, so this specific claim is **not independently confirmed by direct fetch** — treat as `[CITED]` with lower confidence than the two directly-fetched pages above; worth a spot-check if the exact credit-accounting model becomes load-bearing).
- **`4xx`/`5xx` responses still count toward the per-minute rate limit** even though they don't consume a monthly credit `[CITED: docs.coingecko.com/docs/common-errors-rate-limit, fetched this session — "all requests count toward your per-minute rate limit — including 4xx and 5xx errors"]`.
- Older search-indexed content (a `support.coingecko.com` FAQ article surfaced only via WebSearch snippets, not independently fetched) still states a **legacy "30 calls/min" figure** for the Demo/registered tier and "5-15 calls/min" for fully keyless access. Both directly-fetched official pages checked this session (`errors-and-rate-limits` and `pricing`) supersede this with **100 calls/min** — the current numbers should be cited as `docs.coingecko.com/docs/errors-and-rate-limits` and `coingecko.com/en/api/pricing`, both dated by this research session (2026-09-16), when updating `qa/TEST-PLAN.md` R-05. **This resolves R-05's "unverified" flag.**

**A real 429, captured live this session** (unauthenticated request, after this session's own probing tripped the keyless per-IP limit):
```
HTTP/2 429
content-type: application/json
content-length: 187
retry-after: 53
cache-control: private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0
server: cloudflare

{"status":{"error_code":429,"error_message":"You've exceeded the Rate Limit. Please visit https://www.coingecko.com/en/api/pricing to subscribe to our API plans for higher rate limits."}}
```
`[VERIFIED: live unauthenticated API call, this session]`. Two things worth noting for D-51's local stub and for how the backend should classify failures:
1. **`retry-after` IS present** (53 seconds here) even though neither official docs page documents it — a genuine case where direct observation adds information the docs are silent on. The stale-serve path does not need to honor it (D-41 just serves last-good immediately), but it's useful context if a future phase adds backoff.
2. **The error body is CoinGecko-specific (`{"status":{"error_code","error_message"}}`), not the D-09 envelope** and not documented in the official pages — classification logic should key **only on HTTP status code** (429/5xx/timeout), exactly like `classifyPing` already does, never on parsing this body. This sidesteps the fact that CoinGecko has never committed to this shape in writing.

### Pattern 4: `x-cg-demo-api-key` header — the only acceptable choice (DATA-01)
**Verified: two ways to send the Demo key, header is the only safe one.**
- Header: `x-cg-demo-api-key: <key>` (hyphens) — `[CITED: docs.coingecko.com/v3.0.1/reference/authentication, fetched this session]`
- Query parameter: `?x_cg_demo_api_key=<key>` (underscores) — same page, explicitly marked as the non-recommended alternative: "Avoid query string parameters in production — they risk exposing your key in logs and browser history."

**Why header-only is the only acceptable choice here, concretely:**
- `api/src/lib/coingecko.ts:69-72` (existing, unchanged pattern to extend) already sends the key as a header, never in the URL — this is what `marketData.ts` must copy exactly.
- The request-log line already only logs `url` (the path, no query string with the key) — verified in `coingecko.ts:103-117`, the `logFields` object logs `url: "${baseUrl}/ping"`, a string built with no query parameters at all. Extending this to `/coins/markets?vs_currency=usd&...` is safe (those are public, non-secret parameters), but if the key were ever passed as a query parameter instead, it would land in this exact log line, in `upstream_checks.request_id`-correlated log output, and (per the existing `npm run smoke` script's check (l) `stub.state.lastKeyHeader`) potentially in any error message that echoes the request URL back (some HTTP client error messages include the full request URL, including query string, in `error.message`).
- Query-string keys also survive in browser history, proxy/CDN access logs, and referrer headers if a request URL is ever reused client-side — none of which apply here since DATA-01 already mandates every CoinGecko call stays server-side, but it's the second-order reason the header is the industry-standard choice even for a server-only caller.

### Pattern 5: Extending the TTL cache + in-flight dedupe to multiple keyed resources
**What goes wrong if `coingecko.ts`'s exact shape is copy-pasted per resource:** the existing `performCheck`/`inFlight`/cache-read logic (`coingecko.ts:57-156`) is written for exactly one resource (`service = "coingecko"`, one module-scoped `let inFlight`). A naive extension — one more `let inFlight` variable per new resource (`marketsInFlight`, `chart1dInFlight`, ...) — does not scale to the actual resource count this phase needs: 1 markets resource + up to 20 coins × 3 windows = potentially 61 distinct chart cache keys, keyed dynamically by which coin/window a user actually visits (D-46/MKT-04 are demand-driven, not pre-warmed for all 20 coins).
**The fix:** replace the single `let inFlight: Promise<...> | null` with `Map<string, Promise<...>>`, and replace the single "SELECT latest row WHERE service = X" query with either (a) an in-memory `Map<string, { value, fetchedAt }>` or (b) a DB table keyed by `(resource, params_key)` instead of just `service`. Concretely:
```typescript
// Pattern extending coingecko.ts's T-01-17 dedupe to N keyed resources.
// cacheKey examples: "markets", "chart:bitcoin:1d", "chart:ethereum:30d".
interface CachedEntry<T> { value: T; fetchedAt: number; }

const cache = new Map<string, CachedEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

async function getCached<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T; fetchedAt: number; stale: boolean }> {
  const cached = cache.get(cacheKey) as CachedEntry<T> | undefined;
  const now = Date.now();

  if (cached && now - cached.fetchedAt < ttlMs) {
    return { value: cached.value, fetchedAt: cached.fetchedAt, stale: false };
  }

  // Same in-flight-dedupe discipline as coingecko.ts's `inFlight` variable,
  // generalized to a Map so a miss on "chart:bitcoin:1d" never blocks a
  // concurrent miss on "chart:ethereum:7d" behind the same promise.
  const existing = inFlight.get(cacheKey) as Promise<T> | undefined;
  if (existing) {
    const value = await existing;
    const entry = cache.get(cacheKey) as CachedEntry<T>;
    return { value, fetchedAt: entry.fetchedAt, stale: false };
  }

  const promise = fetcher()
    .then((value) => {
      const fetchedAt = Date.now();
      cache.set(cacheKey, { value, fetchedAt });
      return value;
    })
    .catch((error) => {
      // D-41: on failure, fall back to the last-good cached value (even if
      // expired) rather than propagating — this is the key divergence from
      // coingecko.ts's classifyPing, which only ever records "down".
      if (cached) return cached.value; // stale serve — caller marks stale:true
      throw error; // no cache at all yet -> D-09 error envelope
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);
  const value = await promise;
  const entry = cache.get(cacheKey);
  const stale = !entry || now - entry.fetchedAt >= ttlMs; // fell back to old/no fresh write
  return { value, fetchedAt: entry?.fetchedAt ?? cached?.fetchedAt ?? now, stale };
}
```
This sketch is illustrative, not a required literal implementation — the planner has discretion (CONTEXT.md) over in-memory `Map` vs. a DB-backed table. **The one non-negotiable part carried over from `coingecko.ts`'s proven design:** the in-flight promise must be created and registered **synchronously**, before any `await`, so two near-simultaneous cache misses for the *same* key can never both start an upstream fetch — that race is exactly what T-01-17 already fixed once for `/ping` and must not be reintroduced per-resource.

### Pattern 6: `lightweight-charts` in React — mount/teardown/resize (D-37)
**What:** `lightweight-charts` is an imperative canvas library (`createChart` returns an `IChartApi` object you call methods on) — it is not a React component and has no reconciliation-aware lifecycle of its own. A naive `useEffect` that creates the chart every render, or that omits the cleanup return, leaks a canvas + event listeners on every remount (React 19 Strict Mode double-invokes effects in development specifically to catch this class of bug).
**The exact pattern, verbatim from TradingView's own official React tutorial** `[CITED: tradingview.github.io/lightweight-charts/tutorials/react/simple, fetched this session]`:
```typescript
// Source: tradingview.github.io/lightweight-charts/tutorials/react/simple (fetched this session)
useEffect(() => {
  if (!chartContainerRef.current) return;

  const chart = createChart(chartContainerRef.current, {
    layout: { background: { type: ColorType.Solid, color: backgroundColor }, textColor },
    width: chartContainerRef.current.clientWidth,
    height: 300,
  });

  const newSeries = chart.addSeries(AreaSeries, { lineColor, topColor, bottomColor });
  newSeries.setData(data);
  chart.timeScale().fitContent();

  const handleResize = () => {
    chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
  };
  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
    chart.remove(); // the ONLY correct teardown — releases the canvas + all internal listeners
  };
}, [data]); // re-runs (and fully tears down/recreates) whenever the window/series data changes
```
**Why the naive version leaks:** omitting the `return () => { chart.remove(); }` cleanup leaves the canvas element and every internal event listener `lightweight-charts` attached (wheel/pointer handlers for pan/zoom, its own internal `ResizeObserver` if used) alive after the component unmounts or the effect re-runs — each remount then stacks another live chart instance on top, which is both a memory leak and (in the 1D/7D/30D window-switch case) visibly wrong (overlapping charts). `chart.remove()` is documented as the correct API-level teardown (not just detaching the DOM node).
**Resize handling nuance:** the official example uses a `window` resize listener + `chart.applyOptions({ width })`, not a `ResizeObserver` on the container — this is sufficient because the chart container in this project's dark-shell layout resizes only when the window does (no independently-resizable panels). If a future phase adds resizable panes, a `ResizeObserver` on the container itself (not `window`) would be the more correct trigger — flagged as an open question below, not needed for this phase's scope.

### Pattern 7: Feeding CoinGecko's `[timestamp_ms, price]` pairs to `lightweight-charts`
**What:** `lightweight-charts`' line/area series `setData()` expects `{ time, value }[]`, where `time` is a `UTCTimestamp` — **seconds, not milliseconds** — and the array must be strictly ascending with unique `time` values `[CITED: general lightweight-charts documentation/community consensus surfaced via WebSearch this session — "UTCTimestamp is seconds, not milliseconds... series data must be strictly ascending by time, with unique values", corroborated by the official docs' own `setData` example using whole-second-equivalent date strings]`.
```typescript
// Source: pattern combining CoinGecko's documented [ms_timestamp, value][] shape
// (Pattern 2 above) with lightweight-charts' documented { time, value }[] shape
import type { LineData, UTCTimestamp } from "lightweight-charts";

function toChartSeries(prices: [number, number][]): LineData<UTCTimestamp>[] {
  return prices.map(([timestampMs, price]) => ({
    time: Math.floor(timestampMs / 1000) as UTCTimestamp,
    value: price,
  }));
  // NOTE: CoinGecko's market_chart arrays are already chronologically
  // ascending, so no explicit sort is needed here — but if two consecutive
  // points ever round to the same second (only plausible at 1m/5m Enterprise
  // granularity, not the hourly/5-min Demo granularity this phase uses),
  // lightweight-charts requires de-duplication before setData(), not just
  // ascending order.
}
```
**Attribution note (distinct from D-48's CoinGecko credit):** `lightweight-charts`' Apache-2.0 license ships with a NOTICE-file requirement for a link to `https://www.tradingview.com/` on any page using the library; the chart's own `attributionLogo` layout option (default `true`) renders a small TradingView logo/link in the chart's corner and **satisfies this requirement automatically** `[CITED: WebSearch synthesis of tradingview.github.io/lightweight-charts's LayoutOptions docs + release notes, this session — "you can use the attributionLogo chart option... which will satisfy the link requirement"]`. **Do not set `attributionLogo: false`** unless an equivalent tradingview.com link is added elsewhere on the trade page.

### Anti-Patterns to Avoid
- **Parsing CoinGecko's error response body to decide retry/stale behavior:** the 429 body shape (`{"status":{"error_code","error_message"}}`) is not documented by CoinGecko and was only confirmed by a live probe this session — classify failures by **HTTP status code alone**, exactly like the existing `classifyPing` does.
- **Passing `vs_currency=usdt`:** verified to 400. Always `usd`.
- **A `useEffect` for the chart with no cleanup, or one that recreates the chart on every poll tick:** leaks canvases and produces visibly duplicated/overlapping charts (Pattern 6).
- **Feeding CoinGecko's millisecond timestamps directly to `lightweight-charts`:** the library silently misinterprets them as a UTC timestamp ~58 years in the future (seconds since epoch, not ms) unless divided by 1000.
- **A single `let inFlight` variable reused across resources:** serializes unrelated concurrent requests (e.g., a chart fetch for coin A blocks behind coin B's) instead of deduplicating only genuinely identical requests (Pattern 5).
- **Sending the API key as a query parameter "just for this one endpoint":** breaks DATA-01's guarantee and CoinGecko's own docs explicitly warn against it (Pattern 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Financial chart rendering (candlesticks, pan/zoom, crosshair) | A custom SVG/canvas chart | `lightweight-charts` (D-37, locked) | Purpose-built for exactly this use case; hand-rolling loses the "Binance-like feel" the user explicitly asked for and reintroduces canvas-lifecycle bugs the library has already solved |
| Timestamp-to-`UTCTimestamp` conversion edge cases (DST, timezone) | Manual `Date` math per data point | `Math.floor(ms / 1000)` (UTC epoch arithmetic has no DST/timezone ambiguity) — see Pattern 7 | CoinGecko and `lightweight-charts` both operate in UTC epoch time; introducing `Date`-object timezone conversion is unnecessary complexity that risks off-by-one-hour bugs |
| Number formatting across 8 orders of magnitude | Ad-hoc `toFixed(2)` calls scattered across components | One centralized `format.ts` module (D-47, already scoped as Claude's Discretion) using `Intl.NumberFormat` with magnitude-aware fraction digits | A single BTC-price bug (`$75755.00` looking fine) hides a systemic issue that only shows up on a sub-cent altcoin (`$0.00` for a real $0.000012 price) — centralizing means one fix location, one set of tests |
| In-flight request deduplication | A new dependency (e.g. `p-memoize`, `dataloader`) | The existing `coingecko.ts` `Map`-based pattern, generalized (Pattern 5) | Already proven in this exact codebase for exactly this upstream (T-01-17); a generic library adds an abstraction layer for a ~15-line pattern already working |

**Key insight:** Every hand-roll temptation in this phase (chart rendering, timestamp math, number formatting) has a "looks right at the default value, breaks at the extreme" failure mode — a chart that works for BTC's ~$75K price but silently mishandles a sub-cent altcoin, or a timestamp conversion that's off by exactly one order of magnitude (ms vs s) and therefore renders a chart with no visible data points at all rather than an obviously-wrong one. These are exactly the "looks right in casual testing, wrong at the boundary" bugs this project's QA-first framing exists to catch — build the boundary cases into the automated tests from the start (Validation Architecture below), not just the manual QA cases.

## Common Pitfalls

### Pitfall 1: D-38's TTLs are safe for realistic demo traffic but not for continuous/automated polling — the R-05 monthly-budget math
**What goes wrong:** A monitoring bot, a forgotten always-open browser tab, or an aggressive CI/smoke schedule hitting the live (non-stubbed) CoinGecko API continuously could exceed the 10,000/month Demo credit cap even with D-38's TTL cache in place, because the cache only bounds calls **per TTL window**, not **across the whole month** — it does not stop refreshing forever, only collapses concurrent clients into one call per window.
**Why it happens:** the markets endpoint (45s TTL) refreshed continuously 24/7 for a month is `86400s/day ÷ 45s × 30 days ≈ 57,600 calls/month` — 5.7× the 10,000 cap — on its own. The 1D chart (120s TTL) continuously refreshed adds `86400 ÷ 120 × 30 = 21,600/month`; 7D and 30D (600s TTL each) add `86400 ÷ 600 × 30 = 4,320/month` each if continuously demanded. These are worst-case upper bounds assuming nonstop demand, not the expected usage: CLAUDE.md's stated audience ("reviewers spend minutes, not hours") means realistic monthly usage is trivially within budget (a handful of 5-minute sessions is on the order of tens of calls, not thousands) — but the math is worth stating explicitly for R-05 because it flags the actual risk vector: not organic reviewer traffic, but an unattended open tab, a forgotten monitoring/uptime-check hitting `/api/markets` on a schedule, or CI accidentally pointed at the real API instead of the `COINGECKO_BASE_URL` stub.
**How to avoid:** No code change is strictly required given the realistic usage profile — but the planner should treat this as an explicit, documented risk-acceptance rather than a silent gap: either (a) accept it given the demo's actual traffic pattern (recommended, and consistent with `market-data-caching.md`'s existing framing of this exact tradeoff), or (b) add a cheap safety valve — e.g., a soft daily-call counter that widens the TTL automatically once a threshold is approached. Cite `docs.coingecko.com/docs/errors-and-rate-limits` and `coingecko.com/en/api/pricing` (both fetched 2026-09-16) when updating R-05, and record this math as the citation, superseding the "unverified"/legacy-30-calls-per-minute framing.
**Warning signs:** A spike in `upstream call` log lines (the existing `ctx.log.warn`/`.info` pattern from `coingecko.ts:103-117`, extended to `marketData.ts`) with no corresponding spike in `/api/markets` requests from real browser clients — that mismatch is the signature of something other than organic traffic driving the cache-refresh cadence.

### Pitfall 2: Cache implementation choice (in-memory `Map` vs. DB table) has different cold-start behavior — make the choice deliberately
**What goes wrong:** An in-memory `Map` cache resets to empty on every process restart. On a free-tier host that spins down on inactivity (a realistic Phase 7 deployment shape per PROJECT.md's $0 constraint, though out of scope for this phase), every cold start pays exactly one upstream call per resource actually requested (thanks to dedupe, not a stampede) — this is a minor latency cost (the first visitor after a cold start waits one extra CoinGecko round-trip), not a correctness bug. A DB-backed cache (extending `upstream_checks`'s pattern to a new `market_cache` table) survives restarts but adds write-amplification (a write every 45s-10min per active resource) for values that are, by design, ephemeral and rebuilt trivially.
**Why it happens:** CONTEXT.md explicitly leaves this as Claude's Discretion ("Cache implementation (in-memory map vs the existing SQLite table)") — it is not a locked decision, and there is no wrong answer, only an unexamined default.
**How to avoid:** Make the choice explicit in the plan rather than defaulting silently. **Recommendation: in-memory `Map`.** The existing `coingecko.ts` pattern uses SQLite specifically because `upstream_checks` is also a durable audit log (FND-04's RCA requirement) — the markets/chart cache has no equivalent audit-trail requirement (D-43 only requires logging the *stale-serve event*, not persisting every cache entry), so the simpler in-memory structure is sufficient and avoids unnecessary SQLite write volume for ephemeral, cheaply-rebuilt data.
**Warning signs:** If a future phase needs cross-instance cache sharing (multiple API processes behind a load balancer), an in-memory `Map` silently stops deduplicating across instances — each instance would independently hit the upstream, multiplying the effective call rate by instance count. Not a concern for this phase's likely single-instance $0 deployment, but worth a one-line comment at the cache's definition site so a future horizontal-scaling phase doesn't miss it.

### Pitfall 3: Number formatting across 8 orders of magnitude
**What goes wrong:** A single fixed-precision formatter (`price.toFixed(2)`) makes BTC's `$75755.12` look fine but renders a genuinely-priced $0.00001234 altcoin as `$0.00` — a silent, misleading loss of all significant digits for the sort of low-cap coin that can legitimately appear in the top-20 by market cap (high supply, low unit price).
**Why it happens:** The curated top-20 list (D-36) is not guaranteed to be all high-unit-price coins — historically the top-20 has included coins priced well under $1 alongside BTC at tens of thousands of dollars, an 8-order-of-magnitude spread in a single table.
**How to avoid:** D-47's centralized formatting module should use magnitude-aware precision, e.g.:
```typescript
// Illustrative — exact thresholds are Claude's Discretion per D-47/CONTEXT.md
function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs === 0) return "0";
  if (abs >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 0.01) return price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  // Sub-cent: show enough significant figures that the value doesn't round to 0.
  return price.toPrecision(4);
}
```
**Warning signs:** A test asserting formatting only against BTC/ETH-magnitude fixtures passes while a sub-cent fixture (deliberately include one, e.g. a synthetic $0.00001234 price) silently renders as `$0.00` — this exact fixture should be in the Wave 0 test gap list below.

### Pitfall 4: Sorting with null/missing upstream fields (MKT-03)
**What goes wrong:** `/coins/markets` response fields like `roi` (verified `null` for Bitcoin in this session's live capture) and `max_supply` (verified `null` for Ethereum) demonstrate that nullable fields are real, not theoretical, in this response. `price_change_percentage_24h`/`total_volume`/`current_price` are not observed null for major coins in this session's sample, but a naive numeric sort comparator (`a.price - b.price`) crashes to `NaN`-driven undefined ordering — not a thrown error, just silently wrong sort order — the moment any field is `null`/`undefined` for any reason (a coin temporarily missing data during a CoinGecko-side partial outage, for instance).
**How to avoid:** A comparator that explicitly treats `null`/`undefined` as always-last regardless of sort direction, never subtracts possibly-null values directly:
```typescript
function compareNullable(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls always sort last
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}
```
**Warning signs:** A sort test using only fixtures where every field is populated passes while a fixture with one `null` field (deliberately include one) produces `NaN` comparisons and an unstable/undefined row order.

### Pitfall 5: React re-render churn from the 30s auto-refresh poll (MKT-05)
**What goes wrong:** Every poll tick replaces the entire markets array with a new object reference (a fresh `fetch` response), which — if the table renders 20 rows as inline JSX with no memoization — re-renders and re-diffs all 20 rows every 30 seconds even when 19 of them have identical values to the previous tick. On the trade page, if the chart component's data prop is derived fresh from the same poll and the `useEffect` dependency array is the whole array (not a content-stable reference), Pattern 6's `chart.remove()`/`createChart()` cycle re-runs on every poll tick — visibly flashing/recreating the chart every 30 seconds instead of updating it in place.
**How to avoid:** For the table, wrap row components in `React.memo` keyed by coin `id`, and compare on the specific fields that actually changed (not a whole-row reference compare) if profiling shows it matters — for 20 rows this is likely a non-issue in practice, but worth building correctly from the start given the project's stated audience. For the chart, decouple the *chart instance's* lifecycle from the *poll's* data updates: create the chart once (Pattern 6's `useEffect` with an empty-ish dependency array keyed only on the coin id + window, not the data itself), and call `series.setData(newPrices)` (or `series.update()` for the newest point) inside a **separate** effect keyed on the data, rather than tearing down and recreating the whole chart every poll.
**Warning signs:** A visible flash/flicker of the chart every 30 seconds in manual QA, or (automatable) a test asserting `createChart` was called exactly once across multiple simulated poll ticks with unchanged coin/window.

### Pitfall 6: `lightweight-charts` — millisecond timestamps and non-ascending/duplicate data
**What goes wrong:** Passing CoinGecko's raw `[1757980800000, 75755.12]` millisecond timestamp directly as `time` renders a chart interpreting `1757980800000` as `UTCTimestamp` **seconds**, which is the year 57683 AD — the chart either renders nothing visible (all data points compressed to the far right of a multi-millennium timescale) or throws depending on the library version. Separately, if any two data points round to the same second after conversion, `setData()` either throws or silently drops one.
**How to avoid:** Always `Math.floor(timestampMs / 1000)` (Pattern 7). Given the Demo plan's auto-granularity (5-min minimum), true collisions are not expected within this phase's windows, but a defensive de-duplication step (dropping any point whose `time` doesn't strictly increase from the previous) costs nothing and guards against any future CoinGecko response-shape surprise.
**Warning signs:** An empty-looking chart with correct network response data (visible in dev tools) but no rendered line — check the `time` field's magnitude first (13 digits = ms, 10 digits = s) before debugging anything else.

### Pitfall 7: Vitest fake timers reproduce Node's clock but NOT the browser's timer-receiver rule — reuse Phase 1's exact stub pattern for the market poller
**What goes wrong:** D-40 explicitly reuses `healthPoller.ts`'s visibility-aware polling discipline for the 30s markets/chart auto-refresh. Phase 1's own bug (documented in `wiki/pages/findings/health-poller-illegal-invocation.md`) was exactly this: `vi.useFakeTimers()` alone lets a Vitest suite (Node environment) pass even when the poller would throw `TypeError: Illegal invocation` in a real browser, because Node's `setTimeout`/`clearTimeout` have no WebIDL `this`-receiver check and browsers do. A market-poller reused from the same base pattern is exposed to the identical risk if its own test suite only uses plain `vi.useFakeTimers()` without also reproducing the receiver rule.
**Why it happens (verified in-repo):** `web/src/lib/healthPoller.test.ts:283-317` `[VERIFIED: web/src/lib/healthPoller.test.ts:283-317, read this session]` builds this exact defense — a `describe("createHealthPoller under the browser timer-receiver rule", ...)` block that stubs `globalThis.setTimeout`/`clearTimeout` with a **strict-receiver shim**:
```typescript
strictSetTimeout = function (this: unknown, handler: () => void, delayMs: number) {
  if (this !== undefined && this !== globalThis) {
    throw new TypeError("Illegal invocation");
  }
  return fakeSetTimeout(handler, delayMs);
};
```
combined with `vi.stubGlobal("setTimeout", strictSetTimeout)` — this reproduces the browser's WebIDL check *inside* Node/Vitest, so a poller bug that only manifests under the browser receiver rule is caught in the unit suite, not only in the `npm run smoke` real-Chrome step.
**How to avoid:** If the market/chart poller is implemented as a *new* module (not literally `createHealthPoller` parameterized differently), its test suite must include the equivalent strict-receiver `describe` block, not just a plain `vi.useFakeTimers()` suite — copy the pattern from `healthPoller.test.ts:283-362`, don't just trust that reusing `PollerTimers`' shape alone is sufficient (the shape alone doesn't catch the bug; the strict-receiver *test* does). If the market poller instead **reuses `createHealthPoller` itself** (parameterized with a different `fetchHealth`-equivalent), the existing tests already cover the receiver rule for free — this is a strong argument for factoring a generic `createPoller` out of `healthPoller.ts` rather than writing a second bespoke poller (Claude's Discretion, flagged here as a real option).
**Warning signs:** A market-poller test suite that passes entirely under plain `vi.useFakeTimers()` with no strict-receiver stub anywhere is not sufficient proof the poller works in a real browser — this is not a hypothetical risk, it is the literal Phase 1 bug reoccurring in new code.

## Code Examples

### `GET /api/markets` handler (Fastify route)
```typescript
// Source: pattern combining api/src/routes/health.ts's schema/route conventions
// (read this session) with Pattern 5's keyed-cache service
app.get("/api/markets", { schema: { response: MARKETS_RESPONSE_SCHEMA } }, async (request, reply) => {
  const { data, fetchedAt, stale } = await marketData.getMarkets({
    requestId: request.id,
    log: request.log,
  });
  return reply.status(200).send({ data, fetchedAt, stale });
});
```

### `GET /api/markets/:id/chart` — validating `:id` against the curated list (D-45)
```typescript
// Source: pattern extending D-45's "validate before any upstream call" requirement
app.get<{ Params: { id: string }; Querystring: { window: "1d" | "7d" | "30d" } }>(
  "/api/markets/:id/chart",
  { schema: { params: CHART_PARAMS_SCHEMA, querystring: CHART_QUERY_SCHEMA } },
  async (request, reply) => {
    const curated = await marketData.getMarkets({ requestId: request.id, log: request.log });
    const isValidCoin = curated.data.some((coin) => coin.id === request.params.id);
    if (!isValidCoin) {
      // D-09 envelope — the curated list, not an arbitrary CoinGecko id, is
      // the source of truth for what this endpoint will proxy.
      throw new AppError(404, "COIN_NOT_FOUND", `Unknown coin id: ${request.params.id}`);
    }
    const chart = await marketData.getChart(request.params.id, request.query.window, {
      requestId: request.id,
      log: request.log,
    });
    return reply.status(200).send(chart);
  },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| CoinGecko Demo plan: 30 calls/min | CoinGecko Demo plan: 100 calls/min, 10k call credits/mo | Undated in official docs, but confirmed current as of this session (2026-09-16) via two directly-fetched official pages; the 30/min figure persists in older search-indexed support content | R-05's "unverified" flag can be resolved with a citation; the higher limit materially reduces (though does not eliminate — see Pitfall 1) rate-limit risk |
| `market_chart` `interval=1m`/`5m` on any plan | `1m`/`5m` restricted to Enterprise; Demo/Public gets auto-selected granularity (5-min for 1 day, hourly for 2-90 days, daily beyond) | Documented current state, not a recent change per se | This phase should never pass `interval` explicitly for the Demo plan — let CoinGecko auto-select, since requesting `1m`/`5m` would simply fail or be ignored on a non-Enterprise key |

**Deprecated/outdated:** Nothing in this phase's chosen stack (`lightweight-charts` 5.2.1, CoinGecko API v3) is itself deprecated. The only "outdated" fact worth flagging is the 30-calls/min figure for the Demo plan, superseded by the 100-calls/min figure verified this session.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 1 credit is consumed only on HTTP 200 responses (4xx/5xx count toward the per-minute limit but not the monthly credit total) | Pattern 3 (Rate Limits) | Low-Medium — this claim came from a WebSearch summary of a `support.coingecko.com` article, not an independently fetched page (that domain returned 403 to direct `WebFetch` this session); if wrong, the R-05 monthly-budget math in Pitfall 1 would need to also count failed/stale-triggering calls, making the risk somewhat worse than stated — but the practical mitigation (D-41's stale-serve, which avoids retry storms) is unaffected either way |
| A2 | In-memory `Map` (not a DB table) is the right cache implementation choice | Pitfall 2, Alternatives Considered | Low — explicitly Claude's Discretion per CONTEXT.md; reversible with no data-migration concern since the cache holds no durable state |
| A3 | D-38's TTLs (45s markets, 2min/10min chart) are acceptable given realistic reviewer-only traffic, despite the worst-case monthly-budget math exceeding the 10k cap under continuous polling | Pitfall 1 | Medium — if the deployed demo ends up with an automated monitor or an easily-forgotten open tab, the real monthly cap could be hit; recommend the user explicitly confirm this tradeoff is acceptable (it is the kind of decision CONTEXT.md's own `[ASSUMED]` tag on D-38 already flags as reversible) |
| A4 | The `attributionLogo: true` default satisfies `lightweight-charts`' Apache-2.0 NOTICE-file linking requirement | Pattern 7 | Low — corroborated by the library's own official LayoutOptions docs and release notes (WebSearch-synthesized, not independently fetched in full), and the default behavior (logo on by default) means simply not touching this option is already compliant |
| A5 | `market_chart` (with `days`) is preferable to `market_chart/range` for this phase's fixed 1D/7D/30D windows | Pattern 2 | Low — both endpoints return an identical response shape and identical auto-granularity table per the official docs; the only difference is which is simpler to call for fixed windows, not a correctness question |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Should the safety-valve from Pitfall 1 (a soft daily-call counter, or similar) be built this phase, or is the risk explicitly accepted given the stated reviewer-only audience?**
   - What we know: The worst-case continuous-polling math exceeds the 10k/month cap by 5-9×; realistic reviewer traffic does not come close.
   - What's unclear: Whether the user wants a code-level safety net now or is comfortable with the risk given the project's actual usage pattern (and D-38's own `[ASSUMED]` framing).
   - Recommendation: Default to no extra safety valve (D-38's TTLs as locked), but flag this explicitly to the user/planner as a deliberate risk-acceptance, and update `qa/TEST-PLAN.md` R-05 with this session's citations either way.

2. **In-memory `Map` vs. DB-backed cache table (Pitfall 2) — pick one explicitly in the plan.**
   - What we know: Both are viable; CONTEXT.md leaves this as Claude's Discretion.
   - What's unclear: Whether a future phase's deployment topology (multi-instance) makes the DB-backed choice preferable pre-emptively.
   - Recommendation: In-memory `Map` for this phase (simpler, no durability requirement for ephemeral, cheaply-rebuilt data); leave a comment flagging the multi-instance caveat for whoever does the Phase 7 deployment research.

3. **Should the market/chart poller factor out a shared `createPoller` from `healthPoller.ts`, or be a new bespoke module?**
   - What we know: Reusing `createHealthPoller` directly (parameterized) gets Pitfall 7's strict-receiver test coverage for free; a bespoke module needs to duplicate that test pattern manually.
   - What's unclear: Whether `createHealthPoller`'s current shape (built around a single `HealthState`-shaped result) generalizes cleanly to the market poller's different state shape (a list of coins, or a chart series) without an awkward refactor.
   - Recommendation: Evaluate during planning whether extracting a generic `createPoller<T>` is a small, clean refactor or a larger detour; either way, the resulting market-poller test suite MUST include the strict-receiver `describe` block from `healthPoller.test.ts:283-317`, not just plain fake timers.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| CoinGecko Demo API (`api.coingecko.com`) | All of DATA-01..04, MKT-01..05 | ✓ | Live, verified reachable and returning documented shapes this session | `COINGECKO_BASE_URL` stub (D-51, already supported by `scripts/smoke-dev.mjs`) for deterministic/offline testing |
| `lightweight-charts` on the npm registry | MKT-04 | ✓ | 5.2.1, installable `[VERIFIED: npm view, this session]` | — |
| A configured `COINGECKO_API_KEY` | Higher (Demo) rate limit vs. keyless | ✓ locally (`api/.env`, per D-35's provenance note) | — | App is keyless-capable by design (D-35) — works with degraded (keyless, ~5-15 calls/min) limits if the key is ever absent |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — every dependency this phase needs is confirmed available, and the one degraded-mode case (no API key) is already a designed, working fallback (D-35).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1, `environment: "node"` in both `api/` and `web/` (unchanged from Phase 1-2) `[VERIFIED: web/vite.config.ts, api/package.json, read prior sessions and unchanged]` |
| Config file | `api/vitest.config.ts`, `web/vite.config.ts` (existing, no changes needed) |
| Quick run command | `npm test --workspace=api` / `npm test --workspace=web` |
| Full suite command | `npm test --workspaces --if-present` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| DATA-01 | Key sent as header only, never query string; never logged | unit (`marketData.test.ts`) + browser smoke (network-tab assertion, D-49's success criterion 3) | `npx vitest run api/src/lib/marketData.test.ts` | ❌ Wave 0 |
| DATA-02 | Concurrent requests within TTL window collapse to 1 upstream call | unit (dedupe race test, mirrors `coingecko.test.ts`'s existing T-01-17 coverage) | `npx vitest run api/src/lib/marketData.test.ts -t dedupe` | ❌ Wave 0 |
| DATA-03 | 429/timeout/5xx serves last-good cache with `stale:true`; no cache at all -> D-09 error | unit (stubbed `fetchImpl` returning 429 then verifying fallback), against `COINGECKO_BASE_URL` stub for the smoke path (D-51) | `npx vitest run api/src/lib/marketData.test.ts -t stale` | ❌ Wave 0 |
| DATA-04 | Curated top-20 excludes USDT/USDT-equivalent self-pair; `:id` path validated against it | unit (`routes/markets.test.ts` — invalid id -> 404) | `npx vitest run api/src/routes/markets.test.ts` | ❌ Wave 0 |
| MKT-01/02/03 | Table renders/searches/sorts, including null-field and 8-order-of-magnitude fixtures (Pitfalls #3/#4) | unit (pure formatter/comparator functions) + `renderToStaticMarkup` (matching this repo's existing FE test convention, per 02-RESEARCH.md's documented DOM-less test environment) | `npx vitest run web/src/lib/format.test.ts web/src/components/MarketsTable.test.tsx` | ❌ Wave 0 |
| MKT-04 | Chart mounts/unmounts cleanly, converts timestamps correctly, switches windows without leaking | unit (assert `createChart`/`chart.remove()` call counts against a mocked module) + browser smoke (visual/no-console-error proof, extending `scripts/smoke-dev.mjs`) | `npx vitest run web/src/components/PriceChart.test.tsx` | ❌ Wave 0 |
| MKT-05 | 30s visibility-aware poll; "last updated" uses `fetchedAt`; attribution visible | unit (strict-receiver poller test per Pitfall #7) + browser smoke (extends the existing real-timer periodic-poll assertion pattern already proven for `/health`) | `npx vitest run web/src/lib/marketsPoller.test.ts` | ❌ Wave 0 |
| QA-03 | Manual test cases + executed run report | manual (not automatable) | n/a — `qa/test-cases/markets.md` executed, results in `qa/runs/RUN-YYYY-MM-DD-markets.md` | ❌ Wave 0 — new files, following `qa/templates/*` conventions already used for `auth.md` |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <changed-file>.test.ts`
- **Per wave merge:** `npm test --workspaces --if-present` (full suite)
- **Phase gate:** Full suite green, plus `npm run smoke` (extended with a markets/chart/stale-banner real-browser path against the `COINGECKO_BASE_URL` stub) and the executed QA run report, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `api/src/lib/marketData.test.ts` — covers keyed cache/dedupe (Pattern 5), stale-serve fallback (D-41), key-in-header-only (DATA-01)
- [ ] `api/src/routes/markets.test.ts` — covers `:id` validation against the curated list (D-45), the D-09 error envelope, `usd`-not-`usdt` upstream call
- [ ] `web/src/lib/format.test.ts` — covers Pitfall #3 (8-order-of-magnitude price formatting), including a deliberate sub-cent fixture
- [ ] `web/src/components/MarketsTable.test.tsx` — covers search, sort (including a deliberate `null`-field fixture per Pitfall #4, and tie-breaking)
- [ ] `web/src/components/PriceChart.test.tsx` — covers mount/unmount call-count assertions, ms-to-seconds timestamp conversion (Pitfall #6)
- [ ] `web/src/lib/marketsPoller.test.ts` — strict-receiver `describe` block per Pitfall #7, mirroring `healthPoller.test.ts:283-362`
- [ ] `qa/test-cases/markets.md`, `qa/runs/RUN-YYYY-MM-DD-markets.md` — QA-03/D-49/D-50
- [ ] `scripts/smoke-dev.mjs` extension — markets table render, chart render, forced-429-stub -> stale banner, and a network-tab assertion that no request ever carries the CoinGecko key (D-49's success criterion 3)
- [ ] `qa/TEST-PLAN.md` R-05 update — cite `docs.coingecko.com/docs/errors-and-rate-limits` and `coingecko.com/en/api/pricing` (2026-09-16), replacing "unverified"

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | No (public endpoints, D-44) | N/A — market data is not user-specific by design |
| V5 Input Validation | Yes | The `:id` path parameter is validated against the cached curated list before any upstream call (D-45) — prevents the endpoint being used as an open proxy to arbitrary CoinGecko paths; the `window` query parameter is validated against a fixed enum (`1d`/`7d`/`30d`) via Fastify schema, not passed through to CoinGecko unvalidated |
| V7 Error Handling & Logging | Yes | D-43: stale-serve events logged with request ID + failure reason; the CoinGecko key is never included in any log field (verified: `coingecko.ts`'s existing `logFields` only ever logs `url`, `status`, `durationMs`, `result` — no headers, no key) — extend `marketData.ts`'s logging with the same discipline |
| V9 Communications | Yes | All CoinGecko calls use HTTPS (`https://api.coingecko.com`, the default `coingeckoBaseUrl` in `api/src/config.ts`) — no plaintext HTTP to the real upstream (the `COINGECKO_BASE_URL` stub seam uses plain HTTP only for local/CI testing, never in a real deployment) |
| V13 API and Web Service | Yes | Rate-limit resilience via caching (DATA-02) rather than the API exposing its own rate-limit surface to clients; the D-09 error envelope stays consistent for this phase's new routes |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Open-proxy abuse of `/api/markets/:id/chart` to reach arbitrary CoinGecko paths/ids | Tampering / Information Disclosure | D-45: validate `:id` against the cached curated list before any upstream call — never interpolate a client-supplied string directly into the upstream URL without this check |
| API key exfiltration via query-string logging, error messages, or browser network traffic | Information Disclosure | Header-only key transport (Pattern 4); server-only CoinGecko calls (DATA-01); log fields that never include headers or the key (existing `coingecko.ts` discipline, extended) |
| Cache poisoning via unbounded cache-key growth (an attacker requesting many distinct fabricated `:id` values to grow memory/DB usage) | Denial of Service | D-45's validate-before-cache-key discipline also protects the cache itself — a rejected `:id` (404) never reaches `marketData.getChart`, so no cache entry is ever created for it |
| Upstream outage (429/timeout/5xx) degrading the whole app for all users simultaneously | Denial of Service (upstream-induced) | D-41's stale-serve fallback is the mitigation — the app degrades to slightly-stale data rather than failing outright, and this is deterministically testable via the `COINGECKO_BASE_URL` stub (D-51) rather than depending on a real outage |

## Sources

### Primary (HIGH confidence — live API probes and direct source reads this session)
- Live unauthenticated calls to `https://api.coingecko.com/api/v3/coins/markets`, `/simple/supported_vs_currencies`, `/coins/bitcoin/market_chart`, `/coins/bitcoin/market_chart/range` — captured real response shapes, the real `invalid vs_currency` rejection for `usdt`, and a real 429 body/headers (including the undocumented `retry-after` header) — this session, 2026-09-16
- `api/src/lib/coingecko.ts` — the existing TTL-cache + in-flight-dedupe pattern (T-01-17) this phase generalizes
- `api/src/routes/health.ts`, `api/src/app.ts`, `api/src/lib/errors.ts` — route/schema/error-envelope conventions to reuse
- `web/src/lib/api.ts`, `web/src/lib/healthPoller.ts` — FE fetch-wrapper and visibility-aware-poller conventions to extend
- `web/src/lib/healthPoller.test.ts:283-362` — the exact strict-receiver Vitest pattern the market poller's tests must reuse (Pitfall #7)
- `web/src/App.tsx`, `scripts/smoke-dev.mjs`, `api/src/config.ts`, `api/src/db/schema.ts` — routing, smoke-script, and config conventions this phase extends
- `npm view lightweight-charts` (version, `time.modified`, `scripts.postinstall`, `repository.url`, `license`) + `api.npmjs.org/downloads/point` + `gsd-tools query package-legitimacy check` — this session

### Secondary (MEDIUM confidence — official docs fetched directly this session)
- [docs.coingecko.com/reference/coins-markets](https://docs.coingecko.com/reference/coins-markets) — `/coins/markets` parameters and response fields
- [docs.coingecko.com/reference/coins-id-market-chart](https://docs.coingecko.com/reference/coins-id-market-chart) — `market_chart` parameters, auto-granularity table, response shape
- [docs.coingecko.com/reference/coins-id-market-chart-range](https://docs.coingecko.com/reference/coins-id-market-chart-range) — `market_chart/range` parameters, response shape
- [docs.coingecko.com/docs/errors-and-rate-limits](https://docs.coingecko.com/docs/errors-and-rate-limits) — current Demo rate limit (100/min), error status codes
- [docs.coingecko.com/docs/common-errors-rate-limit](https://docs.coingecko.com/docs/common-errors-rate-limit) — corroborates 100/min, "4xx/5xx count toward per-minute limit"
- [coingecko.com/en/api/pricing](https://www.coingecko.com/en/api/pricing) — Demo plan: 100 calls/min, 10k call credits/mo, all tier comparison
- [docs.coingecko.com/v3.0.1/reference/authentication](https://docs.coingecko.com/v3.0.1/reference/authentication) — header vs. query-parameter key transport, recommendation
- [tradingview.github.io/lightweight-charts/docs](https://tradingview.github.io/lightweight-charts/docs) — `createChart`/`addSeries`/`setData` API
- [tradingview.github.io/lightweight-charts/tutorials/react/simple](https://tradingview.github.io/lightweight-charts/tutorials/react/simple) — the official React mount/resize/cleanup pattern quoted in Pattern 6
- [github.com/tradingview/lightweight-charts/blob/master/LICENSE](https://github.com/tradingview/lightweight-charts/blob/master/LICENSE) — Apache-2.0 boilerplate confirmed, no extra clause found directly in the LICENSE file itself (the NOTICE-link requirement is documented in the product's own docs, not the LICENSE file)

### Tertiary (LOW confidence — WebSearch synthesis, not independently fetched)
- Support-article claim that credits are consumed only on HTTP 200 (`support.coingecko.com/hc/en-us/articles/13962109374489`) — WebSearch summary only; direct `WebFetch` to `support.coingecko.com` returned HTTP 403 this session (see Assumption A1)
- `lightweight-charts`' `attributionLogo` NOTICE-satisfying behavior — WebSearch synthesis of the library's LayoutOptions docs/release notes, not independently fetched in full (see Assumption A4)
- The legacy "30 calls/min" Demo-plan figure — surfaced only via WebSearch snippets of an older/cached support article, explicitly superseded by the two directly-fetched official pages above; included only to explain the discrepancy for R-05's write-up, not as a current fact

## Metadata

**Confidence breakdown:**
- CoinGecko endpoint shapes and rate limits: HIGH — cross-checked across 2-3 directly-fetched official pages AND multiple live API probes this session (the strongest possible evidence tier for this kind of claim)
- `vs_currency=usdt` rejection: HIGH — directly falsified via a live API call with the actual error response captured verbatim
- Key handling (header vs. query): HIGH — directly-fetched official docs, corroborated by the existing in-repo `coingecko.ts` pattern already doing it correctly
- `lightweight-charts` version/license/legitimacy: HIGH — verified via npm registry, `gsd-tools` package-legitimacy gate, and official GitHub Pages docs
- Cache/dedupe extension pattern: HIGH — directly grounded in reading `coingecko.ts`'s actual source this session, not external research
- `lightweight-charts` attribution requirement and credit-consumption model: MEDIUM — WebSearch-synthesized, not independently fetched (both domains partially inaccessible to direct `WebFetch` this session)
- Number formatting / sort-null-safety recommendations: MEDIUM — sound general practice, illustrative code not independently verified against a specific style guide, left as Claude's Discretion per D-47

**Research date:** 2026-09-16
**Valid until:** ~2026-10-16 (30 days) for CoinGecko endpoint shapes/rate limits (these can change without notice — re-verify with a live probe if this research is acted on significantly later); `lightweight-charts` version should be re-checked at execution time if the plan is executed significantly later than this research.

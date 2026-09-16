# Phase 3: Live Markets - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning

> **Provenance:** the user answered the three product-shaped questions directly (1a / 2a / 3a on 2026-09-16) and delegated the rest, as in Phase 2. Their three answers are recorded as D-35, D-36 and D-37 and are USER DECISIONS, not assumptions. Everything else below was derived by the orchestrator from `.planning/REQUIREMENTS.md`, the Phase 1-2 conventions and the $0/public-repo constraints; items marked **[ASSUMED]** are safe defaults a human might want to change.

<domain>
## Phase Boundary

Live, rate-limit-safe CoinGecko market data in a Binance-like markets and trade view.

Requirements: DATA-01..04, MKT-01..05, QA-03.

In scope: a backend CoinGecko client with a TTL cache and stale fallback, the curated pair list, markets and chart endpoints, the markets table (search, sort, auto-refresh, "last updated"), the trade page with a 1D/7D/30D chart, the "prices delayed" banner, CoinGecko attribution, and executed market-data test cases.

NOT in scope: placing orders, wallet mutations, fees, P&L (Phases 4-5); a real order book or depth chart (v2, explicitly deferred in TEST-PLAN.md); WebSocket/streaming prices (CoinGecko Demo is REST); per-user watchlists or alerts (v2).

</domain>

<decisions>
## Implementation Decisions

### API key handling (USER DECISION — answer 1a)
- **D-35:** The app is **keyless-capable**. It sends `x-cg-demo-api-key` when `COINGECKO_API_KEY` is set and falls back to unauthenticated public endpoints when it is not; the health badge keeps reporting `not_configured` honestly in that case. No code path requires the key to exist. **Rationale:** the user can add, rotate or remove a key without a code change, CI and any fresh clone work with no secret, and the key stays a deployment concern.
  - A Demo key IS configured locally in `api/.env` (gitignored, never committed, never sent to the browser — DATA-01). Verified working on 2026-09-16: authenticated `/ping` returned 200 and `/coins/markets` returned live data.
  - **The key must never reach the browser.** Every CoinGecko call is server-side; the FE only ever talks to our own API. Success criterion 3 is proven by inspecting real browser network traffic, not by reading code.

### Curated pair list (USER DECISION — answer 2a)
- **D-36:** The tradable set is the **top 20 by market cap, fetched dynamically** from CoinGecko and cached, quoted against USDT (DATA-04). **Consequence the user accepted:** the list changes over time, so Phase 4-5 tests must not hardcode "the top 20 are X" — they pin whatever the cache currently holds, or stub the upstream. Record this explicitly for the later phases.
  - Stablecoins that appear in the top 20 (USDT itself, USDC, DAI…) are still listed; a USDT/USDT pair is nonsensical and must be excluded from the tradable set.

### Chart (USER DECISION — answer 3a)
- **D-37:** Use **TradingView `lightweight-charts`** for the 1D/7D/30D price chart (MKT-04) — it gives the Binance-like feel the project is aiming at. It is a new runtime dependency, so it goes through the same Package Legitimacy Audit `playwright-core` did, and a blocking human gate before install if the audit turns up anything unexpected. Data comes from CoinGecko's `market_chart` range endpoints through our own API, never called from the browser.

### Caching and rate limits
- **D-38:** Market data is cached server-side with a **45s TTL** (DATA-02 asks for 30-60s), so any number of browser clients collapses into at most one upstream call per TTL window per resource. Chart series are cached longer — **10 minutes for 7D/30D, 2 minutes for 1D** — since their shape barely moves within a TTL and they are the most expensive calls. **[ASSUMED]**
- **D-39:** Concurrent cache misses for the same resource are **deduplicated in flight** (one upstream call, all waiters share it), extending the pattern already proven in `api/src/lib/coingecko.ts` (T-01-17). This is what actually protects the Demo quota under a burst, not the TTL alone.
- **D-40:** The FE polls our own API (never CoinGecko) on a **30s interval, only while the tab is visible**, reusing the Phase 1 visibility-aware poller discipline — including its lesson that browser-only behavior must be proven in a real browser (`wiki/pages/findings/health-poller-illegal-invocation.md`). "Last updated" shows the data's `fetchedAt`, not the time of the local request. **[ASSUMED]**

### Stale behavior (DATA-03)
- **D-41:** On upstream 429, timeout or 5xx, the API serves the **last good cached payload** with `stale: true` plus the original `fetchedAt`, rather than failing. Only when there is no cached data at all does it return an error envelope (D-09 shape).
- **D-42:** `stale: true` drives a visible **"prices delayed" banner** naming how old the data is. Staleness is a property of the payload, not a separate endpoint, so every consumer sees it.
- **D-43:** Serving stale data is never silent server-side: it is logged with the request ID and the upstream failure reason, so an RCA can reconstruct what happened (FND-04, RCA-01).

### API shape
- **D-44:** New endpoints are public (no session required) — market data is not user-specific, and `/markets` must render for a logged-out visitor (D-28 kept `/markets` public). They live under `/api/markets` and `/api/markets/:id/chart`, returning the D-09 error envelope on failure and carrying `fetchedAt` + `stale` on success. **[ASSUMED]**
- **D-45:** The coin id in a path is validated against the cached curated list before any upstream call, so the endpoint cannot be used as an open proxy to arbitrary CoinGecko paths.

### Frontend
- **D-46:** The markets table (MKT-01/02/03) does search and sort **client-side** over the cached top-20 payload — 20 rows needs no server round-trip, and it keeps interactions instant. Sorting covers price, 24h % and volume; search matches name or symbol, case-insensitive.
- **D-47:** Money and percentage formatting is centralized in one module so Phase 4-5 reuse it: prices to a sensible per-magnitude precision, 24h change with sign and colour (green/red on the dark shell), volume and market cap abbreviated (1.2B). No floating-point arithmetic on money — display formatting only; decimal-safe math arrives with WAL-03. **[ASSUMED]**
- **D-48:** "Powered by CoinGecko" attribution stays visible (MKT-05) — the footer link from Phase 1 already satisfies it; the trade page additionally attributes chart data.

### QA (QA-03)
- **D-49:** `qa/test-cases/markets.md` (IDs `TC-MKT-NNN`) covering: table contents and formatting, search, sort (including ties and negative values), auto-refresh and "last updated", the 1D/7D/30D chart, the stale banner via a forced upstream failure, attribution, and **a browser-network assertion that the API key never appears in any request the browser makes** (success criterion 3).
- **D-50:** Executed into `qa/runs/RUN-YYYY-MM-DD-markets.md`; failures filed as `qa/bugs/BUG-NNN-*.md`. An unexecuted case file does not satisfy QA-03 (same rule as D-33).
- **D-51:** Deterministic upstream failures (429, timeout, malformed body) are exercised against a **local stub** via `COINGECKO_BASE_URL`, which `scripts/smoke-dev.mjs` already supports — never by hammering the real CoinGecko API into rate-limiting us.

### Claude's Discretion
- Cache implementation (in-memory map vs the existing SQLite table), exact endpoint payload shapes, chart component structure, table component structure, and how the curated list is refreshed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §Phase 3 — goal, 5 success criteria, 3 planned plans
- `.planning/REQUIREMENTS.md` — DATA-01..04, MKT-01..05, QA-03
- `.planning/PROJECT.md` — constraints ($0, rate limits, decimal math, reviewer audience)

### Existing code this phase extends
- `api/src/lib/coingecko.ts` — the Phase 1 status service: TTL cache, in-flight dedupe (T-01-17), timeout and classification patterns to extend
- `api/src/app.ts`, `api/src/lib/errors.ts` — route registration, D-09 error envelope, request-ID propagation, CORS with credentials
- `api/src/routes/health.ts` — route/schema/DI conventions
- `web/src/lib/api.ts` — FE client conventions, `ApiError`, `credentials: "include"`, the shared `parseJsonBody` helper
- `web/src/lib/healthPoller.ts` — visibility-aware polling discipline and its receiver-rule lesson
- `web/src/App.tsx`, `web/src/pages/ComingSoon.tsx` — the dark shell and the placeholder pages this phase replaces for Markets and Trade
- `scripts/smoke-dev.mjs` — real-browser smoke step and the `COINGECKO_BASE_URL` stub seam

### Project memory
- `wiki/pages/entities/coingecko-api.md` — endpoints, the `x-cg-demo-api-key` header, Demo limits
- `wiki/pages/concepts/market-data-caching.md` — the caching concept page to update
- `wiki/pages/findings/health-poller-illegal-invocation.md`, `wiki/pages/findings/verify-password-fail-open.md` — prior RCA lessons
- `wiki/SCHEMA.md` — decisions to `wiki/pages/decisions/`, mirrored one line into PROJECT.md, `wiki/log.md` append-only

### QA
- `qa/TEST-PLAN.md` — R-04 (stale prices), R-05 (rate limits, still marked unverified), R-11 (key exposure), severity/priority, exit criteria
- `qa/test-cases/auth.md`, `qa/runs/RUN-2026-09-16-auth.md` — the Phase 2 formats to match
- `qa/templates/*.md`

</canonical_refs>

<open_questions>
## Open Questions (non-blocking; defaults chosen, reversible)

1. Cache TTLs: 45s for markets, 2min/10min for chart series (D-38).
2. FE poll interval of 30s while visible (D-40).
3. Market endpoints public rather than session-gated (D-44).
4. R-05 in TEST-PLAN.md still records the Demo plan's exact rate limits as **unverified** — this phase should confirm the real numbers from the CoinGecko dashboard or docs and update the risk row.

</open_questions>

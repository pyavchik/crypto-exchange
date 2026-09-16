---
title: Market-data cache, stale-serve contract, and the USD/USDT quote convention
type: decision
updated: 2026-09-16
sources: [raw/2026-09-15-coingecko-demo-api.md]
related: [[market-data-caching]], [[coingecko-api]], [[coingecko-proxy]], [[order-rules]]
---

# Market-data cache, stale-serve contract, and the USD/USDT quote convention

**Status:** Accepted (Phase 3 "Live Markets", 2026-09-16). Full detail:
`.planning/phases/03-live-markets/03-CONTEXT.md` (D-35..D-51),
`.planning/phases/03-live-markets/03-RESEARCH.md`.

## Context

DATA-01..04 and MKT-01..05 need live CoinGecko market data behind a rate-limit-safe cache, a
degraded-but-honest behavior when the upstream fails, and a curated tradable pair list — all
without ever sending the Demo key to the browser and without exceeding the Demo plan's call
budget. [[coingecko-proxy]] had already decided the key stays server-side; Phase 3 had to decide
the concrete cache shape, what happens on an upstream failure, and how "quoted in USDT" is
actually implemented once the literal API call was tried.

## Decision

- **Keyed in-memory cache, not the durable `upstream_checks` table (D-38, D-39).** `GET
  /api/markets` and `GET /api/markets/:id/chart` share one `createKeyedCache` instance
  (`api/src/lib/keyedCache.ts`), keyed by resource string (`"markets"`,
  `"chart:{id}:{window}"`), with in-flight-request deduplication so N concurrent callers for the
  same key never trigger N upstream calls. TTLs: 45s for markets (DATA-02's 30-60s band), 2
  minutes for the 1D chart window, 10 minutes for 7D/30D (their shape barely moves inside a TTL
  and they are the most expensive calls). This is deliberately **not** the SQLite-backed
  `upstream_checks` table `api/src/lib/coingecko.ts`'s `/ping` check uses — that table exists as a
  durable audit trail for FND-04's RCA requirement, which the markets/chart cache has no
  equivalent need for (D-43 only requires logging the *stale-serve event*, not persisting every
  cache entry read). An in-memory `Map` is cheaper, needs no schema, and is trivially rebuilt on
  the next request after a process restart — the tradeoff accepted is that a horizontally-scaled
  multi-instance deployment (not this project's $0/single-instance shape) would need a shared
  cache to keep deduping across instances.
- **Stale-serve contract (D-41, D-42, D-43).** On a 429, timeout or 5xx from CoinGecko, the cache
  serves the **last-good cached value** with its *original* `fetchedAt` and `stale: true`, rather
  than failing the request — implemented as a fallback branch inside `keyedCache.resolve()` that
  only fires when a previous entry exists; a cold key (nothing ever cached) still rejects with a
  `502 UPSTREAM_UNAVAILABLE` D-09 envelope. Staleness travels as a property of the payload itself,
  not a separate endpoint, so every consumer (the markets table, the trade page) sees the same
  flag and renders the same "Prices delayed" banner from it. Serving stale data is never silent
  server-side: an `onStale` hook logs one `"serving stale market data"` warning per real upstream
  failure (never once per concurrent caller sharing the fallback) carrying the request id, the
  resource, the failure reason and the data's age — the evidence trail FND-04/RCA-01 need.
- **USD-upstream, USDT-display convention (D-36 correction, verified live 2026-09-16).**
  CoinGecko's `/coins/markets` and `/coins/{id}/market_chart` both **reject `vs_currency=usdt`**
  with `400 {"error":"invalid vs_currency"}` — confirmed by a live unauthenticated call this
  session and cross-checked against the live `/simple/supported_vs_currencies` list ("usdt" is
  absent from all 63 entries). "Quoted against USDT" is therefore implemented as `vs_currency=usd`
  upstream, with pairs rendered as `<SYMBOL>/USDT` under this project's own stated 1:1
  USDT≈USD display convention — a modelling decision, not a cosmetic one, and every page that
  shows a price restates it ("Prices are CoinGecko's USD reference prices. This exchange treats
  USDT as 1:1 with USD.") so a reviewer is never misled into thinking a genuinely
  stablecoin-quoted feed exists. **Phase 4's order math inherits this same convention** — a limit
  or market order's reference price is the same USD figure the markets table already shows.
- **Accepted monthly-cap exposure (D-38's `[ASSUMED]` TTLs, resolved explicitly this phase).**
  Continuous, unattended polling against D-38's TTLs could exceed the Demo plan's monthly credit
  cap several times over (see Consequences). The decision, made explicitly rather than left as a
  silent gap, is to **accept this exposure and document it** (`qa/TEST-PLAN.md` R-05) rather than
  build a throttle this phase — realistic reviewer-only traffic sits far inside the cap, and the
  risk vector is an unattended open tab or a monitoring job pointed at the real API, not organic
  use.

## Consequences

- A markets or chart cache miss anywhere (any user, any resource) never produces more than one
  upstream call per TTL window regardless of how many browser tabs are open — proven in
  `api/src/lib/keyedCache.test.ts`/`marketData.test.ts` and against the real stack in `npm run
  smoke`'s markets/chart sections.
- An upstream outage degrades the app to slightly-stale prices with a visible, dated banner rather
  than an error page, and every stale-serve is a reconstructable log event — this is the
  deliberate, testable middle ground between "always correct" (impossible without a live feed) and
  "silently wrong" (unacceptable for a trading demo).
- The verified Demo limits — **100 calls/min, 10,000 call credits/month**
  (`docs.coingecko.com/docs/errors-and-rate-limits`, `coingecko.com/en/api/pricing`, both fetched
  2026-09-16) — supersede the older, still search-indexed "30 calls/min" figure. Worst-case
  continuous polling at D-38's TTLs (markets 45s, chart 1D/7D/30D at 2min/10min/10min) sums to
  roughly 5.7-9x the monthly cap if driven nonstop 24/7; realistic reviewer sessions (minutes, not
  hours) are on the order of tens of calls. The accepted-risk decision means the warning sign to
  watch for post-deploy is upstream-call log-line volume rising with no matching rise in real
  browser traffic — the reversal condition, if that pattern ever appears, is a cheap daily call
  counter that widens the cache lifetime automatically.
- Every DATA/MKT test case in `qa/test-cases/markets.md` that exercises a forced upstream failure
  (TC-MKT-027..030) does so against the local `COINGECKO_BASE_URL` stub, never the real API — the
  stale-serve contract above is exactly what makes that deterministic without touching the shared
  Demo quota.

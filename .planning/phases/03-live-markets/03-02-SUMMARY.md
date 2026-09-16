---
phase: 03-live-markets
plan: 02
subsystem: api
tags: [coingecko, cache, stale-serve, chart, fastify]

requires:
  - phase: 03-live-markets
    provides: "03-01's keyedCache.ts (createKeyedCache/createInFlightRegistry), marketData.ts's createMarketDataService factory and MarketDataUpstreamError (with its .reason property), the D-09 error envelope/AppError-bypass pattern, and the D-36 USD-upstream/USDT-display convention"
provides:
  - "api/src/lib/keyedCache.ts — resolve() gains a last-good fallback branch (D-41) with an onStale hook that fires exactly once per real upstream failure, never once per concurrent caller"
  - "api/src/lib/marketData.ts — the D-43 'serving stale market data' log line (upstream, resource, reason, ageMs, fetchedAt, requestId), MARKETS_TTL_MS override seam (D-51), and the full chart resource: CHART_WINDOWS/CHART_TTL_MS/chartCacheKey/toChartPoints/getChart sharing the markets cache instance"
  - "api/src/config.ts — MARKETS_TTL_MS env var, validated like PORT, defaulting to marketData.ts's 45s constant"
  - "public GET /api/markets/:id/chart with curated-list validation before any upstream call (D-45/T-03-08)"
affects: [03-03-search-sort-poll, phase-4-wallet-trading]

actuals:
  tokens: 12987
  tasks: 3
  commits: 2

plan_head_before: e295a01

tech-stack:
  added: []
  patterns:
    - "keyedCache.resolve()'s stale-fallback branch runs INSIDE the fn passed to the shared in-flight registry, not in each external resolve() caller — so onStale (and the one log line it drives) fires exactly once per real upstream failure regardless of how many concurrent callers share the fallback"
    - "One createKeyedCache<MarketPair[] | ChartPoint[]> instance backs both the markets resource and every chart:{id}:{window} key, sharing one dedupe registry (D-39) rather than a second cache instance per resource type"
    - "Two-layer id validation for a client-controlled path segment before any upstream call: a Fastify params pattern (defence in depth) then an equality check against the already-cache-served curated list (the actual mitigation, T-03-08/D-45)"

key-files:
  created: []
  modified:
    - api/src/lib/keyedCache.ts
    - api/src/lib/keyedCache.test.ts
    - api/src/lib/marketData.ts
    - api/src/lib/marketData.test.ts
    - api/src/routes/markets.ts
    - api/src/routes/markets.test.ts
    - api/src/config.ts
    - api/src/app.ts
    - api/.env.example

key-decisions:
  - "onStale fires once per actual upstream failure (inside the deduped fetcher closure), not once per concurrent resolve() caller — avoids N duplicate stale-serve log lines under a concurrent burst during an outage, while still satisfying D-43's 'logged once per event' intent"
  - "keyedCache stays domain-agnostic: it extracts the D-43 log reason from a rejected fetcher's error via a `.reason` string property when present (duck-typed against MarketDataUpstreamError), falling back to the error's message — so the generic cache primitive never imports a domain-specific error type"
  - "Chart failures reuse the existing MarketDataUpstreamError class (same 502/UPSTREAM_UNAVAILABLE/.reason contract as markets) rather than a second error type, since both resources share one onStale/logging shape"
  - "Tasks 1 and 2 (both editing the same createMarketDataService factory, MarketDataDeps/MarketDataService interfaces, and cache instance) landed in one commit rather than two, since splitting them would leave an intermediate commit that fails typecheck (app.ts passing marketsTtlMs to a deps type that doesn't declare it yet until task 2's interface exists). Verified standalone (typecheck + full suite) before committing. Task 3 (routes/markets.ts, a separate file) landed in its own commit."

patterns-established:
  - "A generic keyed-cache primitive's stale-fallback hook (onStale) is domain-agnostic by construction — duck-typing a `.reason` property off the rejected error keeps keyedCache.ts free of any import from marketData.ts, so a future resource (e.g. a second upstream) can reuse the same fallback without teaching the cache about its error shape"

requirements-completed: [DATA-02, DATA-03, DATA-04, MKT-04]

coverage:
  - id: D1
    description: "keyedCache.resolve() last-good fallback on fetcher rejection (stale:true, original fetchedAt unchanged, next call retries upstream), onStale hook firing exactly once per real failure even under concurrent callers, cold-key rejection unaffected"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "api/src/lib/keyedCache.test.ts — 'createKeyedCache — stale fallback (D-41/D-43)' (5 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getMarkets serves last-good pairs with stale:true on 429/5xx/timeout/malformed_body, logs exactly one 'serving stale market data' warning carrying requestId/resource/reason/ageMs/fetchedAt, still throws the D-09 502 UPSTREAM_UNAVAILABLE envelope with no stale line when nothing has ever been cached"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "api/src/lib/marketData.test.ts — 'createMarketDataService — stale fallback (D-41/D-43)' (5 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "MARKETS_TTL_MS env var (loadConfig), validated like PORT, defaulting to the 45s module constant; createMarketDataService accepts an explicit marketsTtlMs override used in place of the default"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "api/src/lib/marketData.test.ts — 'loadConfig — MARKETS_TTL_MS (D-51)' and 'createMarketDataService — marketsTtlMs override' (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "getChart: per-coin/per-window cache+dedupe sharing the markets cache instance, D-38 TTL boundaries (2min 1D, 10min 7D/30D), toChartPoints millisecond-to-second conversion with duplicate/non-finite dropping and throw-on-empty, Demo key header parity with markets, and its own stale fallback"
    requirement: MKT-04
    verification:
      - kind: unit
        ref: "api/src/lib/marketData.test.ts — 'toChartPoints', 'chartCacheKey', 'createMarketDataService — getChart' (16 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/markets/:id/chart: 200 shape with 1d default, 400 VALIDATION_ERROR for an unsupported window, 404 UNKNOWN_MARKET (zero chart upstream calls, including a 50-fabricated-id loop and slash/scheme-injection ids) before any upstream call, 502 when the curated list itself is cold, closed response schema"
    requirement: DATA-04
    verification:
      - kind: integration
        ref: "api/src/routes/markets.test.ts — 'GET /api/markets/:id/chart' (8 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full plan-level verification: complete API suite (156 tests incl. unchanged ping/health), typecheck, lint, format:check, and npm run smoke all green after every task"
    verification:
      - kind: unit
        ref: "npm --prefix api run test (156/156)"
        status: pass
      - kind: e2e
        ref: "npm run smoke — SMOKE OK"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-09-16
status: complete
---

# Phase 3 Plan 2: Stale-Serve Fallback and Chart Series Summary

**Last-good market-data fallback with a single D-43 stale-serve log line, an env-overridable TTL seam for deterministic testing, and per-coin/per-window chart series behind `GET /api/markets/:id/chart` validated against the curated list before any upstream call.**

## Performance

- **Duration:** ~50 min (approx. — session start time not explicitly recorded before work began)
- **Completed:** 2026-09-16T10:44:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 9 (0 created)

## Accomplishments

- `api/src/lib/keyedCache.ts`: `resolve()` gains an optional `onStale` hook and a last-good fallback branch (D-41) — a rejecting fetcher with a previous cache entry now serves that entry's value and *original* `fetchedAt` with `stale: true` instead of propagating the rejection; a cold key (nothing ever cached) still rejects with the fetcher's own error untouched. The fallback branch never writes to the cache, so the next `resolve()` call for that key naturally retries the upstream. `onStale` fires exactly once per real upstream failure — it runs inside the fn passed to the shared in-flight registry, not in each external caller, so N concurrent callers sharing a stale result never produce N duplicate log calls.
- `api/src/lib/marketData.ts`: `getMarkets` wires `onStale` into a single `serving stale market data` warn line carrying `upstream`, `resource` (the cache key), `reason` (`http_429`/`http_503`/`timeout`/`malformed_body`), `ageMs`, `fetchedAt`, and an explicit `requestId` field (D-43/FND-04/RCA-01). Adds the full chart resource — `CHART_WINDOWS`, `CHART_TTL_MS` (2min 1D, 10min 7D/30D per D-38), `chartCacheKey`, `toChartPoints` (millisecond→whole-second conversion, dropping non-finite values and same-second duplicates, throwing when nothing survives), and `getChart` — sharing the same `createKeyedCache` instance and dedupe registry as `getMarkets` (D-39).
- `api/src/config.ts`: `MARKETS_TTL_MS` env var, validated exactly like `PORT` (throws on non-integer/non-positive rather than silently falling back), defaulting to `marketData.ts`'s own 45-second constant so the two never drift. Threaded through `app.ts` into `createMarketDataService`'s new `marketsTtlMs` override — lets a smoke/QA run force the stale path deterministically (D-51) without waiting out a real 45s window.
- `api/src/routes/markets.ts`: `GET /api/markets/:id/chart` — a Fastify params pattern restricted to lowercase/digits/hyphens (defence-in-depth layer), then an equality check against the curated pairs list `getMarkets` already produced, performed *before* `getChart` is ever called (the actual mitigation, T-03-08/D-45). An unknown id throws `AppError(404, "UNKNOWN_MARKET")` and never becomes a cache key. Querystring `window` defaults to `1d`; response schema is `additionalProperties: false` at both the envelope and point-item level.

## Task Commits

Each task was committed atomically per the plan's TDD (`tdd="true"`) discipline — tests written first and confirmed to fail for the right reason (verified by temporarily reverting each commit's source files to HEAD and re-running the new tests) before the implementing changes were applied:

1. **Tasks 1 + 2: Last-good fallback, stale-serve logging, MARKETS_TTL_MS seam, and chart series** - `d3c402a` (feat)
2. **Task 3: `GET /api/markets/:id/chart` with curated-list validation before any upstream call** - `1f9fbd2` (feat)

**Plan metadata:** pending (this commit)

_Note on commit granularity: Tasks 1 and 2 both declare `api/src/lib/marketData.ts`/`marketData.test.ts` in their `<files>` and are structurally inseparable (same `createMarketDataService` factory, same `MarketDataDeps`/`MarketDataService` interfaces, same shared cache instance) — splitting them into two commits would leave an intermediate commit that fails typecheck (`app.ts` passing `marketsTtlMs` to a deps type that wouldn't declare it yet). Both tasks' RED phases were verified independently (see Deviations) before their shared implementation was committed together; Task 3 touches an entirely separate file and landed in its own commit as planned._

## Files Created/Modified

- `api/src/lib/keyedCache.ts` - last-good fallback branch + `onStale` hook on `resolve()` (D-41/D-43)
- `api/src/lib/keyedCache.test.ts` - 5 new tests covering the fallback, cold-key rejection, retry-on-next-call, recovery, and concurrent-caller dedup of the onStale call
- `api/src/lib/marketData.ts` - stale-serve log wiring, `MARKETS_TTL_MS` override seam, and the full chart resource (`CHART_WINDOWS`, `CHART_TTL_MS`, `chartCacheKey`, `toChartPoints`, `getChart`)
- `api/src/lib/marketData.test.ts` - 40 new tests: stale fallback per reason, `loadConfig`/`marketsTtlMs` override, `toChartPoints`, `chartCacheKey`, `getChart` (dedupe, TTL boundaries, URL/header shape, stale fallback)
- `api/src/routes/markets.ts` - `GET /api/markets/:id/chart` handler, params/querystring/response schemas
- `api/src/routes/markets.test.ts` - 8 new tests: 200 shape, 1d default, 400 validation, 404 unknown-market (incl. 50-id loop and injection attempts), 502 cold-cache, closed serialization
- `api/src/config.ts` - `marketsTtlMs` field, `MARKETS_TTL_MS` env parsing/validation
- `api/src/app.ts` - passes `marketsTtlMs` through to `createMarketDataService`
- `api/.env.example` - documents `MARKETS_TTL_MS`

## Decisions Made

- `onStale` fires once per actual upstream failure (inside the deduped fetcher closure), not once per concurrent `resolve()` caller — avoids N duplicate stale-serve log lines under a concurrent burst during an outage.
- `keyedCache.ts` stays domain-agnostic: it extracts the D-43 log reason from a rejected fetcher's error via a `.reason` string property when present (duck-typed against `MarketDataUpstreamError`), falling back to the error's `.message` — the generic cache primitive never imports a domain-specific error type.
- Chart failures reuse the existing `MarketDataUpstreamError` class (same 502/`UPSTREAM_UNAVAILABLE`/`.reason` contract as markets) rather than a second error type, since both resources share one `onStale`/logging shape.
- Tasks 1 and 2 committed together (see commit-granularity note above); Task 3 committed separately.

## Deviations from Plan

None - plan executed as written. The commit-granularity choice above is a documented process note, not a behavioral deviation from any plan instruction (the plan does not mandate one commit per task; the executor's own task-commit protocol was applied at the coarsest granularity that kept every commit typecheck-clean and fully green).

## Issues Encountered

- `npm run format:check` flagged Prettier drift in the four files with the largest diffs (`keyedCache.ts`, `marketData.ts`, `marketData.test.ts`, `markets.test.ts`) after implementation — ran `prettier --write` on those four files before committing; re-verified `format:check`, full suite, typecheck, lint and `npm run smoke` all green afterward. Not logged as a Rule-N deviation since it is pure formatting with zero behavior change, matching 03-01's identical precedent.

## User Setup Required

None - no external service configuration required. `MARKETS_TTL_MS` is optional and documented in `.env.example`; production leaves it unset.

## Next Phase Readiness

- The stale-serve fallback, its `onStale` hook, and the `MARKETS_TTL_MS` seam are ready for 03-03's frontend "prices delayed" banner and for a QA-run stale-path smoke case to consume deterministically.
- `getChart`, `CHART_WINDOWS` and the chart cache-key/TTL exports are ready for the trade page's `lightweight-charts` integration (D-37) — **handoff note for 03-03/the frontend phase:** wiring `lightweight-charts` and the trade page itself is out of this plan's scope fence (`web/**` is owned by 03-03), so no chart UI exists yet; only the backend endpoint does.
- No blockers. `GET /health` and the existing `/api/markets` markets-table path are verified unchanged (unmodified ping/health suites still pass; existing `npm run smoke` markets section still passes).

---
*Phase: 03-live-markets*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 9 modified files confirmed present on disk with their expected changes; both task commit hashes (`d3c402a`, `1f9fbd2`) confirmed present in git history; full API suite (156/156), typecheck, lint, format:check and `npm run smoke` all re-verified green after the final commit.

---
phase: 03-live-markets
plan: 01
subsystem: api
tags: [coingecko, fastify, cache, react, formatting, playwright]

requires:
  - phase: 01-foundation
    provides: coingecko.ts's TTL-cache + in-flight-dedupe pattern (T-01-17), D-09 error envelope, request-id logging discipline, scripts/smoke-dev.mjs's stub/browser harness
  - phase: 02-accounts
    provides: pure-view/stateful-wrapper page split (Wallet.tsx/HealthBadge.tsx), fetchHealth-style public FE client convention
provides:
  - "api/src/lib/keyedCache.ts — the single generalized keyed TTL cache + in-flight dedupe primitive in the repo"
  - "api/src/lib/marketData.ts — CoinGecko markets client with the USD-upstream/USDT-display convention (D-36 correction) and curated top-20 self-pair exclusion"
  - "public GET /api/markets serving { pairs, fetchedAt, stale } behind the closed D-03 schema"
  - "web/src/lib/format.ts — centralized magnitude-aware money/percent/compact/updated-at formatting (D-47) for Phases 4-5 to reuse"
  - "web/src/pages/Markets.tsx replacing the ComingSoon placeholder at /markets"
  - "a real-browser proof (npm run smoke) that the CoinGecko Demo key never reaches the browser"
affects: [03-02-chart-and-stale, 03-03-search-sort-poll, phase-4-wallet-trading]

actuals:
  tokens: 18400
  tasks: 3
  commits: 4

plan_head_before: 3e87ff1

tech-stack:
  added: []
  patterns:
    - "Keyed TTL cache + in-flight dedupe generalized behind a Map (createKeyedCache/createInFlightRegistry), replacing per-resource module-scoped promise slots"
    - "Deliberate client-facing 5xx (AppError subclass) bypasses the global D-09 masking handler via a local route-level try/catch, instead of weakening that handler's existing 500-always-masks guarantee"
    - "Pure-view (MarketsView) / stateful-wrapper (Markets) split with an injectable fetch function, matching HealthBadge/HealthBadgeView"

key-files:
  created:
    - api/src/lib/keyedCache.ts
    - api/src/lib/keyedCache.test.ts
    - api/src/lib/marketData.ts
    - api/src/lib/marketData.test.ts
    - api/src/routes/markets.ts
    - api/src/routes/markets.test.ts
    - web/src/lib/format.ts
    - web/src/lib/format.test.ts
    - web/src/pages/Markets.tsx
    - web/src/pages/Markets.test.tsx
  modified:
    - api/src/lib/coingecko.ts
    - api/src/app.ts
    - web/src/lib/api.ts
    - web/src/App.tsx
    - web/src/App.test.tsx
    - scripts/smoke-dev.mjs

key-decisions:
  - "In-memory Map cache for market data (not the SQLite upstream_checks table coingecko.ts uses) — no audit-trail requirement, cheaply rebuilt every 45s, Claude's Discretion per 03-CONTEXT.md"
  - "A 502 UPSTREAM_UNAVAILABLE AppError is sent directly by the markets route handler, bypassing the global D-09 error handler's 500-always-masks path, rather than weakening that handler (which app.test.ts explicitly locks for every other >=500 case)"
  - "MarketDataUpstreamError carries a machine reason (http_429/timeout/network/malformed_body) as an instance property for 03-02's future stale-serve logging, never exposed to the client via the D-09 fields member"

patterns-established:
  - "Keyed cache/dedupe (keyedCache.ts) is now the one primitive future resources (chart series in 03-02) key off of, not a copy-pasted per-resource promise slot"
  - "web/src/lib/format.ts is the one place display formatting lives — no ad-hoc toFixed() calls elsewhere"

requirements-completed: [DATA-01, DATA-02, DATA-04, MKT-01]

coverage:
  - id: D1
    description: "Generalized keyed TTL cache + in-flight dedupe (keyedCache.ts), and coingecko.ts refactored onto it with /ping behavior unchanged"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "api/src/lib/keyedCache.test.ts (9 tests)"
        status: pass
      - kind: unit
        ref: "api/src/lib/coingecko.test.ts (11 tests, unmodified)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CoinGecko markets client: USD-upstream/USDT-display convention, curated top-20 with self-pair exclusion, 45s TTL, keyless-capable (D-35)"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "api/src/lib/marketData.test.ts (13 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Public GET /api/markets returning { pairs, fetchedAt, stale } with a closed D-03 schema and a 502 UPSTREAM_UNAVAILABLE D-09 envelope on cold upstream failure"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "api/src/routes/markets.test.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "web/src/lib/format.ts: magnitude-aware price/percent/compact/updated-at formatting, including the sub-cent and absent-value cases"
    requirement: MKT-01
    verification:
      - kind: unit
        ref: "web/src/lib/format.test.ts (16 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "/markets renders the curated table (markets-table/markets-row/quote-convention test ids) via MarketsView/Markets, replacing the ComingSoon placeholder"
    requirement: MKT-01
    verification:
      - kind: unit
        ref: "web/src/pages/Markets.test.tsx (8 tests)"
        status: pass
      - kind: unit
        ref: "web/src/App.test.tsx (10 tests, incl. the new /markets-not-ComingSoon case)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A logged-out visitor in real Chrome sees 20 curated rows with no stablecoin self-pair and a legible sub-cent price; a second load is served from the server-side cache; every browser request stays on localhost/127.0.0.1 and carries the Demo key in no URL, header, body or log line"
    requirement: DATA-01
    verification:
      - kind: e2e
        ref: "npm run smoke (markets section) — SMOKE OK on 3 consecutive runs"
        status: pass
    human_judgment: false

duration: 36min
completed: 2026-09-16
status: complete
---

# Phase 3 Plan 1: Live Markets Tracer Slice Summary

**Live top-20 markets table at `/markets`, served from a generalized server-side keyed cache, proven end to end in real Chrome with the CoinGecko Demo key verifiably never reaching the browser.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-09-16T09:45:00Z (approx.)
- **Completed:** 2026-09-16T10:21:13Z
- **Tasks:** 3
- **Files modified:** 16 (10 created, 6 modified)

## Accomplishments

- Generalized `api/src/lib/coingecko.ts`'s single-resource TTL-cache/in-flight-dedupe pattern into `api/src/lib/keyedCache.ts` (`createInFlightRegistry` + `createKeyedCache`), the one dedupe primitive in the repo going forward; `coingecko.ts` now delegates to it with `/ping` behavior byte-for-byte unchanged (`coingecko.test.ts` passes unmodified)
- Built `api/src/lib/marketData.ts`: a CoinGecko `/coins/markets` client implementing the D-36 correction (upstream `vs_currency=usd`, display-only `USDT` quote convention), curated top-20 with quote-asset self-pair exclusion, D-35 keyless-capable behavior, and a 502 `UPSTREAM_UNAVAILABLE` D-09 envelope on cold upstream failure
- Added public `GET /api/markets` (`api/src/routes/markets.ts`) with a response schema closed (`additionalProperties: false`) at both the envelope and pair-item level, registered in `api/src/app.ts`
- Built `web/src/lib/format.ts`: centralized magnitude-aware `formatPrice`/`formatPercent`/`formatCompact`/`formatUpdatedAt`/`toPairLabel`, covering the sub-cent and absent-value cases explicitly
- Replaced the `/markets` `ComingSoon` placeholder with `web/src/pages/Markets.tsx` (`MarketsView`/`Markets` pure-view/stateful-wrapper split), fetching via the new `fetchMarkets` client in `web/src/lib/api.ts`
- Extended `scripts/smoke-dev.mjs` with a real-browser markets section: 20 curated rows render with no stablecoin self-pair, a sub-cent price stays legible, a second page load is served from the server-side cache with no new upstream hit, and every request the browser makes during the whole run is proven to stay on `localhost`/`127.0.0.1` and never carry the Demo key in a URL, header, body, or log line

## Task Commits

Each task was committed atomically:

1. **Task 1: Generalized keyed cache, CoinGecko markets client, public GET /api/markets** - `39ba1e6` (feat)
2. **Task 2: Markets in the browser — formatting module, fetch client, markets page** - `d91ec8b` (feat)
3. **Task 3: Prove the slice in a real browser** - `dbbadd0` (test), `f8548fe` (test, follow-up markets-table assertion)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `api/src/lib/keyedCache.ts` - generalized keyed TTL cache + in-flight dedupe (`createInFlightRegistry`, `createKeyedCache`)
- `api/src/lib/keyedCache.test.ts` - 9 unit tests covering dedupe races, TTL boundaries, rejection handling
- `api/src/lib/marketData.ts` - CoinGecko markets client, `toMarketPairs`, `createMarketDataService`, `MarketDataUpstreamError`
- `api/src/lib/marketData.test.ts` - 13 unit tests covering mapping, exclusion, dedupe, key handling, failure classification
- `api/src/routes/markets.ts` - public `GET /api/markets` route with closed response schema and a direct 502 D-09 envelope
- `api/src/routes/markets.test.ts` - 5 integration tests via `app.inject`
- `api/src/lib/coingecko.ts` - refactored onto the shared `createInFlightRegistry` primitive; behavior unchanged
- `api/src/app.ts` - registers `marketData` service + `marketsRoutes`
- `web/src/lib/format.ts` - centralized display formatting module (D-47)
- `web/src/lib/format.test.ts` - 16 unit tests
- `web/src/lib/api.ts` - `MarketPair`/`MarketsResponse` types + `fetchMarkets` (public, no credentials)
- `web/src/pages/Markets.tsx` - `MarketsView`/`Markets` — the new `/markets` page
- `web/src/pages/Markets.test.tsx` - 8 `renderToStaticMarkup` tests covering every visual state
- `web/src/App.tsx` - swaps the `/markets` route from `ComingSoon` to `Markets`
- `web/src/App.test.tsx` - moves `/markets` out of the shared `ComingSoon`-route loop, adds a dedicated Markets-page assertion
- `scripts/smoke-dev.mjs` - extends the stub with `/coins/markets`, records every browser request for the whole run, adds the markets browser section

## Decisions Made

- In-memory `Map` cache for market data rather than the SQLite `upstream_checks` table `coingecko.ts` uses — no audit-trail requirement here, and the value is cheaply rebuilt every 45s (Claude's Discretion per 03-CONTEXT.md)
- A 502 `UPSTREAM_UNAVAILABLE` `AppError` is sent directly by the markets route's own try/catch rather than relying on the global D-09 error handler, which masks every `>=500` status into a generic `INTERNAL_ERROR` by design (an existing, intentional `app.test.ts` case locks that masking behavior for every other 5xx — see Deviations below)
- `MarketDataUpstreamError` (an `AppError` subclass) carries a machine-readable `reason` (`http_429`/`timeout`/`network`/`malformed_body`) as an instance property, not via the D-09 `fields` member, so 03-02's future stale-serve logging can read it without ever exposing it to the client

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Global D-09 error handler masks a deliberate 502 into a generic 500**
- **Found during:** Task 1
- **Issue:** `api/src/lib/errors.ts`'s `errorHandler` masks ANY error with `statusCode >= 500` into a generic `INTERNAL_ERROR` envelope, by design — an existing `app.test.ts` case ("a 500-class error still returns the generic internal-error envelope ... even for an AppError-shaped throw") locks this in for every prior route. A `throw`n `MarketDataUpstreamError(502, "UPSTREAM_UNAVAILABLE", ...)` would therefore have reached the client as a masked 500, contradicting the plan's explicit `<verify>` requirement (`error.code === "UPSTREAM_UNAVAILABLE"`).
- **Fix:** `api/src/routes/markets.ts`'s handler wraps the `getMarkets` call in a local `try/catch`; on `AppError`, it sends the D-09 envelope directly (`reply.status(error.statusCode).send(errorBody(...))`), bypassing the global masking handler entirely rather than weakening it. The global handler itself is untouched, so its existing locked behavior for every other route is unaffected.
- **Files modified:** `api/src/routes/markets.ts`
- **Verification:** `markets.test.ts`'s 502 test passes; `app.test.ts`'s existing 500-masking test still passes unmodified.
- **Committed in:** `39ba1e6` (Task 1 commit)

**2. [Rule 1 - Bug] App.test.tsx's shared placeholder-route loop broke on the `/markets` swap**
- **Found during:** Task 2
- **Issue:** `web/src/App.test.tsx`'s `COMING_SOON_ROUTE_CASES` loop asserted `/markets` still rendered the `ComingSoon` placeholder text — swapping the route to `<Markets />` in `App.tsx` (a Task 2 file) broke that pre-existing test, which is not in Task 2's own `<files>` list.
- **Fix:** Moved `/markets` out of the shared loop (mirroring the existing 02-03 treatment of `/orders` when it became a guarded route), and added a dedicated test asserting the Markets page — not the placeholder — renders at `/markets` for a logged-out visitor.
- **Files modified:** `web/src/App.test.tsx`
- **Verification:** `npm --prefix web run test -- src/App.test.tsx` passes (10/10).
- **Committed in:** `d91ec8b` (Task 2 commit)

**3. [Rule 1 - Bug] Smoke script's first markets-hit assertion didn't account for the app's own `/` → `/markets` redirect**
- **Found during:** Task 3
- **Issue:** The app's index route redirects `/` to `/markets` (`<Navigate replace />`), and several earlier smoke-script sections already navigate to `/` — so by the time the dedicated markets section runs (after the pre-existing ~50-70s real-time health-poll wait in section (i)), a markets fetch had already happened outside this section's own 45s TTL window. Asserting an absolute stub-hit count of exactly 1 for this section's own navigation was therefore wrong — the earlier, legitimate fetch plus a fresh one after TTL expiry produced 2.
- **Fix:** Capture a baseline hit count immediately before this section's own navigation, and assert exactly one NEW hit for this section's load (dedup across the browser's StrictMode double-effect) and zero new hits after the explicit reload — isolating this section's own dedup/cache assertions from earlier sections' side effects.
- **Files modified:** `scripts/smoke-dev.mjs`
- **Verification:** `npm run smoke` prints `SMOKE OK` on 3 consecutive runs.
- **Committed in:** `dbbadd0` (Task 3 commit)

**4. [Rule 1 - Bug/Lint] `npm run lint` and `npm run format:check` surfaced pre-existing issues in newly written files**
- **Found during:** Task 3's final plan-level `<verification>` pass
- **Issue:** A `prefer-const` violation (two `let now` bindings never reassigned) in `keyedCache.test.ts`, and Prettier formatting drift in `marketData.test.ts`, `markets.test.ts`, `format.test.ts`, and `Markets.tsx` — both gates are required green by the plan's own `<verification>` block.
- **Fix:** Changed the two bindings to `const`; ran `prettier --write` on the four drifted files.
- **Files modified:** `api/src/lib/keyedCache.test.ts`, `api/src/lib/marketData.test.ts`, `api/src/routes/markets.test.ts`, `web/src/lib/format.test.ts`, `web/src/pages/Markets.tsx`
- **Verification:** `npm run lint` and `npm run format:check` both report clean.
- **Committed in:** `dbbadd0` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 Rule 1 bugs blocking the plan's own verification, 1 lint/format hygiene fix)
**Impact on plan:** All four were necessary to satisfy the plan's explicit `<verify>`/`<verification>` gates as written. No scope creep — no new features or architecture beyond what the plan specified.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required (the Demo key, if present, is already configured locally per D-35/03-CONTEXT.md; this plan adds no new env vars).

## Next Phase Readiness

- The keyed cache/dedupe primitive, the D-36 USD/USDT convention, and the pure-view/stateful-wrapper page split are all in place for 03-02 (chart + stale-serve) and 03-03 (search/sort/poll) to build on directly.
- `MarketDataUpstreamError`'s `reason` property is ready for 03-02's stale-serve logging to consume — no rework needed.
- No blockers. `GET /health` and its CoinGecko ping are verified unchanged.

---
*Phase: 03-live-markets*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 17 key files (created + modified + SUMMARY) confirmed present on disk; all 4 task commit hashes (`39ba1e6`, `d91ec8b`, `dbbadd0`, `f8548fe`) confirmed present in git history.

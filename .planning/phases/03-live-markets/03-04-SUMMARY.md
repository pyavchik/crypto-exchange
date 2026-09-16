---
phase: 03-live-markets
plan: 04
subsystem: ui
tags: [react, lightweight-charts, chart, react-router, playwright, coingecko]

requires:
  - phase: 03-live-markets
    provides: "03-02's GET /api/markets/:id/chart (CHART_WINDOWS, curated-list validation before any upstream call) and its D-43 stale-serve log line; 03-03's marketsPoller.ts/createMarketsPoller, poller.ts's receiver-safe createPoller<T>, StaleBanner.tsx, and the pure-view/stateful-wrapper split Markets.tsx established"
provides:
  - "web/src/lib/priceChart.ts — DOM-free createChartController: single chart construction, repeated setData without recreation, exactly one resize listener added/removed, idempotent destroy() through the library's own remove() call"
  - "web/src/components/PriceChart.tsx — React shell with two separate effects (lifecycle vs data), a chart-ready sentinel that only flips once real (non-empty) points have drawn"
  - "web/src/pages/Trade.tsx — TradeView/Trade/TradeIndex: pair header, 1D/7D/30D window selector, chart, prices-delayed banner, CoinGecko + quote-convention attribution, unknown-market and generic-error branches"
  - "web/src/lib/api.ts — fetchMarketChart(id, window) + ChartWindow/ChartPoint/ChartResponse types mirroring the API"
  - "markets table rows link to /trade/:id; App.tsx's trade routes replace the ComingSoon placeholder"
  - "scripts/smoke-dev.mjs — the chart, interaction and degraded-path browser sections, plus the whole-journey key/host security assertion moved to run after them"
affects: [phase-4-wallet-trading]

actuals:
  tokens: 18625
  tasks: 3
  commits: 3

plan_head_before: c0933243422e86950e7012a542086aa9ee67daf1

tech-stack:
  added: ["lightweight-charts@5.2.1 (D-37, TradingView's official package, Apache-2.0, audited clean per 03-RESEARCH.md — no blocking checkpoint required)"]
  patterns:
    - "Imperative canvas library lifecycle kept entirely outside React (priceChart.ts), tested against a hand-written fake chart factory — the same discipline that made poller.ts's WebIDL-receiver bug testable without a real browser"
    - "chartState in Trade.tsx never resets to \"loading\" once it has resolved once — a window switch fetches in the background and only replaces chartState on settle, so PriceChart stays mounted (never unmounts/remounts) across every 1D/7D/30D switch"
    - "PriceChart mounts only once chartState first resolves to \"ok\", never during the initial \"loading\" state — every points array it ever receives is therefore already guaranteed non-empty (toChartPoints throws on an empty upstream body), so its own chart-ready sentinel only ever reflects a genuinely drawn series"

key-files:
  created:
    - web/src/lib/priceChart.ts
    - web/src/lib/priceChart.test.ts
    - web/src/components/PriceChart.tsx
    - web/src/components/PriceChart.test.tsx
    - web/src/pages/Trade.tsx
    - web/src/pages/Trade.test.tsx
  modified:
    - web/package.json
    - package-lock.json
    - web/src/lib/api.ts
    - web/src/lib/api.test.ts
    - web/src/pages/Markets.tsx
    - web/src/pages/Markets.test.tsx
    - web/src/App.tsx
    - web/src/App.test.tsx
    - scripts/smoke-dev.mjs

key-decisions:
  - "PriceChart is gated on chartState.kind === \"ok\" (renders a \"Loading chart…\" line otherwise) rather than always mounted — mounting it unconditionally during the very first fetch would feed it an empty points array and flip its readiness sentinel before any real series had drawn"
  - "Trade's chart-fetch effect never resets chartState back to \"loading\" once it has succeeded once — a window switch keeps showing the previous window's chart until the new fetch settles, which is what keeps PriceChart's component instance (and therefore its underlying chart/canvas) stable across every switch instead of unmounting/remounting it"
  - "The unknown-market branch is reached either via chartState's UNKNOWN_MARKET error code or via the coin id being absent from the already-fetched markets payload — covers both \"the chart endpoint rejected it\" and \"the pair simply isn't in the curated list this page already has\" without waiting on the chart fetch specifically"
  - "The smoke script's canvas-leak assertion checks that the canvas count inside the chart container never grows past the count captured right after the first successful draw, rather than asserting a literal count of one — lightweight-charts composes several stacked canvases per chart instance (pane, crosshair, price/time axes), confirmed empirically when the first smoke run failed against a hardcoded \"exactly one\""
  - "MARKETS_TTL_MS is set to 10 seconds only inside the smoke script's own devEnv, letting the degraded-path section wait out a real expiry in ~13s rather than the production 45s default"

patterns-established:
  - "priceChart.ts's fake-chart-factory + fake-resize-target test harness is the template for any future imperative-library integration in this repo — the controller boundary keeps the whole lifecycle unit-testable without a DOM"
  - "TradeView/Trade/TradeIndex follow the same pure-view/stateful-wrapper split as MarketsView/Markets and HealthBadgeView/HealthBadge — every visual state (loading, unknown-market, generic error, full render) is reachable from renderToStaticMarkup"

requirements-completed: [MKT-04, MKT-05, DATA-01, DATA-03]

coverage:
  - id: D1
    description: "lightweight-charts@5.2.1 installed from the audited official package; priceChart.ts's DOM-free createChartController proven against a fake chart factory: single construction, no recreation across repeated setData, exactly one resize listener added/removed, idempotent destroy() through the library's own remove()"
    requirement: MKT-04
    verification:
      - kind: unit
        ref: "web/src/lib/priceChart.test.ts (10 tests)"
        status: pass
      - kind: unit
        ref: "web/src/components/PriceChart.test.tsx (1 test — markup-only, effects proven in priceChart.test.ts per the DOM-free split)"
        status: pass
    human_judgment: false
  - id: D2
    description: "web/src/lib/api.ts's fetchMarketChart(id, window): public (no credentials), URL-encodes the coin id, puts the window in the query, maps 404 UNKNOWN_MARKET and every other ApiError shape identically to fetchMarkets"
    requirement: MKT-04
    verification:
      - kind: unit
        ref: "web/src/lib/api.test.ts — fetchMarketChart describe block (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Trade.tsx: pair label, formatted price, 24h change with direction attribute, three 1D/7D/30D window controls with an active marker, the prices-delayed banner driven by the markets payload's own stale flag, CoinGecko + quote-convention attribution, an unknown-market branch keyed on the error code (not an echo of the raw id), and a generic-error branch surfacing the request id when present"
    requirement: MKT-04
    verification:
      - kind: unit
        ref: "web/src/pages/Trade.test.tsx (11 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Markets rows link to /trade/:id; App.tsx's trade and trade/:id routes render TradeIndex/Trade instead of the ComingSoon placeholder, including for a logged-out visitor (market data is public, D-44)"
    requirement: MKT-04
    verification:
      - kind: unit
        ref: "web/src/pages/Markets.test.tsx (updated — asserts href=\"/trade/<id>\" on each row) and web/src/App.test.tsx (new /trade and /trade/:id route tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real Chrome proof: clicking a markets row lands on its trade route; the chart reports ready and draws a sized canvas; switching 1D->7D->30D produces one new chart upstream hit per switch with no growth in the chart's own canvas set (no leaked duplicate instance); the search box filters client-side with zero new /api/markets requests; clicking the price header twice produces two genuinely different leading rows; forcing a 429 past the shortened cache TTL produces a dated prices-delayed banner over a still-populated table plus a matching \"serving stale market data\" log line carrying a request id and reason; the banner clears on recovery; every request across the whole journey stayed on localhost/127.0.0.1 and carried the Demo key in no URL, header or body (DATA-01/DATA-03)"
    requirement: DATA-01
    verification:
      - kind: e2e
        ref: "npm run smoke — SMOKE OK on 2 consecutive runs"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual/UX judgment the plan's own <human-check> asks for: opening the app in a real browser, the chart should visibly draw and redraw in place across 1D/7D/30D with no flash or a second chart appearing, and the TradingView attribution logo required by the chart library's licence should be visible in the chart's corner"
    requirement: MKT-04
    verification: []
    human_judgment: true
    rationale: "npm run smoke's canvas-size and canvas-count-stability assertions prove the chart drew and did not leak a duplicate instance structurally, but \"no visible flash\" and \"the TradingView logo is visible in the corner\" are genuinely visual judgments the plan's own <verify><human-check> calls for and that a canvas-count assertion cannot substitute for."

duration: ~50min
completed: 2026-09-16
status: complete
---

# Phase 3 Plan 4: Chart Controller, Trade Page and the Full Browser Proof Summary

**Trade page with a real `lightweight-charts` price chart switchable across 1D/7D/30D, wired from the markets table, proven end-to-end in real Chrome — including the chart drawing/redrawing without leaking an instance, and the degraded-prices path via a forced upstream failure.**

## Performance

- **Duration:** ~50 min (approx.)
- **Started:** 2026-09-16T11:05:08Z (approx., immediately after 03-03)
- **Completed:** 2026-09-16T11:55:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 15 (6 created, 9 modified)

## Accomplishments

- Installed `lightweight-charts@5.2.1` (D-37) — TradingView's own official package, Apache-2.0, no install script, audit already clean per 03-RESEARCH.md, so no blocking install checkpoint was required. Confirmed the resolved version in `web/package.json` and the updated lockfile.
- Built `web/src/lib/priceChart.ts`: the entire imperative chart lifecycle (mount, resize, `setData`, `destroy`) as a DOM-free, injectable controller, proven against a hand-written fake chart factory — single construction, repeated `setData` calls without recreating the chart, exactly one resize listener added and removed, and idempotent `destroy()` (a double teardown or a late `setData` after destroy is a no-op, not a throw) through the library's own `remove()` call.
- Built `web/src/components/PriceChart.tsx`: two separate effects (lifecycle vs. data) so a 30-second poll tick never tears the chart down, and a `chart-ready` sentinel gated on the parent only ever mounting it with real data (see Deviations).
- Built `web/src/pages/Trade.tsx` (`TradeView`/`Trade`/`TradeIndex`): pair label, formatted price and 24h change, three window controls, the prices-delayed banner, CoinGecko + quote-convention attribution, an unknown-market branch keyed on the error's code, and a generic-error branch. `TradeIndex` redirects the bare `/trade` route to the first curated pair without hardcoding a coin id (D-36).
- Wired the markets table's pair cells to `/trade/:id` and replaced `App.tsx`'s `/trade` `ComingSoon` placeholder with the new routes.
- Extended `scripts/smoke-dev.mjs` with a chart section (click-through, chart-ready, sized canvas, three-window switch with no canvas-count growth), an interactions section (client-side search with zero network calls, real column-header sort reordering), and a degraded-path section (forced 429 via a new stub control path, the dated prices-delayed banner, the stale-serve log line, and recovery) — closing with the whole-journey key/host security assertion re-run over every request the entire journey made.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install the chart library and build the chart lifecycle as a testable controller** - `476e5b0` (feat)
2. **Task 2: The trade page — pair header, window selector, chart, banner, attribution, routes** - `b09b813` (feat)
3. **Task 3: Prove the phase in a real browser — chart, interaction, the degraded path, and the key** - `7b1d5f4` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `web/src/lib/priceChart.ts` - DOM-free chart lifecycle controller (`toSeriesData`, `createChartController`, `ChartController`)
- `web/src/lib/priceChart.test.ts` - 10 tests against a fake chart factory/resize target
- `web/src/components/PriceChart.tsx` - React shell mounting the controller once, feeding it data on a separate effect
- `web/src/components/PriceChart.test.tsx` - markup-only `renderToStaticMarkup` test
- `web/src/pages/Trade.tsx` - `TradeView`/`Trade`/`TradeIndex`
- `web/src/pages/Trade.test.tsx` - 11 tests covering every visual state
- `web/src/lib/api.ts` - `ChartWindow`/`ChartPoint`/`ChartResponse` types + `fetchMarketChart`
- `web/src/lib/api.test.ts` - `fetchMarketChart` describe block (4 tests)
- `web/src/pages/Markets.tsx` - pair cells now link to `/trade/:id`
- `web/src/pages/Markets.test.tsx` - every `MarketsView` render now wrapped in a `MemoryRouter` (the new `Link` requires router context)
- `web/src/App.tsx` - `trade`/`trade/:id` routes replace the `ComingSoon` placeholder
- `web/src/App.test.tsx` - dedicated `/trade` and `/trade/:id` route tests replace the removed `it.each` `ComingSoon` case
- `scripts/smoke-dev.mjs` - chart/interactions/degraded-path browser sections; security assertion moved to run last
- `web/package.json` / `package-lock.json` - `lightweight-charts@5.2.1`

## Decisions Made

- `PriceChart` is gated on `chartState.kind === "ok"` rather than always mounted, so its readiness sentinel only ever reflects a genuinely drawn, non-empty series (see Deviations for why).
- `Trade`'s chart-fetch effect never resets `chartState` back to `"loading"` once it has resolved once, which is what keeps `PriceChart` mounted continuously (never unmounted/remounted) across every 1D/7D/30D window switch.
- The unknown-market branch triggers on either the chart endpoint's `UNKNOWN_MARKET` error code or the coin id being locally absent from the already-fetched markets payload.
- `MARKETS_TTL_MS` is overridden to 10 seconds only inside the smoke script's own `devEnv`, letting the degraded-path section wait out a real cache expiry in ~13 seconds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PriceChart mounted unconditionally, flipping its readiness sentinel on empty data**
- **Found during:** Task 3, while writing the chart-ready browser assertion
- **Issue:** The first draft of `Trade.tsx` rendered `<PriceChart>` in every state once a pair was found, passing an empty array while the chart's first fetch was still in flight. `PriceChart`'s data effect calls `setData` (and flips readiness) on every points update regardless of length, so the `chart-ready` sentinel could appear before any real series had drawn — undermining the sentinel's whole purpose.
- **Fix:** `TradeView` now renders `<PriceChart>` only once `chartState.kind === "ok"` (showing a `"Loading chart…"` line before that); combined with the wrapper never resetting `chartState` back to `"loading"` after its first success, `PriceChart` mounts exactly once, always with real, non-empty points, and then stays mounted through every subsequent window switch.
- **Files modified:** `web/src/pages/Trade.tsx`
- **Verification:** `web/src/pages/Trade.test.tsx` (11/11) and `npm run smoke`'s chart section (chart-ready + sized canvas) both pass.
- **Committed in:** `7b1d5f4` (Task 3 commit)

**2. [Rule 1 - Bug] Canvas-leak assertion asserted a hardcoded "exactly one" canvas**
- **Found during:** Task 3, first `npm run smoke` run (failed: "found 7")
- **Issue:** `lightweight-charts` composes several stacked canvases per single chart instance (the main pane, the crosshair layer, the price/time axes) — a real, empirically-observed fact about the library, not a bug. The plan's literal "assert that exactly one canvas element exists" wording assumed one canvas per chart, which does not hold for this library.
- **Fix:** The smoke script now captures the canvas count right after the chart's first successful draw as a baseline, and asserts every later count (after each window switch) equals that baseline exactly — still catching the real leak (a second chart instance stacking a whole extra set of canvases), just not against a hardcoded literal.
- **Files modified:** `scripts/smoke-dev.mjs`
- **Verification:** `npm run smoke` prints `SMOKE OK` on 2 consecutive runs after the fix.
- **Committed in:** `7b1d5f4` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs discovered while building and running Task 3's own browser proof)
**Impact on plan:** Both were necessary to make the plan's own `<verify>`/`<done>` claims (a sentinel that proves real drawing; a leak check that means what it says) actually true against the real library, not scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3's five success criteria are all now proven in real Chrome: the markets table (03-01/03-03), the stale-serve fallback (03-02/03-03), and this plan's chart/trade page and degraded-path proof.
- `web/src/lib/priceChart.ts`'s controller boundary and its fake-factory test harness are ready for any future imperative-library integration to reuse the same pattern.
- `Trade.tsx`'s quote-convention restatement (D-36) is explicitly there for Phase 4's order form to inherit — it lands on this same page.
- No blockers. Full API suite (156/156), full web suite (175/175), typecheck, lint, format:check and `npm run smoke` (2 consecutive `SMOKE OK` runs) all green.

---
*Phase: 03-live-markets*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 15 key files (6 created + 9 modified) confirmed present on disk with their expected changes; all 3 task commit hashes (`476e5b0`, `b09b813`, `7b1d5f4`) confirmed present in git history; full API suite (156/156), full web suite (175/175), typecheck, lint, format:check and `npm run smoke` (2 consecutive SMOKE OK runs) all re-verified green after the final commit.

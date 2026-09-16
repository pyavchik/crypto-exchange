---
phase: 03-live-markets
plan: 03
subsystem: ui
tags: [react, poller, timers, search, sort, coingecko]

requires:
  - phase: 03-live-markets
    provides: "03-01's Markets.tsx tracer slice (MarketsView/Markets split, fetchMarkets client, format.ts) and 03-02's { pairs, fetchedAt, stale } payload shape served by GET /api/markets"
provides:
  - "web/src/lib/poller.ts — the single visibility-aware, receiver-safe polling implementation in the repo, generic over its payload (createPoller<T>)"
  - "web/src/lib/marketsPoller.ts — 30s visibility-aware poll of GET /api/markets (D-40), a thin wrapper over createPoller"
  - "web/src/lib/marketsTable.ts — pure client-side search, sort and null-last comparison over the cached payload (D-46/MKT-03)"
  - "web/src/components/StaleBanner.tsx — the prices-delayed banner driven purely by the payload's own stale flag and fetchedAt (D-42)"
  - "web/src/pages/Markets.tsx rewired to all four: auto-refresh, last-updated, search, sortable columns, banner, page attribution"
affects: [03-04-chart-and-trade, phase-4-wallet-trading]

actuals:
  tokens: 18917
  tasks: 3
  commits: 3

plan_head_before: 693cd8ae69900689de2112aae05d989fd7df2bf9

tech-stack:
  added: []
  patterns:
    - "createPoller<T>() is now the single generic, receiver-safe polling primitive in the repo; createHealthPoller and createMarketsPoller are both thin wrappers over it, so the WebIDL timer-receiver fix (wiki/pages/findings/health-poller-illegal-invocation.md) applies to every future poller by construction"
    - "Derived, never-stored table state: MarketsView computes filterMarkets(...) then sortMarkets(...) on every render from the payload, query and sort props — a fresh poll can never desync from what a user is currently searching or sorting"
    - "Pure-view banner (StaleBanner) driven entirely by the payload's own stale/fetchedAt props, no wrapper or poller of its own — same discipline as HealthBadgeView"

key-files:
  created:
    - web/src/lib/poller.ts
    - web/src/lib/poller.test.ts
    - web/src/lib/marketsPoller.ts
    - web/src/lib/marketsPoller.test.ts
    - web/src/lib/marketsTable.ts
    - web/src/lib/marketsTable.test.ts
    - web/src/components/StaleBanner.tsx
    - web/src/components/StaleBanner.test.tsx
  modified:
    - web/src/lib/healthPoller.ts
    - web/src/pages/Markets.tsx
    - web/src/pages/Markets.test.tsx
    - scripts/smoke-dev.mjs

key-decisions:
  - "createPoller<T>'s intervalMs is a required option with no default (each consumer — healthPoller.ts, marketsPoller.ts — supplies its own), since there is no sensible generic default across payload types"
  - "scripts/smoke-dev.mjs's markets-section upstream-hit assertion loosened from 'exactly 1 new hit' to '0 or 1 new hits, never 2+' — the new 30s background poller can legitimately keep the server-side 45s cache warm across an earlier section's 50-70s real-time wait, producing zero new hits at this section's own navigation without that being a bug"

patterns-established:
  - "poller.ts is now the one place any future visibility-aware polling in this repo is built from — no second hand-rolled poller should ever be written"
  - "marketsTable.ts is the one place client-side search/sort/comparison logic for tabular payloads lives — compareNullable's null-last-regardless-of-direction rule and the coin-id tie-break are the pattern any future sortable table should reuse"

requirements-completed: [MKT-01, MKT-02, MKT-03, MKT-05, DATA-03]

coverage:
  - id: D1
    description: "poller.ts: the single generic, receiver-safe polling implementation (createPoller<T>), extracted verbatim from createHealthPoller; healthPoller.ts is now a thin wrapper with its own suite (incl. strict-receiver block) passing unmodified"
    requirement: MKT-01
    verification:
      - kind: unit
        ref: "web/src/lib/poller.test.ts (15 tests, incl. its own strict-receiver describe block)"
        status: pass
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts (14 tests, unmodified)"
        status: pass
    human_judgment: false
  - id: D2
    description: "marketsPoller.ts: MARKETS_POLL_INTERVAL_MS = 30_000 (D-40), createMarketsPoller as a thin wrapper over createPoller defaulting to fetchMarkets, with its own strict-receiver describe block"
    requirement: MKT-01
    verification:
      - kind: unit
        ref: "web/src/lib/marketsPoller.test.ts (13 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "marketsTable.ts: filterMarkets (case-insensitive substring match on name/symbol), compareNullable (absent values always last regardless of direction), sortMarkets (deterministic coin-id tie-break, never mutates input), nextSortState (D-46/MKT-02/MKT-03)"
    requirement: MKT-03
    verification:
      - kind: unit
        ref: "web/src/lib/marketsTable.test.ts (17 tests, fixture spanning eight orders of magnitude with an absent value and an exact tie)"
        status: pass
    human_judgment: false
  - id: D4
    description: "StaleBanner.tsx: pure, props-only banner rendering nothing when fresh and a dated 'Prices delayed' warning when the payload's stale flag is true, safe on a null timestamp (D-42)"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "web/src/components/StaleBanner.test.tsx (4 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Markets.tsx rewired: search input (markets-search), last-updated line (markets-updated) derived from the payload's own fetchedAt, sortable price/24h%/volume column headers as real buttons carrying data-sort-key/data-sort-direction, no-matches line, the StaleBanner, and page-level CoinGecko attribution (MKT-05/D-48) alongside the shell footer link"
    requirement: MKT-02
    verification:
      - kind: unit
        ref: "web/src/pages/Markets.test.tsx (15 tests via renderToStaticMarkup)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full plan-level verification: complete web suite (149/149), typecheck, build, repo-wide lint and format:check, and npm run smoke (markets section) all green after every task"
    verification:
      - kind: unit
        ref: "npm --prefix web run test (149/149)"
        status: pass
      - kind: e2e
        ref: "npm run smoke — SMOKE OK on 2 consecutive runs"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real 30s-timer auto-refresh, real typing in the search box and real column-header clicking in an actual browser"
    human_judgment: true
    rationale: "There is no DOM/testing-library in this workspace (vitest.config.ts environment: node) — this plan proves the pure functions and props-driven visual states via renderToStaticMarkup only, as the plan's own objective states. Real interactive/timer proof is deliberately deferred to 03-04's browser smoke step and 03-05's manual QA cases, not a coverage gap in this plan."

duration: 13min
completed: 2026-09-16
status: complete
---

# Phase 3 Plan 3: Live Markets — Poller, Search/Sort, Stale Banner Summary

**The markets table is now live: a shared receiver-safe poller drives a 30s visibility-aware refresh, client-side search and sort run entirely off the cached payload, and a dated "prices delayed" banner renders straight from the API's own stale flag.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-16T10:49:27Z
- **Completed:** 2026-09-16T11:03:17Z
- **Tasks:** 3
- **Files modified:** 12 (8 created, 4 modified)

## Accomplishments

- Extracted `web/src/lib/poller.ts`'s `createPoller<T>` from `createHealthPoller` — the single visibility-aware, receiver-safe polling implementation in the repo, generic over its payload. `healthPoller.ts` is now a thin wrapper over it; its own suite, including the strict-receiver block that catches the browser-only `Illegal invocation` bug class, passes unmodified.
- Built `web/src/lib/marketsPoller.ts`: `MARKETS_POLL_INTERVAL_MS = 30_000` (D-40) and `createMarketsPoller`, a thin wrapper over `createPoller` defaulting to `fetchMarkets`, with its own strict-receiver describe block reproducing the browser's WebIDL timer-receiver rule inside Vitest.
- Built `web/src/lib/marketsTable.ts`: `filterMarkets`, `compareNullable`, `sortMarkets`, `nextSortState` (D-46/MKT-02/MKT-03) — pure, client-side, no server round-trip. `compareNullable` never subtracts a possibly-absent value and always places it last regardless of sort direction; `sortMarkets` breaks exact ties deterministically by coin id.
- Built `web/src/components/StaleBanner.tsx`: a pure, props-only banner (D-42) rendering nothing when the payload's `stale` flag is false and a dated "Prices delayed" warning when it is true, safe on a null timestamp.
- Rewired `web/src/pages/Markets.tsx`: the search input, the last-updated line (derived from the payload's own `fetchedAt`, never local request time), sortable price/24h%/volume column headers as real buttons, an explicit no-matches line, the stale banner, and page-level CoinGecko attribution — all wired to a `createMarketsPoller` instance owned by the stateful `Markets` wrapper via an injectable factory prop.

## Task Commits

Each task was committed atomically:

1. **Task 1: One receiver-safe poller, generic over its payload, plus the 30s markets poller** - `64973a1` (feat)
2. **Task 2: Pure search, sort and null-last comparison, and the prices-delayed banner** - `83ee5eb` (feat)
3. **Task 3: Wire the markets page — auto-refresh, last updated, search, sortable columns, banner** - `93c491e` (feat, includes the scripts/smoke-dev.mjs deviation fix below)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `web/src/lib/poller.ts` - `createPoller<T>`, the shared receiver-safe polling implementation
- `web/src/lib/poller.test.ts` - generic behavior suite (15 tests, incl. strict-receiver block)
- `web/src/lib/healthPoller.ts` - now a thin wrapper over `createPoller`; public surface unchanged
- `web/src/lib/marketsPoller.ts` - `createMarketsPoller`, `MARKETS_POLL_INTERVAL_MS`
- `web/src/lib/marketsPoller.test.ts` - markets-specific suite (13 tests, incl. its own strict-receiver block)
- `web/src/lib/marketsTable.ts` - `filterMarkets`, `compareNullable`, `sortMarkets`, `nextSortState`, `SORT_KEYS`
- `web/src/lib/marketsTable.test.ts` - 17 tests over a fixture spanning eight orders of magnitude with an absent value and an exact tie
- `web/src/components/StaleBanner.tsx` - the pure, props-only prices-delayed banner
- `web/src/components/StaleBanner.test.tsx` - 4 `renderToStaticMarkup` tests
- `web/src/pages/Markets.tsx` - `MarketsView`/`Markets` rewired to search/sort/poll/banner/attribution
- `web/src/pages/Markets.test.tsx` - extended to 15 tests covering every new visual state
- `scripts/smoke-dev.mjs` - markets-section upstream-hit assertion loosened (see Deviations)

## Decisions Made

- `createPoller<T>`'s `intervalMs` is a required option with no default — each consumer (`healthPoller.ts`, `marketsPoller.ts`) supplies its own, since there is no sensible generic default across payload types.
- `scripts/smoke-dev.mjs`'s markets-section upstream-hit assertion loosened from "exactly 1 new hit" to "0 or 1 new hits, never 2+" (see Deviations below for the full rationale).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `scripts/smoke-dev.mjs`'s markets-hit assertion no longer held once the markets page ran its own background poller**
- **Found during:** Task 3's plan-level `<verification>` pass (`npm run smoke`)
- **Issue:** The assertion at the markets smoke section required exactly one NEW upstream hit for that section's own navigation. Section (i) parks the browser on `/` (redirected to `/markets`) for a real 50-70 second wait (proving the health poller's 60s cadence). With the markets page's own new 30s visibility-aware poller now running during that wait, a background refresh can land and keep the server-side 45s markets cache warm right up to the markets section's later navigation — legitimately producing ZERO new upstream hits there (data still served correctly, from the warm cache), not a regression. This is a direct, expected consequence of this plan's own D-40 requirement, not a bug in the new poller.
- **Fix:** Loosened the assertion to accept 0 (already warm from the background poller) or 1 (cache had expired, a fresh dedup'd fetch) new hits, while still failing on 2+ (a genuine double-effect dedup regression, the assertion's original purpose).
- **Files modified:** `scripts/smoke-dev.mjs`
- **Verification:** `npm run smoke` -> `SMOKE OK` on 2 consecutive runs after the fix.
- **Committed in:** `93c491e` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug, required by this plan's own `<verification>` block)
**Impact on plan:** Necessary to satisfy the plan's explicit `npm run smoke` verification gate as written, and a direct, expected consequence of shipping D-40's background poller rather than scope creep.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `poller.ts`'s generic `createPoller<T>` is ready for any future visibility-aware poller in this repo to build on directly — no second hand-rolled implementation should ever be needed.
- `marketsTable.ts`'s `compareNullable`/tie-break pattern is ready for 03-04's chart range selector or any future sortable table to reuse.
- `StaleBanner.tsx` is ready to be reused verbatim on the trade page (03-04) if that page's chart data can also go stale.
- No blockers. `GET /health` and the health badge poller are verified unchanged; the existing `markets-table`/`markets-row`/`quote-convention` smoke assertions from 03-01 still pass unmodified.
- 03-04 (chart + trade page) can proceed — this plan's scope fence (`web/**`, no `api/**` changes) was held throughout.

---
*Phase: 03-live-markets*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 12 key files (8 created + 4 modified) confirmed present on disk with their expected changes; all 3 task commit hashes (`64973a1`, `83ee5eb`, `93c491e`) confirmed present in git history; full web suite (149/149), typecheck, build, repo-wide lint, format:check and `npm run smoke` all re-verified green after the final commit.

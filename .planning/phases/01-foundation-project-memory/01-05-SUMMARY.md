---
phase: 01-foundation-project-memory
plan: 05
subsystem: ui
tags: [react, react-router, vitest, visibility-api, request-id, health-check]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: "fetchHealth/ApiError/HealthResponse contract, HealthBadge and App shell tracer versions to replace (01-01); ESLint/Prettier/typecheck gates the new files must pass (01-02)"
provides:
  - "web/src/lib/healthPoller.ts: createHealthPoller — visibility-aware polling state machine (HEALTH_POLL_INTERVAL_MS, HealthState, VisibilityAdapter, HealthPoller)"
  - "web/src/lib/api.ts: fetchHealth parses D-09 { error: { code, message, requestId } } bodies into ApiError, with an HTTP_<status> + header-request-id fallback"
  - "web/src/components/HealthBadge.tsx: pure HealthBadgeView (status tones, request-id-on-failure, Re-check button) plus the HealthBadge container wiring the poller to document.visibilitychange"
  - "web/src/App.tsx: AppLayout dark shell, appRoutes RouteObject tree (index redirect, four placeholder routes, catch-all not-found), App/AppRoutes"
  - "web/src/pages/ComingSoon.tsx and web/src/styles/theme.css: placeholder page and dark Binance-style theme tokens/classes for phases 2-5 to fill in without restyling"
affects: [01-06, 01-07, 01-08, 02-accounts, 03-markets, 04-wallet-trading, 05-limit-orders]

# Actuals (#2632)
actuals:
  tokens: 7832
  tasks: 2
  commits: 3
  plan_head_before: effb703c556d608b35c985d3e49a15eb27dc9f8c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "healthPoller.ts: dependency-injected timers/now/visibility adapter so the visibility-aware polling state machine is fully unit-testable under vi.useFakeTimers with no DOM library"
    - "HealthBadgeView / HealthBadge split: pure, renderToStaticMarkup-testable view component vs. a container that owns the poller lifecycle (mount = start, unmount = stop) — safe under React StrictMode's double mount"
    - "fetchHealth's D-09 error-body parsing: try JSON-parse the non-2xx body, use error.code when present (with error.requestId or the X-Request-Id header), else synthesize HTTP_<status> with the header id"

key-files:
  created:
    - web/src/lib/healthPoller.ts
    - web/src/lib/healthPoller.test.ts
    - web/src/components/HealthBadge.test.tsx
    - web/src/App.test.tsx
    - web/src/pages/ComingSoon.tsx
    - web/src/styles/theme.css
  modified:
    - web/src/lib/api.ts
    - web/src/lib/api.test.ts
    - web/src/components/HealthBadge.tsx
    - web/src/App.tsx
    - web/src/main.tsx

key-decisions:
  - "Poller scheduling is always relative to the last fetch's start time and current visibility, not a single global timer: on every fetch settlement the poller re-checks visibility.isVisible() before rescheduling, and the visibilitychange listener recomputes elapsed-since-last-fetch to either fire immediately or schedule the remaining delay — this is what makes both the 'hidden makes no further call' and 'visible after N seconds' behaviors correct without a second timer"
  - "ApiError's frozen 3-arg constructor (status, code, requestId) is kept exactly as-is; the JSON body's optional error.message is applied by reassigning error.message after construction rather than widening the constructor signature"
  - "HealthBadge's container-level 'checking' state is only synchronized around the container's own start()/refresh() calls (not on every internal periodic poll), since there is no onCheckingChange callback in the poller interface and no DOM test harness (jsdom/testing-library are excluded by CONTEXT.md/01-01's package gate) to assert live click/disabled behavior — this is deliberately deferred to the end-of-phase human check (Task 2 human-check item 5)"

patterns-established:
  - "Node-environment-only web tests: vi.useFakeTimers() + injected timers for state-machine logic, react-dom/server renderToStaticMarkup for view components — no DOM library added, matching 01-01's package legitimacy gate"

requirements-completed: [FND-01, FND-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Dark Binance-style app shell: top nav (Markets/Trade/Wallet/Orders), main content area, footer with health badge and Powered by CoinGecko link (D-01)"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/App.test.tsx#AppRoutes > renders the shell and the $title page at $path (all 4 cases)"
        status: pass
    human_judgment: true
    rationale: "Visual styling (dark background, yellow accent, active-link highlight) can only be judged by a human viewing the rendered page; structural presence of the shell/nav/footer is proven by the test above."
  - id: D2
    description: "Each of /markets, /trade, /wallet, /orders renders its own title and coming-soon message; / redirects to /markets; an unknown path renders Page not found inside the same shell"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/App.test.tsx#AppRoutes > renders the shell and the $title page at $path (all 4 cases)"
        status: pass
      - kind: unit
        ref: "web/src/App.test.tsx#AppRoutes > renders the not-found page inside the shell for an unknown path"
        status: pass
      - kind: unit
        ref: "web/src/App.test.tsx#AppRoutes > redirects / to /markets via a Navigate index route"
        status: pass
    human_judgment: false
  - id: D3
    description: "The health badge fetches GET /health on load and every 60s only while the tab is visible; on regaining visibility it fetches immediately or after the remaining time depending on elapsed time since the last fetch (D-02)"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#createHealthPoller (all 8 cases: immediate+60s, hidden-no-call, visible-90s-immediate, visible-20s-delayed, refresh-idle, refresh-dedupe, error-state, stop-cleanup)"
        status: pass
    human_judgment: true
    rationale: "Real browser tab-visibility timing and the Network-tab request cadence (Task 2 human-check items 4/6) can only be confirmed by a human switching tabs and watching DevTools; the state-machine logic itself is fully proven under fake timers."
  - id: D4
    description: "The badge displays the API status and the CoinGecko status as one of ok, degraded, down, not configured, each with a distinct colour token"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/components/HealthBadge.test.tsx#HealthBadgeView > renders its own data-status value for %s (ok, degraded, down) and > shows API ok and CoinGecko: not configured with data-status not_configured"
        status: pass
      - kind: other
        ref: "grep -q -- \"--color-accent\" web/src/styles/theme.css && grep -q \"data-status\" web/src/styles/theme.css"
        status: pass
    human_judgment: true
    rationale: "The actual rendered colours (yellow accent, green up, red down, muted grey) are a visual property confirmed in the end-of-phase human check (Task 2 human-check item 3)."
  - id: D5
    description: "When GET /health fails, the badge shows API unreachable and, when available, Request ID: <id>, so a bug report can quote it"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/components/HealthBadge.test.tsx#HealthBadgeView > shows API unreachable and the request id when the error carries one, and > shows no Request ID text when the error carries none"
        status: pass
    human_judgment: false
  - id: D6
    description: "Clicking Re-check triggers exactly one immediate /health fetch; a second click while in flight starts no second request"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#createHealthPoller > refresh() while idle makes one immediate call and restarts the 60s schedule from it, and > refresh() twice while the first fetch is pending starts exactly one request"
        status: pass
    human_judgment: true
    rationale: "The dedupe/scheduling logic behind refresh() is fully unit-tested; the actual button click and its disabled-while-checking visual state in a real browser are confirmed in the end-of-phase human check (Task 2 human-check item 5), since no DOM test library is installed (01-01 package gate)."
  - id: D7
    description: "Stopping the poller (component unmount, including React StrictMode's double mount) aborts any in-flight request, clears the pending timer and removes the visibility listener; no state update happens afterwards"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#createHealthPoller > stop() aborts the in-flight request, clears the timer and unsubscribes, with no update afterwards"
        status: pass
    human_judgment: false
  - id: D8
    description: "fetchHealth D-09 error-body parsing: JSON error.code/message/requestId honoured; non-JSON body falls back to HTTP_<status> + header request id; an aborted signal rethrows as-is instead of NETWORK_ERROR"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/lib/api.test.ts#fetchHealth > rejects with the ApiError code and requestId parsed from a JSON error body, > falls back to HTTP_<status> and the header request id on a non-JSON error body, > rethrows an aborted signal's error instead of wrapping it as NETWORK_ERROR"
        status: pass
    human_judgment: false
  - id: D9
    description: "Threat mitigations: no dangerouslySetInnerHTML in web/src; no CoinGecko endpoint/key anywhere in web/; reverse-tabnabbing-safe attribution link"
    verification:
      - kind: other
        ref: "grep -rn dangerouslySetInnerHTML web/src (empty); grep -rniE 'x-cg-demo-api-key|coingecko_api_key|api\\.coingecko\\.com' web/src web/index.html web/vite.config.ts (empty); grep -q 'noopener noreferrer' web/src/App.tsx"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 5: Health Poller, Badge and Dark App Shell Summary

**Visibility-aware `createHealthPoller` state machine plus a pure `HealthBadgeView`/`HealthBadge` split, wired into a dark Binance-style `react-router` shell with four placeholder routes (Markets/Trade/Wallet/Orders) and CoinGecko attribution.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-15 (continuing from 01-02 in a parallel worktree agent)
- **Completed:** 2026-09-15T18:09:23Z
- **Tasks:** 2 (Task 1 TDD: RED → GREEN; Task 2 standard)
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- `web/src/lib/healthPoller.ts`: `createHealthPoller` polls `GET /health` immediately on `start()` and every 60s (`HEALTH_POLL_INTERVAL_MS`) only while `document.visibilityState` is visible; on regaining visibility it either fetches immediately (elapsed ≥ 60s) or schedules the remaining delay; `refresh()` dedupes to one in-flight fetch; `stop()` aborts the in-flight request, clears the timer and unsubscribes, guaranteeing no `onUpdate` after stop (React StrictMode double-mount safe)
- `web/src/lib/api.ts`: `fetchHealth` now parses D-09's `{ error: { code, message, requestId } }` body shape into `ApiError`, falling back to a synthetic `HTTP_<status>` code + the `X-Request-Id` header when the body is missing/non-JSON; aborted signals still rethrow as-is instead of becoming `NETWORK_ERROR`
- `web/src/components/HealthBadge.tsx`: pure `HealthBadgeView` renders loading/ok/error states with `data-status` tone attributes, the request ID on failure, and a `type="button"` Re-check button (`aria-label`, disabled while checking) using only React text children (no raw HTML injection); `HealthBadge` container creates the poller with a `document.visibilitychange`-backed adapter in `useEffect` and stops it on cleanup
- `web/src/App.tsx`: `AppLayout` dark shell (nav with brand + 4 `NavLink`s, `Outlet`, footer with `HealthBadge` + "Powered by CoinGecko" `target="_blank" rel="noopener noreferrer"`); `appRoutes` `RouteObject` tree with an index `Navigate` to `/markets`, the four `ComingSoon` routes and a catch-all not-found route; `App` wraps `AppRoutes` in `BrowserRouter`
- `web/src/styles/theme.css`: dark custom-property tokens and `app-shell`/`app-nav`/`nav-link`/`app-main`/`app-footer`/`health-badge` classes plus `data-status` tone selectors (ok=up-green, degraded=accent-yellow, down=down-red, not_configured=muted)
- 27/27 web tests pass (node environment, no DOM library added), `typecheck`/`build`/`npm run smoke` all clean

## Task Commits

Each task was committed atomically (Task 1 followed the RED → GREEN TDD cycle with separate commits; no REFACTOR commit was needed):

1. **Task 1 RED: failing tests for poller, badge view and api error parsing** — `052d13a` (test)
2. **Task 1 GREEN: visibility-aware poller, error parsing, Re-check badge** — `030a0c5` (feat)
3. **Task 2: dark shell, placeholder routes, CoinGecko attribution** — `36028fa` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit hash in the orchestrator's completion report).

## TDD Gate Compliance

Task 1 carried `tdd="true"`. Gate sequence verified against git log:
- RED: `git log --oneline -E --grep="^test\(0?1-0?5\):"` → `052d13a` present
- GREEN: `git log --oneline -E --grep="^feat\(0?1-0?5\):"` → `030a0c5` present (and `36028fa` for Task 2's non-TDD feat commit)
- REFACTOR: none — the GREEN implementation was already minimal; no cleanup commit was warranted

RED evidence: before implementation, `npm --prefix web run test` showed the target `api.test.ts` case failing on an assertion (`expected code INTERNAL_ERROR, received HTTP_500`) and the two new-file suites (`healthPoller.test.ts`, `HealthBadge.test.tsx`) failing on "Cannot find module" / "Element type is invalid: ... undefined" — the expected RED state for modules that do not exist yet. After implementation, all 21 web tests (and later, with Task 2's additions, all 27) passed.

## Files Created/Modified

- `web/src/lib/healthPoller.ts` — `createHealthPoller`, `HealthPoller`, `HealthState`, `VisibilityAdapter`, `HEALTH_POLL_INTERVAL_MS`
- `web/src/lib/healthPoller.test.ts` — 8 fake-timer test cases covering the full behavior list
- `web/src/lib/api.ts` — `fetchHealth`/`parseErrorResponse` D-09 error-body parsing
- `web/src/lib/api.test.ts` — 3 new cases appended (JSON error body, non-JSON fallback, abort rethrow); original 2 cases untouched
- `web/src/components/HealthBadge.tsx` — `HealthBadgeView`, `HealthBadge`
- `web/src/components/HealthBadge.test.tsx` — 8 `renderToStaticMarkup` cases
- `web/src/App.tsx` — `AppLayout`, `appRoutes`, `AppRoutes`, `App`
- `web/src/App.test.tsx` — 6 cases (4 route cases via `it.each`, not-found, redirect via `matchRoutes`)
- `web/src/pages/ComingSoon.tsx` — `ComingSoon({ title, description })`
- `web/src/styles/theme.css` — dark theme tokens, shell layout classes, status tone selectors
- `web/src/main.tsx` — imports `./styles/theme.css` before rendering `App` in `StrictMode`

## Decisions Made

- Poller reschedules relative to the last fetch's start time and current visibility on every settlement, and the visibility listener recomputes elapsed time to decide immediate-fetch vs. remaining-delay — see key-decisions above for why this single mechanism satisfies both the "hidden → no calls" and "visible after N seconds" behaviors without a second timer.
- `ApiError`'s frozen 3-arg constructor was kept as-is; the JSON body's `error.message` (when present) is applied via a post-construction `error.message = ...` reassignment rather than widening the frozen signature.
- The `HealthBadge` container's `checking` state is only explicitly synchronized around its own `start()`/`refresh()` calls, not on every internal periodic poll (no `onCheckingChange` callback exists in the poller interface, and no DOM test library is installed to assert live click behavior) — this is intentionally deferred to the end-of-phase human check.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' behavior lists, artifact exports, acceptance criteria and verification commands were implemented and verified as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

Both intentional, per D-01 and SKELETON.md's "Subsequent Slice Plan" (not bugs — the plan explicitly specifies these as placeholders for later phases to fill in without restyling):

- `web/src/pages/ComingSoon.tsx` renders a static title/description with no live data source. Used by all 5 routes (`/markets`, `/trade`, `/wallet`, `/orders`, catch-all). Resolved incrementally: `/markets` in Phase 3, `/trade` in Phases 3-5, `/wallet` in Phase 4, `/orders` in Phase 5.
- `HealthBadge`'s container-level `checking` UI state does not track background periodic polls (only its own `start()`/`refresh()` calls) — see key-decisions above. Not a functional gap (the poller's own `isChecking()` is correct and unit-tested); only the container's React state mirror is scoped to user-triggered actions.

## Human verification (end-of-phase)

`workflow.human_verify_mode` is `end-of-phase`; this plan's Task 2 `<verify>` carries the following `<human-check>`, harvested by the phase verifier into the Phase 1 UAT document rather than a mid-flight checkpoint:

**Test:** From the repo root run `npm run dev`, then open http://localhost:5173 in Chrome with DevTools Network filtered to "health".

**Expected:**
1. Dark background with a yellow-accented top nav: Markets, Trade, Wallet, Orders; `/` lands on `/markets` and the active link is highlighted.
2. Each nav link shows its own title and a "Coming soon" line.
3. Footer: badge reads "API ok" and "CoinGecko: not configured" (or ok/degraded/down in its colour if `api/.env` has a key) plus a "Powered by CoinGecko" link opening coingecko.com in a new tab.
4. Exactly one `/health` request on load; switch to another tab for over 60s and no `/health` requests appear; return and one request fires immediately.
5. Clicking Re-check fires one `/health` request and the button is disabled until it completes.
6. Stop the API process: within the next poll or Re-check the badge shows "API unreachable".

**Why human:** Visual styling, tab-visibility behaviour in a real browser and the network timeline cannot be asserted by node-environment tests (no DOM library is installed per the 01-01 package gate).

## Next Phase Readiness

- The D-01 shell (`AppLayout`, `appRoutes`) and D-02 health badge are complete and tested; Phases 2-5 fill in `/markets`, `/trade`, `/wallet`, `/orders` by replacing each route's `ComingSoon` element without touching `AppLayout`, nav, footer or `theme.css`.
- `createHealthPoller`'s dependency-injected `fetchHealth`/`visibility`/`timers`/`now` shape is reusable if a future phase needs another visibility-aware poller (e.g. a markets ticker).
- ROADMAP success criterion 1 (web half) is met: the web page shows API health status including CoinGecko's ok/degraded/down/not_configured, pending the end-of-phase human visual/visibility confirmation above.
- No new dependencies were added; `web/package.json` is unchanged from 01-01/01-02.

## Self-Check: PASSED

- `test -f web/src/lib/healthPoller.ts && test -f web/src/components/HealthBadge.tsx && test -f web/src/App.tsx && test -f web/src/pages/ComingSoon.tsx && test -f web/src/styles/theme.css` → all found
- `git log --oneline --all --grep="01-05"` → matches `36028fa`, `030a0c5`, `052d13a`
- Re-ran all `<acceptance_criteria>` for Task 1 (6 checks) and Task 2 (5 checks) → all PASS
- Re-ran plan-level `<verification>`: `npm --prefix web run test` → 27/27 passed; `npm --prefix web run typecheck` → clean; `npm --prefix web run build` → clean; `npm run smoke` → `SMOKE OK`

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*

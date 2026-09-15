---
phase: 01-foundation-project-memory
plan: 04
subsystem: api
tags: [fastify, coingecko, health-check, caching, concurrency, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: "buildApp(deps)/createDb(path)/createLogger(options) contracts and the tracer coingecko.ts/health.ts implementations from 01-01"
provides:
  - "Hardened createCoingeckoStatusService: per-instance in-flight dedupe, exact 300000ms TTL boundary (clock-consistent checkedAt), down/degraded results cached too, AbortSignal.timeout(5000) classified down, key-free upstream-call log line"
  - "GET /health response schema (status 200) with additionalProperties: false at every level, enforcing the exact D-03 shape"
affects: ["01-08"]

# Actuals (#2632)
actuals:
  tokens: 6611
  tasks: 2
  commits: 4
  plan_head_before: effb703c556d608b35c985d3e49a15eb27dc9f8c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-instance in-flight promise dedupe inside a lazy cached service: concurrent callers on an expired/empty cache await the same in-progress fetch instead of each starting their own (T-01-17)"
    - "Cache-freshness math and the stored checkedAt both derive from the same injected now()/start clock, never wall-clock Date.now(), so a fake/injected clock in tests (or any future deterministic-time caller) stays internally consistent"
    - "Fastify response schema with additionalProperties: false at every nesting level as defense-in-depth against accidental field leakage through JSON serialization (T-01-19)"

key-files:
  created: []
  modified:
    - api/src/lib/coingecko.ts
    - api/src/lib/coingecko.test.ts
    - api/src/routes/health.ts
    - api/src/routes/health.test.ts

key-decisions:
  - "checkedAt now derives from the check's own start timestamp (same clock as the TTL age math) instead of a separate wall-clock Date.now() call — the two were previously reading different clocks, which is silently correct today only because now() defaults to Date.now(), and breaks the moment any caller injects a fake clock (as this plan's own tests do)"
  - "Timeout test mocks AbortSignal.timeout() directly via vi.spyOn rather than real 5000ms real-time wait or vitest fake timers (verified experimentally: vitest's fake timers do not intercept Node's native AbortSignal.timeout) — keeps the suite fast and deterministic while still exercising the real abort-signal code path"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "createCoingeckoStatusService classifies every D-04 case, caches every result (including down/degraded) for exactly 5 minutes in SQLite across restarts, dedupes concurrent callers into one upstream fetch, and logs each real call without the API key"
    requirement: "FND-03"
    verification:
      - kind: unit
        ref: "api/src/lib/coingecko.test.ts (11 tests: classification matrix, TTL boundary, future-checkedAt, down-caching, timeout, network error, 10-concurrent dedupe, restart, log redaction, header/URL)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /health always answers HTTP 200 with exactly the D-03 shape (status/version/commit/upstream.coingecko), and additionalProperties:false prevents any accidental extra field from leaking through response serialization"
    requirement: "FND-03"
    verification:
      - kind: integration
        ref: "api/src/routes/health.test.ts (9 tests: not_configured shape+version, cache reuse, GIT_COMMIT override, 503/429/TypeError classification, schema field-stripping)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Edge FND-03 (concurrency): 10 concurrent /health requests against an expired cache trigger exactly one upstream /ping call, write exactly one upstream_checks row, and all 10 responses carry the same upstream result"
    requirement: "FND-03"
    verification:
      - kind: unit
        ref: "api/src/lib/coingecko.test.ts#dedupes 10 concurrent calls on an empty cache into a single upstream fetch"
        status: pass
      - kind: integration
        ref: "api/src/routes/health.test.ts#dedupes 10 concurrent /health requests on a fresh cache into one upstream call"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 4: CoinGecko Status Service Hardening & /health Contract Summary

**Per-instance in-flight dedupe and clock-consistent 5-minute SQLite caching for the CoinGecko `/ping` check, plus a `GET /health` response schema (`additionalProperties: false`) that locks in the exact D-03 shape — both proven under 10-concurrent-caller bursts and cross-restart cache reuse.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-15 (worktree agent, continuing from 01-01/01-02 on `main`)
- **Completed:** 2026-09-15
- **Tasks:** 2 (both `type="auto" tdd="true"`, each run as a full RED→GREEN cycle; no REFACTOR commit needed — the GREEN implementations were already minimal)
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments

- `classifyPing` verified against the full D-04 matrix (200/2000ms boundary inclusive-ok, 200/2001ms degraded, 429 degraded, 5xx/401/403/timeout/network-error all down) — unchanged from 01-01, now under an explicit test
- Fixed a clock inconsistency: `checkedAt` now derives from the same `now()`/`start` value used for TTL-age math, not a separate wall-clock `Date.now()` — required for the exact-300000ms boundary and future-timestamp tests to be meaningful, and a correctness fix for any future caller that injects a deterministic clock
- Added per-instance in-flight promise dedupe: 10 concurrent `getStatus()`/`GET /health` calls on an empty or expired cache now produce exactly one upstream fetch and one `upstream_checks` row, with all callers receiving the identical result (T-01-17)
- Down and degraded results are cached for the same 5-minute TTL as ok results (an upstream outage cannot multiply upstream calls) — proven with a 503 response reused 1s later with zero new fetches
- Outbound `upstream call` log line now uses `info` for `ok` and `warn` otherwise, still restricted to five scalar fields (`upstream`, `url`, `status`, `durationMs`, `result`) — the API key, headers and deps object never reach the logger; a dedicated test asserts the literal key value never appears in captured log text
- `GET /health` gained a Fastify response schema for status 200 with `additionalProperties: false` at every nesting level (top-level and `upstream.coingecko`), so an accidental extra field returned by a future change to the status service can never leak through JSON serialization (T-01-19) — proven with a test that injects an extra field via a mocked service and asserts it is stripped
- Route-level tests now also cover: `GIT_COMMIT` override, 503→down, 429→degraded, `TypeError`→down (all HTTP 200, `content-type: application/json`, `x-request-id` present), and the FND-03 concurrency edge at the route layer (10 concurrent `/health` → 1 upstream call, 1 row, identical bodies)
- No exported signatures changed from 01-01's frozen interfaces; `app.ts` was not touched (owned by 01-03 in this wave)

## Task Commits

Each task followed the RED → GREEN TDD cycle with separate commits:

1. **Task 1: CoinGecko status service hardening**
   - RED: `2c15761` (test) — 11 tests added to `api/src/lib/coingecko.test.ts`; 5 genuinely failed against the pre-hardening implementation (verified by temporarily reverting `coingecko.ts` and re-running: TTL-exact-boundary, down-caching, 10-concurrent-dedupe, restart-cache-reuse, plus the timeout test's real-time hang before its abort-ordering fix)
   - GREEN: `50706ac` (feat) — in-flight dedupe, clock-consistent `checkedAt`, info/warn log split; all 11 tests pass
   - REFACTOR: none needed
2. **Task 2: GET /health route contract**
   - RED: `087d8c4` (test) — 9 tests in `api/src/routes/health.test.ts` (2 kept from 01-01, 7 new); 1 genuinely failed against the pre-schema implementation (field-stripping test, verified the same way)
   - GREEN: `bfc88bc` (feat) — added the `additionalProperties: false` response schema; all 9 tests pass
   - REFACTOR: none needed

**Plan metadata:** committed alongside this SUMMARY (see final commit hash in the orchestrator's completion report).

## Files Created/Modified

- `api/src/lib/coingecko.ts` — added per-instance in-flight dedupe, fixed `checkedAt` clock source, split `info`/`warn` log level by result
- `api/src/lib/coingecko.test.ts` — new file (338 lines, 11 tests): classification matrix, TTL boundaries (299999/300000ms, future timestamp), down/degraded caching, timeout, network error, 10-concurrent dedupe, restart-across-instances, log redaction, header/URL shape
- `api/src/routes/health.ts` — added the status-200 response schema (`additionalProperties: false`)
- `api/src/routes/health.test.ts` — extended from 2 to 9 tests: exact-shape/version/commit assertions, `GIT_COMMIT` override, 503/429/`TypeError` classification, 10-concurrent-request dedupe, schema field-stripping

## Decisions Made

- **`checkedAt` clock source fixed to `now()`/`start`** instead of wall-clock `Date.now()` (Rule 1 — bug): the two computations (cache-age math and the stored timestamp) must read the same clock, or an injected fake clock (used throughout this plan's own tests, and available to any future caller via `CoingeckoStatusDeps.now`) produces nonsensical ages. Documented as a deviation below.
- **Timeout test mocks `AbortSignal.timeout()` via `vi.spyOn`** rather than waiting a real 5000ms or relying on vitest fake timers — verified experimentally in this session that `vi.useFakeTimers()` does not intercept Node's native `AbortSignal.timeout()` (a controlled spike confirmed the abort event never fires under advanced fake time). Mocking the static method directly keeps the test both fast and a faithful exercise of the real "abort signal fires → fetchImpl rejects → classified down" path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `checkedAt` used wall-clock `Date.now()` instead of the injected `now()`/`start` clock**
- **Found during:** Task 1, writing the TTL-boundary and future-checkedAt tests
- **Issue:** The 01-01 tracer implementation computed cache freshness as `now() - Date.parse(latest.checkedAt)` but wrote `checkedAt` via `new Date().toISOString()` (real wall-clock time). With the default `now = Date.now`, this is invisibly correct — but the moment a caller injects a fake/deterministic clock (exactly what this plan's tests do, and what any future scheduler-style caller might do), the age computation desyncs from the stored timestamp, silently breaking the 5-minute TTL contract.
- **Fix:** `checkedAt` is now `new Date(start).toISOString()`, where `start` is the same value returned by the injected `now()` at the beginning of the check — the same clock now backs both the TTL math and the persisted timestamp.
- **Files modified:** `api/src/lib/coingecko.ts`
- **Verification:** `api/src/lib/coingecko.test.ts` TTL-boundary and future-checkedAt tests pass; full `npm --prefix api run test` and `npm run typecheck` both clean.
- **Committed in:** `50706ac` (Task 1 GREEN commit)

**2. [Rule 2 - Missing Critical] Per-instance in-flight dedupe was absent — a burst of concurrent callers could each trigger their own upstream fetch**
- **Found during:** Task 1, writing the 10-concurrent-calls test (and its route-level counterpart in Task 2)
- **Issue:** The 5-minute SQLite cache alone does not protect against concurrent callers that all observe an empty or expired cache before the first insert lands — each would independently call CoinGecko, multiplying upstream calls exactly in the scenario (a burst of `/health` polls) the cache exists to prevent (T-01-17, a `must_haves.truths` requirement of this plan).
- **Fix:** Added a per-service-instance in-flight `Promise<UpstreamCheck>` that every concurrent `getStatus()` call awaits instead of starting its own `performCheck`, cleared in a `finally` block once the check settles.
- **Files modified:** `api/src/lib/coingecko.ts`
- **Verification:** Both the unit-level (`coingecko.test.ts`) and route-level (`health.test.ts`) 10-concurrent tests assert `fetchImpl` was called exactly once and exactly one `upstream_checks` row was inserted.
- **Committed in:** `50706ac` (Task 1 GREEN commit)

**3. [Rule 2 - Missing Critical] `GET /health` response had no schema, so an accidental extra field could leak through serialization**
- **Found during:** Task 2, per the plan's explicit action item and threat T-01-19
- **Issue:** Without a response schema, Fastify serializes whatever object the handler returns verbatim — any future bug that attaches an extra property to the body (or to `upstream.coingecko`) would ship it to every caller of an unauthenticated endpoint.
- **Fix:** Added a status-200 response schema with `additionalProperties: false` at the top level and on `upstream.coingecko`, listing exactly the D-03 fields.
- **Files modified:** `api/src/routes/health.ts`
- **Verification:** A dedicated test registers `healthRoutes` directly with a mocked `coingecko` service that returns an extra `secret` field and asserts it is stripped from the serialized response.
- **Committed in:** `bfc88bc` (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 2 missing-critical security/correctness hardenings — both explicitly called for by the plan's `must_haves`/threat model, not scope creep)
**Impact on plan:** All three were necessary to satisfy this plan's own stated `must_haves.truths` (clock-consistent TTL, concurrency dedupe) and threat register (T-01-17, T-01-19). No unrelated changes made.

## Issues Encountered

- Initial timeout test hung at vitest's default 5000ms test timeout because `controller.abort()` was called before the mocked `fetchImpl`'s `abort` event listener had been attached (a promise-ordering race, not a real bug) — fixed by making the test's `fetchImpl` defensively check `signal.aborted` before attaching the listener, resolved before any implementation code was touched.
- Confirmed experimentally (via a throwaway spike, not committed) that `vi.useFakeTimers()` does not intercept Node's native `AbortSignal.timeout()` — informed the decision to mock the static method directly instead, documented above.

## User Setup Required

None beyond what 01-01 already documented — `COINGECKO_API_KEY` remains optional in Phase 1; the app correctly reports `not_configured` without one.

## Known Stubs

None.

## Next Phase Readiness

- `createCoingeckoStatusService` and `healthRoutes` are hardened and fully covered by unit/integration tests; 01-08 (final wave-3 integration/smoke plan) can rely on the concurrency and caching guarantees without re-verifying them.
- The frozen interfaces from 01-01 (`UpstreamStatus`, `UpstreamCheck`, `CoingeckoStatusDeps`, `CoingeckoStatusService`, `createCoingeckoStatusService`, `classifyPing`, the three exported constants, `HealthResponse`, `readApiVersion`, `healthRoutes`) are unchanged — no ripple effects for `app.ts` (01-03) or any other sibling plan in this wave.
- Blocker carried forward from STATE.md: CoinGecko Demo rate limits/monthly cap and free-hosting SQLite persistence remain open for later phases — unaffected by this plan (the 5-minute cache and dedupe are, if anything, more conservative than before).

## Self-Check: PASSED

- `test -f api/src/lib/coingecko.ts && test -f api/src/lib/coingecko.test.ts && test -f api/src/routes/health.ts && test -f api/src/routes/health.test.ts` → all found
- `git log --oneline --all --grep="01-04"` → matches all four commits: `2c15761`, `50706ac`, `087d8c4`, `bfc88bc`
- Re-ran all `<acceptance_criteria>` for Task 1 and Task 2 → all PASS (grep checks for `setInterval|setTimeout` count 0, `AbortSignal.timeout`/`PING_CACHE_TTL_MS` present, `test-secret-key-123` present in both test files, `it(`/`test(` counts 11 and 9 respectively, both ≥ required minimums, `additionalProperties`/`not_configured` present in `health.ts`, no 01-04 commit touches `api/src/app.ts`)
- Re-ran plan-level `<verification>`: `npm --prefix api run test` → 19/19 pass; `npm --prefix api run typecheck` → clean; root `npm run test` (api + web) → 21/21 pass; root `npm run lint` and `npm run format:check` → clean

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*

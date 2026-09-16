# Phase 3: Live Markets - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 21 (10 api, 8 web, 2 qa, 1 scripts)
**Analogs found:** 15 / 21 (strong role+flow analogs exist for the cache/dedupe shape, route/DI/schema style, error envelope, FE fetch client, poller discipline, pure-view/stateful split, and QA doc formats. Two genuine gaps: an imperative canvas chart library wired into React 19, and any client-side-search/sort data table)

**03-RESEARCH.md was not read** (not in `<required_reading>`; CONTEXT.md's `## Code Examples`-equivalent content is folded into its `<canonical_refs>` section instead — this map relies on real codebase analogs per the CONTEXT.md provenance note).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `api/src/lib/marketData.ts` (cache + dedupe + curated list + stale fallback) | service | CRUD (keyed, TTL-cached) | `api/src/lib/coingecko.ts` | role-match (needs generalizing — see "Refactor, Not Extend" below) |
| `api/src/lib/marketData.test.ts` | test | CRUD | `api/src/lib/coingecko.test.ts` | exact |
| `api/src/routes/markets.ts` (`GET /api/markets`, `GET /api/markets/:id/chart`) | route | request-response | `api/src/routes/health.ts` (schema/plugin shape) + `api/src/routes/wallet.ts` (path-param-free identity discipline is the wrong precedent here — this route DOES take a path id, see D-45) | role-match |
| `api/src/routes/markets.test.ts` | test | request-response | `api/src/routes/health.test.ts` + `api/src/routes/wallet.test.ts` | exact |
| `api/src/app.ts` (modify: register `marketData` service + `markets` routes) | provider | request-response | `api/src/app.ts` (self) | exact |
| `api/src/lib/errors.ts` | utility | request-response | unchanged, reused as-is | exact (no modification expected) |
| `api/.env.example` (modify: cache TTL constants if made env-configurable) | config | — | `api/.env.example` (self) | exact |
| `web/src/lib/api.ts` (modify: add `fetchMarkets`, `fetchMarketChart`) | utility | request-response | `web/src/lib/api.ts` (self, `fetchWallet`/`fetchHealth`) | exact |
| `web/src/lib/marketPoller.ts` (30s visible-only poll of `/api/markets`) | provider/hook | event-driven | `web/src/lib/healthPoller.ts` | exact |
| `web/src/lib/marketPoller.test.ts` | test | event-driven | `web/src/lib/healthPoller.test.ts` | exact |
| `web/src/lib/format.ts` (money/percent/volume formatting) | utility | transform | none — no formatting module exists; `web/src/pages/Wallet.tsx`'s comment ("Renders amounts exactly as stored... never reformatted through a float") is the one relevant precedent-by-absence | no-analog |
| `web/src/lib/format.test.ts` | test | transform | `api/src/lib/logger.test.ts` (pure-function unit-test shape, closest cross-package analog for a pure `describe`/`it`/`expect` module) | role-match |
| `web/src/components/StaleBanner.tsx` | component | request-response | `web/src/components/HealthBadge.tsx` (`HealthBadgeView` pure-view half only — a props-in, markup-out banner) | role-match |
| `web/src/components/StaleBanner.test.tsx` | test | request-response | `web/src/components/HealthBadge.test.tsx` | exact |
| `web/src/pages/Markets.tsx` (table, search, sort, poller wiring) | component | request-response | `web/src/pages/Wallet.tsx` (page-with-async-state shape: loading/anonymous-equivalent/data branches) for the async-state wrapper; **no analog** for the table body itself (search/sort logic) | role-match (wrapper only) |
| `web/src/pages/Markets.test.tsx` | test | request-response | `web/src/pages/Login.test.tsx`/`web/src/App.test.tsx` (renderToStaticMarkup + prop-driven state fixtures) | role-match |
| `web/src/pages/Trade.tsx` (pair header + chart) | component | request-response | `web/src/pages/Wallet.tsx` (async-state wrapper shape) for everything except the chart canvas itself | role-match (wrapper only) |
| `web/src/pages/Trade.test.tsx` | test | request-response | `web/src/components/HealthBadge.test.tsx` (markup-only assertions — chart canvas itself is opaque to `renderToStaticMarkup`, see below) | role-match (partial coverage only) |
| `web/src/App.tsx` (modify: replace `ComingSoon` for `/markets`, `/trade` with `Markets`/`Trade`) | component | request-response | `web/src/App.tsx` (self, already replaced `ComingSoon` for `/wallet` in Phase 2 — same substitution pattern) | exact |
| `qa/test-cases/markets.md` | config (doc) | — | `qa/test-cases/auth.md` | exact |
| `qa/runs/RUN-YYYY-MM-DD-markets.md` | config (doc) | — | `qa/runs/RUN-2026-09-16-auth.md` | exact |
| `scripts/smoke-dev.mjs` (extend: markets stub responses, chart render check, stale-path trigger) | config (script) | event-driven | `scripts/smoke-dev.mjs` (self, `startStub()` + `waitForBadge()`) | exact |

## Pattern Assignments

### `api/src/lib/marketData.ts` (service, CRUD/keyed-cache) — extends `coingecko.ts`

**Analog:** `api/src/lib/coingecko.ts` (full file, 156 lines — already read)

**Reusable shape** (lines 48-49, 57, 122-154):
```typescript
export function createCoingeckoStatusService(deps: CoingeckoStatusDeps): CoingeckoStatusService {
  const { db, apiKey, baseUrl, fetchImpl = fetch, now = Date.now } = deps;
  let inFlight: Promise<UpstreamCheck> | null = null;
  // ...
  return {
    async getStatus(ctx) {
      if (apiKey === null) return { status: "not_configured", ... };
      const [latest] = await db.select().from(upstreamChecks)...limit(1);
      if (latest) {
        const age = now() - Date.parse(latest.checkedAt);
        if (age >= 0 && age < PING_CACHE_TTL_MS) return { ...latest };
      }
      if (inFlight) return inFlight;
      inFlight = performCheck(apiKey, ctx).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
```
Directly reusable: the `create*Service(deps)` factory with injectable `db`/`apiKey`/`baseUrl`/`fetchImpl`/`now` (same signature shape); the `x-cg-demo-api-key` header pattern (line 70) — same header, D-35 keyless fallback is `apiKey === null` short-circuit before any fetch, exactly like the existing `not_configured` branch; `AbortSignal.timeout(...)` for the upstream timeout (line 71); the `timedOut`/`httpStatus` classification split (lines 65-84); never logging the key or headers (lines 111-112, D-08 discipline carries over as-is).

**Testing harness to copy** — `api/src/lib/coingecko.test.ts` (338 lines): `createDb(":memory:")` + injected fake `now` + a fake `fetchImpl` returning canned `Response` objects, used to assert TTL-boundary and in-flight-dedupe behavior (e.g. assert `fetchImpl` was called exactly once for N concurrent `getStatus()` calls). Reuse this exact harness shape for `marketData.test.ts`'s TTL and dedupe assertions per resource key (D-38/D-39).

---

### `api/src/routes/markets.ts` (route, request-response)

**Analog:** `api/src/routes/health.ts` (full file) + `api/src/routes/wallet.ts` (full file)

**Plugin/schema shape to copy** (`health.ts` lines 27-91): `FastifyPluginCallback<MarketsRoutesOptions>` default export, one `app.get()` per endpoint, `additionalProperties: false` at every level of the response schema (D-03 leak-prevention — `health.ts` lines 33-36 explain why, `wallet.ts` line 9-10 repeats the discipline). Follow this for `GET /api/markets` (public, no `requireSession` — D-44) and `GET /api/markets/:id/chart` (also public).

**Path-param validation is new** — `wallet.ts` is the *wrong* precedent for `:id` handling (it deliberately takes NO params, D-20). Instead, per D-45, validate `request.params.id` against the cached curated list before any upstream call:
```typescript
// modeled on the AppError-throw idiom already used in api/src/routes/auth.ts
const pair = opts.marketData.findPair(request.params.id);
if (!pair) {
  throw new AppError(404, "UNKNOWN_PAIR", "Unknown market");
}
```
Use `AppError` from `api/src/lib/errors.ts` (lines 40-52, already read in full) exactly as `auth.ts` does (lines 116, 135, 157, 174, 192) — no changes needed to `errors.ts` itself.

**Stale/fetchedAt envelope on success** (D-41/D-42) has no existing precedent (Phase 1-2 responses never carry a staleness flag) — shape it as a sibling member alongside the existing data, e.g. `{ pairs: [...], fetchedAt, stale }`, and add `stale`/`fetchedAt` to the JSON response schema the same way `health.ts` adds `upstream.coingecko.status` — an explicit enum/string field, `required` at that level, never optional-and-absent (schema-enforced, matching the `additionalProperties: false` discipline throughout).

---

### `api/src/routes/markets.test.ts` (test, request-response)

**Analog:** `api/src/routes/health.test.ts` (`createDb(":memory:")`, `createLogger`, `loadConfig({})`, `buildApp({...})`, `app.inject({...})`) + `api/src/routes/wallet.test.ts` (401/edge-case assertions) + `api/src/app.test.ts` (D-09 error-shape assertions, lines 140-186). Add coverage for: 429/timeout/5xx upstream → `stale: true` + last-good payload (D-41), never a hard failure unless the cache is empty; unknown `:id` → 404 (D-45); `x-cg-demo-api-key` header only ever sent server-side (assert the stub records it, never assert anything about the client — this is proven in the browser per D-35, not here).

---

### `api/src/app.ts` (provider, request-response) — modify

**Analog:** `api/src/app.ts` (self, full file, already read)

**Registration pattern to extend** (lines 114-139, exact same shape as Phase 2's `sessions`/`accounts`/`authRoutes` wiring):
```typescript
const marketData = createMarketDataService({
  db: deps.db,
  apiKey: deps.config.coingeckoApiKey,
  baseUrl: deps.config.coingeckoBaseUrl,
  fetchImpl: deps.fetchImpl,
  now: deps.now,
});
await app.register(marketsRoutes, { marketData });
```
No `requireSession` needed (D-44 — public). `@fastify/cookie`/`@fastify/cors` are already registered (lines 106-112) — nothing new needed there.

---

### `web/src/lib/api.ts` (utility, request-response) — modify

**Analog:** `web/src/lib/api.ts` (self, full file, already read)

**Pattern to replicate** (lines 245-265, `fetchWallet` — the closest unauthenticated-shape sibling once `credentials: "include"` is dropped, since D-44 makes markets endpoints public):
```typescript
export async function fetchMarkets(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<MarketsResponse>> {
  const { signal, fetchImpl = fetch } = options;
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/markets`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(null, "NETWORK_ERROR", null);
  }
  const headerRequestId = response.headers.get("x-request-id");
  if (!response.ok) throw await parseErrorResponse(response, headerRequestId);
  return parseJsonBody<MarketsResponse>(response, headerRequestId);
}
```
No `credentials: "include"` needed (public endpoint, unlike `signup`/`login`/`fetchWallet`). Same for `fetchMarketChart(id, range)` — build the URL as `${API_BASE_URL}/api/markets/${encodeURIComponent(id)}/chart?range=${range}`. Reuse the unchanged `parseErrorResponse` (lines 289-310) and `parseJsonBody` (lines 99-113) helpers exactly as-is — this is the shared D-09 client-side error contract, do not duplicate it.

---

### `web/src/lib/marketPoller.ts` (provider/hook, event-driven)

**Analog:** `web/src/lib/healthPoller.ts` (full file, 201 lines — already read)

**Copy verbatim, generic-typed over the poll payload:** the `VisibilityAdapter`/`PollerTimers` interfaces (lines 12-32), the `createDocumentVisibilityAdapter()` helper pattern (from `HealthBadge.tsx` lines 61-69, not `healthPoller.ts` itself — the poller takes the adapter as a dependency, the component supplies the real one), the `scheduleTimeout`/`cancelTimeout` local-copy pattern (lines 71-72) — **this is load-bearing, not stylistic**: browsers throw `Illegal invocation` if a native timer function is called with a non-`window` receiver (WebIDL "this" check), documented in `wiki/pages/findings/health-poller-illegal-invocation.md` and explicitly flagged in D-40 as a lesson that must carry over. Also copy: the single `.then(fulfilled, rejected)` call rather than `.then().catch()` (lines 106-114, comment explains why — a chained `.catch()` would swallow a programming-error exception and misreport it as an API failure); the `afterSettled()` visibility re-check after every settle (lines 97-104); `onVisibilityChange()`'s elapsed-time reschedule-vs-immediate-refetch logic (lines 159-173, needed for D-40's "only while visible" requirement). Change only the interval constant (30s per D-40 vs. `HEALTH_POLL_INTERVAL_MS = 60_000`) and the fetch function injected (`fetchMarkets` instead of `fetchHealth`) and the state union (`MarketsState` mirroring `HealthState`'s `{kind:"loading"}|{kind:"ok",...}|{kind:"error",...}` discriminated-union shape, lines 7-10).

---

### `web/src/lib/marketPoller.test.ts` (test, event-driven)

**Analog:** `web/src/lib/healthPoller.test.ts` (385 lines) — same fake-timers/fake-visibility-adapter harness; reuse directly for the 30s interval and visibility-pause assertions.

---

### `web/src/lib/format.ts` (utility, transform) — NO ANALOG

No formatting module exists in `web/src` today. The one relevant precedent is negative: `web/src/pages/Wallet.tsx`'s comment (lines 8-9) — "Renders amounts exactly as stored (decimal strings), never reformatted through a float (WAL-03 decimal-safe rule)" — establishes the constraint this module must respect for any monetary value it touches, even though Phase 3 numbers (price, 24h %, volume, market cap) are *display* formatting of upstream floats, not user balances, so D-47 explicitly scopes this to "no floating-point arithmetic on money — display formatting only." Match the surrounding `lib/` conventions even though the substance is new: named exports only (`logger.ts`/`coingecko.ts`/`errors.ts`/`api.ts` all avoid default exports), and if a decision this module encodes is worth citing, a `/** D-47: ... */`-style doc comment (see `logger.ts` lines 11-17, `errors.ts` lines 3-6 for the citation style).

---

### `web/src/lib/format.test.ts` (test, transform)

**Analog:** `api/src/lib/logger.test.ts` (cross-package, but the only pure-function `describe`/`it`/`expect`-with-no-Fastify-app precedent) — plain unit tests per formatting function (price precision by magnitude, signed/colored percent, abbreviated volume like `1.2B`), boundary cases (exactly 1000 → `1.0K` vs `999` unabbreviated, negative percent, zero).

---

### `web/src/components/StaleBanner.tsx` (component, request-response)

**Analog:** `web/src/components/HealthBadge.tsx`'s `HealthBadgeView` half only (lines 21-59) — a pure, props-in component (`{ stale: boolean; fetchedAt: string | null }` or similar) rendering only React text children, never raw HTML (T-01-22 discipline, same comment as `HealthBadge.tsx` line 19-20 — any upstream-derived string reaching this banner must go through JSX text interpolation, never `dangerouslySetInnerHTML`). No stateful wrapper is needed here (unlike `HealthBadge`, which owns its own poller) — this banner is driven entirely by props from whichever page/poller already holds the market data, so it is pure-view only, simpler than the full `HealthBadge`/`HealthBadgeView` split.

---

### `web/src/components/StaleBanner.test.tsx` (test, request-response)

**Analog:** `web/src/components/HealthBadge.test.tsx` (full file, 74 lines) — same `renderToStaticMarkup` + `data-testid`/`data-status`-attribute assertion style (lines 25-32 for the pattern of asserting a `data-*` attribute plus visible text together).

---

### `web/src/pages/Markets.tsx` (component, request-response)

**Analog (wrapper shape only):** `web/src/pages/Wallet.tsx` (full file, 58 lines) — the `loading` / `no-data-yet` / `data` branch structure (lines 34-57) is the reusable async-page-state pattern: a page component reads a hook's discriminated-union state and renders exactly one of three things. Adapt: `state.kind === "loading"` → loading shell (mirrors `Wallet`'s loading branch); a `MarketsView`-equivalent pure component for the table itself. **No in-repo analog for the table body** (client-side search input + sortable column headers over an array, D-46) — this is new; `qa/test-cases/auth.md`'s own form-input precedent doesn't apply either (no controlled-input pattern exists anywhere in `web/src` yet outside the as-yet-unread `Signup.tsx`/`Login.tsx` forms from Phase 2, which are the closest thing to "an input driving client state" in this repo and worth reading directly during planning if the search-box wiring needs a concrete reference).

---

### `web/src/pages/Trade.tsx` (component, request-response)

**Analog (wrapper shape only):** `web/src/pages/Wallet.tsx` — same loading/data branch structure for the pair header and range selector. **The chart itself has no analog** — see "No Analog Found" below.

---

### `web/src/App.tsx` (component, request-response) — modify

**Analog:** `web/src/App.tsx` (self, full file, already read) — this is the *third* time this exact substitution happens (Phase 2 replaced the `wallet` route's `ComingSoon` with `<Wallet />`, lines 129-135): swap the `markets`/`trade` route elements (lines 113-127) from `<ComingSoon title="Markets" .../>` / `<ComingSoon title="Trade" .../>` to `<Markets />` / `<Trade />`, no other structural change to `AppLayout`, `AuthNav`, or the route array shape.

---

### `qa/test-cases/markets.md` (config/doc)

**Analog:** `qa/test-cases/auth.md` (full file, 60 lines, already read) — same header table (`Feature`/`Area code MKT`/`Requirements covered`/`Last updated`), the same "Notes on the endpoints under test" preamble block citing fixed strings and automated-analog cross-references, the same `| ID | Title | Req | Preconditions | Steps | Expected | Priority | Type |` table with `TC-MKT-NNN` IDs, `<br>` for multi-step cells, and Expected cells that cite the automated analog test name inline (e.g. `` `api/src/routes/markets.test.ts#...` ``) exactly as every `auth.md` row does. D-49 lists the required case categories (table contents/formatting, search, sort incl. ties/negatives, auto-refresh + "last updated", 1D/7D/30D chart, stale banner via forced upstream failure, attribution, browser-network key-exposure assertion) — map each to one or more `TC-MKT-NNN` rows the way `auth.md` maps AUTH-01..05 to `TC-AUTH-001..024`.

---

### `qa/runs/RUN-YYYY-MM-DD-markets.md` (config/doc)

**Analog:** `qa/runs/RUN-2026-09-16-auth.md` (full file, 121 lines, already read) — identical structure: header table (Run ID/Scope/Build commit/Environment/Tester/dates), Summary counts table, "Environment setup" prose describing the scratch temp-port instance (same `getFreePort`-style discipline `scripts/smoke-dev.mjs` already uses), a per-case Results table citing Pass/Fail/Bug/Notes, "Bugs Raised", Exit Criteria checklist (copied from `qa/TEST-PLAN.md`), "Observations and Risks", and a Sign-off line. Follow D-50/D-51: exercise the deterministic stale-path cases (429/timeout/malformed body) against the local stub via `COINGECKO_BASE_URL`, never the real CoinGecko API — cite this explicitly in "Environment setup" the way the auth run cites its port/env scratch setup.

---

### `scripts/smoke-dev.mjs` (config/script, event-driven) — extend

**Analog:** `scripts/smoke-dev.mjs` (self, `startStub()` lines 52-72, `devEnv` lines 147-159, `waitForBadge()` lines 116-132)

**Stub extension pattern** — `startStub()`'s `createHttpServer` handler currently only answers `GET /ping` (lines 55-61) with a fixed 200 body and falls through to 404 for anything else (lines 62-63). Extend the same `if (req.method === "GET" && req.url === ...)` branching style to add `/coins/markets` and `/coins/:id/market_chart/range`-shaped routes, tracking hit counts and the `x-cg-demo-api-key` header the same way `state.hits`/`state.lastKeyHeader` already do (lines 53, 56-57) — this is the seam D-51 requires for deterministic 429/timeout/malformed-body stale-path tests (drive the stub to return those statuses for specific calls, then assert the API-under-test serves `stale: true` from cache). `waitForBadge()`'s poll-until-predicate pattern (lines 120-132) is the template for a new `waitForChart()`/`waitForMarketsTable()` helper that polls a `data-testid` in the same 200ms-interval, timeout-then-`fail()` style — needed because a canvas-rendered chart has no useful `textContent`, so the check must assert a canvas element exists and has non-zero dimensions (or a `data-testid="chart-ready"` sentinel the component sets once `lightweight-charts` finishes its first render) rather than reading text.

## Shared Patterns

### Service factory with injectable `db`/`apiKey`/`baseUrl`/`fetchImpl`/`now`
**Source:** `api/src/lib/coingecko.ts` lines 14-20, 48-49 (same shape already reused in Phase 2's `session.ts`/`accounts.ts`)
**Apply to:** `api/src/lib/marketData.ts` — every new service in this codebase follows this exact DI shape, needed so tests can inject a fake clock and a fake `fetchImpl` returning canned `Response` objects without touching real timers or network.

### In-flight dedupe extended to keyed resources
**Source:** `api/src/lib/coingecko.ts` lines 51-57, 122, 146-153 (single `let inFlight: Promise<UpstreamCheck> | null` keyed implicitly to the one `SERVICE_NAME` resource)
**Apply to:** `api/src/lib/marketData.ts` — generalize to `Map<string, Promise<T>>` keyed by resource (`"markets"`, `"chart:<id>:<range>"`), one entry per key, same finally-clears-the-entry discipline (line 150's `.finally(() => { inFlight = null; })` becomes `.finally(() => { inFlightMap.delete(key); })`). See "Refactor, Not Extend" below.

### D-09 error envelope + `AppError` class
**Source:** `api/src/lib/errors.ts` (unchanged, full file already read) + `api/src/routes/auth.ts` (lines 116, 135, 157, 174, 192 for the call-site idiom)
**Apply to:** `api/src/routes/markets.ts` — `throw new AppError(statusCode, code, message, fields?)`, no manual envelope construction, no `errors.ts` modification needed (D-27's `fields` support already exists and is unused-but-available for markets validation errors, e.g. an invalid `range` query param).

### FE fetch-wrapper + `ApiError`/`ApiResult` contract, WITHOUT `credentials: "include"`
**Source:** `web/src/lib/api.ts` lines 23-50 (`ApiError`), 99-113 (`parseJsonBody`), 289-310 (`parseErrorResponse`) — all unchanged; lines 52-80 (`fetchHealth`) is the closest *unauthenticated* precedent (no `credentials: "include"`), vs. `signup`/`login`/`fetchWallet` which need it
**Apply to:** `fetchMarkets`, `fetchMarketChart` — public endpoints per D-44, so omit `credentials: "include"` (matching `fetchHealth`, not `fetchWallet`).

### Visibility-aware poller with WebIDL-receiver-safe timers
**Source:** `web/src/lib/healthPoller.ts` (full file) + `wiki/pages/findings/health-poller-illegal-invocation.md`
**Apply to:** `web/src/lib/marketPoller.ts` — copy the `scheduleTimeout`/`cancelTimeout` local-variable-capture pattern verbatim (lines 71-72); this is a proven browser-only bug class (fails only in real Chrome, not in Vitest's Node environment), explicitly called out again in D-40, so treat it as non-negotiable rather than a style preference.

### Pure-view / stateful-wrapper split for testability
**Source:** `web/src/components/HealthBadge.tsx` lines 21-59 (`HealthBadgeView`, pure) vs. 71-103 (`HealthBadge`, stateful wrapper)
**Apply to:** `StaleBanner` (pure-view only, no wrapper needed — it takes props from whatever already holds poller state), the `MarketsView`/`Markets` split, the `TradeView`/`Trade` split — keep search/sort/render logic in a props-only component so `renderToStaticMarkup` tests (still the only FE test tool in this repo — `vitest.config` has `environment: "node"`, no jsdom, no `@testing-library/*` in `web/package.json`) can exercise every visual state.

### `additionalProperties: false` response schemas at every nesting level
**Source:** `api/src/routes/health.ts` lines 37-65 (comment lines 33-36 explain why), `api/src/routes/wallet.ts` lines 9-29
**Apply to:** every new response schema in `markets.ts`, including the new `stale`/`fetchedAt` fields — declare them explicitly in `required`, never leave them as an untyped/optional passthrough.

### QA doc formats (test-case file, run report)
**Source:** `qa/test-cases/auth.md`, `qa/runs/RUN-2026-09-16-auth.md` (both full files, already read)
**Apply to:** `qa/test-cases/markets.md`, `qa/runs/RUN-YYYY-MM-DD-markets.md` — identical table/section structure; an unexecuted case file does not satisfy QA-03 (D-50, same rule as D-33 in Phase 2).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `web/src/pages/Trade.tsx` chart body (`lightweight-charts` canvas) | component | streaming/render | **Flag for the planner:** no imperative canvas/WebGL library has ever been wired into this codebase's React 19 tree. Every existing component is a pure declarative React render (`HealthBadgeView`, `WalletView`, `ComingSoon`). `lightweight-charts` needs a `useRef` + `useEffect`-driven imperative mount/update/teardown (`chart.applyOptions`, `series.setData`, `chart.remove()` on unmount) with no precedent anywhere in `web/src`. Budget real time for this: getting the chart to (a) mount once, (b) update on 1D/7D/30D range change without leaking a duplicate chart instance, and (c) tear down cleanly on unmount/route-away, is new ground. Testing is also a gap — `renderToStaticMarkup` cannot execute `useEffect` or render a canvas meaningfully, so `Trade.test.tsx` can only cover the non-chart chrome (pair header, range buttons, attribution text) via markup assertions; real chart-rendering verification is browser-only, via the `scripts/smoke-dev.mjs` extension (D-37 already anticipates this: "a blocking human gate before install if the audit turns up anything unexpected" for the Package Legitimacy Audit). |
| `web/src/pages/Markets.tsx` table body (search + sortable columns) | component | transform | **Flag for the planner:** no data-table/grid pattern (controlled search input, sortable column headers, derived filtered/sorted array in render) exists anywhere in `web/src`. `web/src/pages/Wallet.tsx`'s table (lines 14-29) is a pure static `.map()` render with no interactivity — useful only for the `<table>`/`<thead>`/`<tbody>` markup convention, not for search/sort state management. This needs a `useState` for query + sort column/direction and a derived (not stored) filtered+sorted array per D-46 — no existing hook or component demonstrates this shape. Not as risky as the chart (it's plain React state, no imperative library), but still net-new interaction logic with no local reference. |
| `web/src/lib/format.ts` | utility | transform | No formatting module exists in `web/src`; the closest thing is `Wallet.tsx`'s doc comment establishing the decimal-safety *constraint* this module must respect, not a pattern to copy. |
| `web/src/pages/Trade.test.tsx` (chart-rendering assertions) | test | streaming/render | No canvas/imperative-library test pattern exists; `renderToStaticMarkup` (the only FE test tool in this repo, confirmed via `web/package.json` — no `@testing-library/*`, no jsdom, `vitest.config.ts` sets `environment: "node"`) cannot execute `useEffect` or meaningfully inspect a `<canvas>`. Real verification is `scripts/smoke-dev.mjs`'s browser step only. |

## Refactor, Not Extend — Flagged for the Planner

**`api/src/lib/coingecko.ts`'s cache is single-resource-shaped and must be generalized, not copy-pasted.** Concretely:

1. **Storage backend mismatch.** `coingecko.ts` persists its one cached value as a row in the `upstream_checks` SQLite table, keyed implicitly by a hardcoded `SERVICE_NAME = "coingecko"` string constant (line 30) and read back via `db.select().from(upstreamChecks).where(eq(upstreamChecks.service, SERVICE_NAME)).orderBy(desc(...)).limit(1)` (lines 128-133). D-38 needs at least three independent cache entries (the top-20 markets list, 1D chart series, 7D/30D chart series) each with its own TTL, and per-coin chart caches multiply that by up to 20 coin ids. CONTEXT.md's "Claude's Discretion" explicitly leaves the choice between "in-memory map vs. the existing SQLite table" open — but *some* explicit keying scheme (a `Map<string, {value, fetchedAt}>` is the simpler and directionally-hinted choice, since D-38's TTLs are short-lived process-level caching, not the kind of audit trail `upstream_checks` exists for) must be designed before `marketData.ts` is written, not discovered mid-implementation. Plan for this as its own design step, not a drop-in reuse of `coingecko.ts`'s DB-row pattern.
2. **In-flight dedupe is a single module-level `let`, not a map.** Line 57 (`let inFlight: Promise<UpstreamCheck> | null = null;`) works because there is exactly one resource. D-39 needs this keyed the same way the cache is keyed (one in-flight promise per resource key: `"markets"`, `"chart:bitcoin:1d"`, etc.) — a straightforward `Map<string, Promise<T>>` generalization of the same `.finally()`-clears-itself idiom, but it is a structural change to the shape of the code, not a parameter addition.
3. **Stale-fallback-on-failure is new behavior, not present at all today.** `coingecko.ts`'s `getStatus()` has no failure-serves-stale-cache path — a failed `performCheck()` simply lets its `try`/`catch` classify the outcome as `"down"` and still writes+returns that as the *fresh* result (lines 68-101); there is no "last known good" branch. D-41 requires the opposite behavior for market data: on upstream failure, serve the last cached payload (marked `stale: true`) and only produce a hard error when no cache entry exists yet. This is new logic to design, not an existing branch to copy.
4. **Logging-on-stale is also new.** D-43 requires logging every stale-serve with the request id and upstream failure reason — `coingecko.ts`'s existing `ctx.log.info`/`ctx.log.warn` calls (lines 113-117) log every check regardless of outcome, which is close in spirit but not the same event (it logs the *check*, not specifically the *stale serve* decision) — plan a distinct log call site for "served stale because upstream failed," not a rename of the existing one.

Budget planning time for `marketData.ts` as an adaptation of `coingecko.ts`'s *proven primitives* (DI shape, timeout/classify split, dedupe-via-promise idiom, never-log-the-key discipline) rather than a mechanical copy — the keying, storage, and stale-fallback logic are all genuinely new design surface.

## Metadata

**Analog search scope:** `api/src/**`, `web/src/**`, `qa/**`, `scripts/**`, `api/package.json`, `web/package.json`, `web/vite.config.ts`, `api/.env.example` (via `find` + `git ls-files` + direct `Read`)
**Files scanned:** 21 new/modified files classified; ~16 existing files read in full or by targeted grep+offset for pattern extraction (`coingecko.ts`, `coingecko.test.ts` structure, `health.ts`, `wallet.ts`, `auth.ts`, `errors.ts`, `app.ts`, `config.ts`, `schema.ts`, `api.ts`, `healthPoller.ts`, `HealthBadge.tsx`/`.test.tsx`, `App.tsx`, `ComingSoon.tsx`, `Wallet.tsx`, `ProtectedRoute.tsx`, `auth.tsx`, `smoke-dev.mjs` (first 170 lines + stub-related grep hits), `qa/test-cases/auth.md`, `qa/runs/RUN-2026-09-16-auth.md`); all confirmed git-tracked via `git ls-files`, no gitignored mirrors encountered (flat repo, no submodules)
**Pattern extraction date:** 2026-09-16

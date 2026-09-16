# Phase 2: Accounts - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 26 (13 api, 10 web, 3 qa/scripts)
**Analogs found:** 15 / 26 (strong role+flow analogs exist for every API route/service/test file and the FE fetch-client/page-shell files; auth-specific primitives — password hashing, session/cookie handling, FE auth state, protected routes, forms — are genuinely new and have no in-repo analog)

**No 02-RESEARCH.md exists** (confirmed: `.planning/phases/02-accounts/` contains only `02-CONTEXT.md`). Unlike Phase 1, there is no Code Examples section to fall back on for the "No Analog Found" files below — the planner must derive those from CONTEXT.md's decisions (D-14..D-34) and general Fastify/React idioms, using the closest structural analog's *conventions* (naming, DI, test shape) even where the *substance* (crypto, cookies, forms) is new.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `api/src/db/schema.ts` (modify: add `users`, `sessions`, `balances`) | model | CRUD | `api/src/db/schema.ts` (self, `upstreamChecks` table) | exact |
| `api/src/db/migrations/0001_*.sql` (+ meta) | migration | batch | `api/src/db/migrations/0000_upstream_checks.sql` | exact |
| `api/src/lib/password.ts` (scrypt hash/verify) | utility | transform | none — no crypto/hashing utility exists | no-analog |
| `api/src/lib/password.test.ts` | test | transform | `api/src/lib/logger.test.ts` (pure-function unit test shape) | role-match |
| `api/src/lib/session.ts` (create/validate/revoke, token hashing) | service | CRUD | `api/src/lib/coingecko.ts` (service factory, DI'd `db`/`now`) | role-match |
| `api/src/lib/session.test.ts` | test | CRUD | `api/src/lib/coingecko.test.ts` | exact |
| `api/src/app.ts` (modify: cookie plugin, auth preHandler, route registration) | provider | request-response | `api/src/app.ts` (self, `buildApp`) | exact |
| `api/src/routes/auth.ts` (signup/login/logout/me) | route | request-response | `api/src/routes/health.ts` | exact |
| `api/src/routes/auth.test.ts` | test | request-response | `api/src/routes/health.test.ts` + `api/src/app.test.ts` | exact |
| `api/src/routes/wallet.ts` (`GET /api/wallet`) | route | CRUD | `api/src/routes/health.ts` | role-match |
| `api/src/routes/wallet.test.ts` | test | CRUD | `api/src/routes/health.test.ts` | role-match |
| `api/src/lib/errors.ts` (possible extension: typed `AppError` helper) | utility | request-response | `api/src/lib/errors.ts` (self) + `api/src/app.test.ts` (`Error & {statusCode,code}` idiom, lines 39-44) | exact |
| `api/.env.example` (modify: session/cookie config) | config | — | `api/.env.example` (self) | exact |
| `web/src/lib/api.ts` (modify: add `signup`/`login`/`logout`/`fetchMe`/`fetchWallet`) | utility | request-response | `web/src/lib/api.ts` (self, `fetchHealth`) | exact |
| `web/src/lib/session.ts` or `web/src/context/AuthContext.tsx` (session/auth state) | provider/hook | event-driven | none — no React Context/Provider exists; `web/src/lib/healthPoller.ts` is the closest *stateful async hook* shape but is not a Context | no-analog |
| `web/src/components/ProtectedRoute.tsx` | component | request-response | none — `web/src/App.tsx`'s `RouteObject`/`useRoutes` structure is the closest routing convention, but no route guard exists yet | no-analog |
| `web/src/pages/Signup.tsx` | component | request-response | `web/src/pages/ComingSoon.tsx` (page shell only — no form pattern exists) | role-match (shell only) |
| `web/src/pages/Login.tsx` | component | request-response | `web/src/pages/ComingSoon.tsx` (page shell only) | role-match (shell only) |
| `web/src/pages/Signup.test.tsx`, `Login.test.tsx` | test | request-response | `web/src/components/HealthBadge.test.tsx` (pure-view `renderToStaticMarkup` pattern) — but no form-submission/user-input test exists anywhere in-repo | role-match (view assertions only) |
| `web/src/App.tsx` (modify: `/signup`, `/login` public routes; `/wallet`, `/orders` protected; nav auth controls) | component | request-response | `web/src/App.tsx` (self) | exact |
| `web/src/App.test.tsx` (modify/extend) | test | request-response | `web/src/App.test.tsx` (self) | exact |
| `scripts/smoke-dev.mjs` (extend: signup → refresh → logout browser path, D-34) | config (script) | event-driven | `scripts/smoke-dev.mjs` (self) | exact |
| `qa/test-cases/auth.md` | config (doc) | — | `qa/templates/test-case-template.md` (template only — no filled `TC-*` file exists yet anywhere in the repo) | role-match (template, no filled precedent) |
| `qa/runs/RUN-YYYY-MM-DD-auth.md` | config (doc) | — | `qa/templates/run-report-template.md` (template only — no filled `RUN-*` file exists yet) | role-match (template, no filled precedent) |
| `qa/bugs/BUG-NNN-*.md` (if a case fails) | config (doc) | — | `qa/bugs/BUG-001-health-badge-api-unreachable.md` | exact |

## Pattern Assignments

### `api/src/db/schema.ts` (model, CRUD) — add `users`, `sessions`, `balances`

**Analog:** `api/src/db/schema.ts` (self, current content — read in full, 15 lines)

**Table pattern to copy verbatim** (lines 3-15):
```typescript
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const upstreamChecks = sqliteTable(
  "upstream_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    service: text("service").notNull(),
    status: text("status", { enum: ["ok", "degraded", "down"] }).notNull(),
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms").notNull(),
    checkedAt: text("checked_at").notNull(),
    requestId: text("request_id"),
  },
  (table) => [index("upstream_checks_service_checked_at_idx").on(table.service, table.checkedAt)],
);
```
Follow this exact shape for the three new tables: `integer(...).primaryKey({ autoIncrement: true })` for `id`, `text(...)` columns, a second callback returning an array of `index(...)`/`uniqueIndex(...)` calls for constraints. Per D-23/D-24, `users.email` needs a UNIQUE index (use `uniqueIndex`, imported the same way from `drizzle-orm/sqlite-core`) and `balances` needs a UNIQUE index on `(user_id, asset)`. Per D-24, `balances.amount` is `text(...)` (decimal string), never `real`/`integer` — this mirrors the project's existing all-`text`-for-precision-sensitive-fields convention (`checkedAt` is `text` not a native timestamp, for the same "never lose precision/format" reason).

---

### `api/src/db/migrations/0001_*.sql` (migration, batch)

**Analog:** `api/src/db/migrations/0000_upstream_checks.sql` + `api/drizzle.config.ts`

**Workflow:** never hand-write the SQL — run `npm run db:generate` (aliases `drizzle-kit generate`, `api/package.json` line 10) from `api/` after editing `schema.ts`; it reads `api/drizzle.config.ts` (`schema: "./src/db/schema.ts"`, `out: "./src/db/migrations"`) and emits `000N_<name>.sql` plus `meta/_journal.json`/`meta/NNNN_snapshot.json` updates, matching the existing `0000_upstream_checks.sql` format (`CREATE TABLE` + `--> statement-breakpoint` + `CREATE INDEX`). `api/src/db/client.ts` (lines 29-31) already runs `migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })` synchronously on every `createDb()` call — no additional wiring needed, new migrations apply automatically in dev, tests (`:memory:`), and smoke.

---

### `api/src/lib/password.ts` (utility, transform) — NO ANALOG

No hashing/crypto utility exists in this repo yet (`api/src/lib/logger.ts` and `coingecko.ts` are the only `lib/` files, and neither touches passwords). Follow D-14 exactly: Node's built-in `crypto.scrypt` (N=16384, r=8, p=1, 32-byte key, 16-byte random salt), self-describing stored string `scrypt$N$r$p$salt$hash`, verify via `crypto.timingSafeEqual`. Match the project's existing `lib/` conventions even though the algorithm is new:
- Named exports only (no default export) — matches `logger.ts`/`coingecko.ts`/`errors.ts`.
- A doc comment tying the implementation to its CONTEXT.md decision ID, exactly like `logger.ts`'s `/** D-08: ... */` (lines 11-17) and `errors.ts`'s `/** D-09: ... */` (lines 3-6).
- No `console.log`/stray output — this module must never log the raw password or the derived key (same "never logged" discipline as `coingecko.ts` lines 111-112 for the API key).

---

### `api/src/lib/password.test.ts` (test, transform)

**Analog:** `api/src/lib/logger.test.ts` — read it for the plain `describe`/`it` + `expect` shape used for a pure-function lib module (no Fastify app needed). Cover: correct password verifies, wrong password rejects, two hashes of the same password produce different salts/strings, the stored string round-trips through the verify function, and (D-15) exactly-8-character boundary is accepted.

---

### `api/src/lib/session.ts` (service, CRUD)

**Analog:** `api/src/lib/coingecko.ts` (full file, 157 lines — already read)

**Service-factory + DI pattern to copy** (lines 14-20, 48-49):
```typescript
export interface SessionDeps {
  db: AppDatabase;
  now?: () => number;
}

export function createSessionService(deps: SessionDeps) {
  const { db, now = Date.now } = deps;
  // ...
}
```
This is the exact shape to reuse: a `create*Service(deps)` factory closing over an injectable `db` and `now` (coingecko.ts's `now = Date.now` default, lines 49 and 92 — needed here too so session-expiry tests can inject a fake clock without faking global timers, avoiding the WebIDL-receiver class of bug documented in `wiki/pages/findings/health-poller-illegal-invocation.md`). Per D-16, store only the SHA-256 hash of the opaque token (`node:crypto` `createHash("sha256")`), never the raw token, in the `sessions` table — the raw token lives only in the cookie value returned to the caller. Per D-19, `validate(token)` deletes-and-returns-null lazily on an expired row (mirrors `coingecko.ts`'s pattern of reading then conditionally acting on a DB row, lines 128-144, though here the action is a delete instead of a cache-hit return).

---

### `api/src/lib/session.test.ts` (test, CRUD)

**Analog:** `api/src/lib/coingecko.test.ts` — same `createDb(":memory:")` + injected fake `now` setup used for `classifyPing`/cache-TTL tests; reuse that exact harness for session-expiry boundary tests (D-19: valid at 6d23h59m, expired at 7d00m01s) and for D-18's idempotent-logout case.

---

### `api/src/app.ts` (provider, request-response) — modify

**Analog:** `api/src/app.ts` (self, full file, already read)

**Critical existing integration point — read before writing anything else.** Lines 17-23 and line 91 already reserve the exact slot Phase 2 must fill:
```typescript
// Phase 2 populates this from the authenticated session; until then it is
// always null, but the request-log line (D-07) always has the slot.
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}
...
app.decorateRequest("userId", null);
```
The auth preHandler/hook must set `request.userId` (from the validated session) before route handlers run, so `RequestLogController.requestCompleted` (lines 54-77, already reading `request.userId ?? null` into every "request completed" log line) picks it up automatically — no logger change needed, this was built in Phase 1 specifically for this phase.

**No separate `plugins/` directory exists** — despite Phase 1's *planned* `api/src/plugins/request-id.ts`/`cors.ts` (see `01-PATTERNS.md`), the actual Phase 1 execution inlined request-ID generation and `@fastify/cors` registration directly into `buildApp()` (lines 85-103). Follow the *actual* convention: register `@fastify/cookie` and the auth preHandler inline in `buildApp()` alongside the existing `cors` registration (lines 100-103), not as a new `plugins/` file, unless the executor deliberately wants to split it out — either is consistent with Fastify, but the in-repo precedent is inline.

**Route registration pattern** (lines 105-117): `createXService(deps)` then `app.register(xRoutes, { ...opts, service })` — reuse for `auth.ts`/`wallet.ts` with `createSessionService`/`createPasswordService`-equivalent deps.

---

### `api/src/routes/auth.ts` (route, request-response)

**Analog:** `api/src/routes/health.ts` (full file, already read)

**Plugin shape to copy** (lines 27-91):
```typescript
export interface HealthRoutesOptions {
  version: string;
  commit: string;
  coingecko: CoingeckoStatusService;
}

const HEALTH_RESPONSE_SCHEMA = {
  200: {
    type: "object",
    additionalProperties: false,
    required: [...],
    properties: { ... },
  },
} as const;

const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (app, opts, done) => {
  app.get("/health", { schema: { response: HEALTH_RESPONSE_SCHEMA } }, async (request, reply) => {
    ...
    return reply.status(200).send(body);
  });
  done();
};

export default healthRoutes;
```
Reuse this exactly for `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`: a `FastifyPluginCallback<AuthRoutesOptions>` default export, one `app.<method>()` per endpoint, `additionalProperties: false` JSON response schemas (D-03's leak-prevention discipline — the health route's own comment at lines 33-36 explains why), errors thrown as `Error & { statusCode, code }` (see `errors.ts` below) rather than manually formatted, so the shared `registerErrorHandlers` produces the D-09 envelope automatically. Request-body validation (D-27, per-field errors) should use Fastify's built-in `schema.body` + `additionalProperties: false`, which already produces `error.validation` — `errors.ts`'s `errorHandler` (line 37-38) already maps that to code `VALIDATION_ERROR`; confirm this matches D-27's expected per-field shape or extend `errors.ts` (see below).

---

### `api/src/routes/auth.test.ts` (test, request-response)

**Analog:** `api/src/routes/health.test.ts` (structure: `createDb(":memory:")`, `createLogger({destination})`, `loadConfig({})`, `buildApp({...})`, `app.inject({...})`) + `api/src/app.test.ts` (D-09 error-shape assertions, lines 140-186, and the `Error & {statusCode,code}` idiom at lines 39-44 for simulating handler errors). Cover per CONTEXT.md: signup happy path + exactly-once balance grant (D-25, assert `balances` row count after a duplicate/retried signup), login generic-failure message for both unknown-email and wrong-password (D-26), signup's explicit duplicate-email error (D-26), session cookie attributes (`httpOnly`, `SameSite=Lax`, `Secure` only in production — D-17), logout idempotency (D-18), and `GET /api/me`/`GET /api/wallet` 401 with `UNAUTHENTICATED` when no/expired/invalid session cookie is sent (D-20/D-21).

---

### `api/src/routes/wallet.ts` (route, CRUD)

**Analog:** `api/src/routes/health.ts` (plugin shape) — same `FastifyPluginCallback` pattern; the handler reads `request.userId` (set by the Phase 2 auth preHandler — see `app.ts` above) and queries `balances` scoped to that id only, never accepting an id from the client (D-20).

---

### `api/src/lib/errors.ts` (utility, request-response) — likely extension

**Analog:** `api/src/lib/errors.ts` (self, full file, already read) + `api/src/app.test.ts` lines 39-44 for the throw-idiom currently used ad hoc in tests:
```typescript
const err = new Error("field is required") as Error & { statusCode: number; code: string };
err.statusCode = 400;
err.code = "BAD_INPUT";
throw err;
```
The existing `errorHandler` (lines 26-44) already turns any thrown `Error` with `.statusCode`/`.code` into the D-09 envelope — this needs no code change to support D-21's flat codes (`UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN`). What's missing is a reusable constructor instead of the inline cast-and-assign idiom repeated per call site; consider adding a small `AppError` class (e.g. `export class AppError extends Error { statusCode: number; code: string; constructor(statusCode, code, message) {...} }`) to `errors.ts` so `auth.ts`/`wallet.ts` throw `new AppError(401, "UNAUTHENTICATED", "...")` instead of duplicating the cast. This is additive only — `errorBody`, `notFoundHandler`, `errorHandler`, `registerErrorHandlers` (D-09) stay unchanged. D-27's per-field validation errors need their own shape decision (Fastify's native `error.validation` array vs. a custom `details` field on `errorBody`) — CONTEXT.md doesn't pin this down; flag it for the planner as a concrete open design point.

---

### `web/src/lib/api.ts` (utility, request-response) — modify

**Analog:** `web/src/lib/api.ts` (self, full file, already read)

**Pattern to replicate per new call** (lines 42-75, `fetchHealth`):
```typescript
export async function fetchHealth(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<HealthResponse>> {
  const { signal, fetchImpl = fetch } = options;
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/health`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(null, "NETWORK_ERROR", null);
  }
  const headerRequestId = response.headers.get("x-request-id");
  if (!response.ok) throw await parseErrorResponse(response, headerRequestId);
  ...
  return { data, requestId: headerRequestId };
}
```
Add `signup`, `login`, `logout`, `fetchMe`, `fetchWallet` following this exact shape, all through the same `parseErrorResponse` helper (lines 84-104, unchanged — already implements D-09's client-side error parsing with the `HTTP_<status>` fallback). Critically, `fetch` calls that carry the session must pass `credentials: "include"` (not currently needed by `fetchHealth`, which is unauthenticated) so the `httpOnly` cookie is sent cross-origin between `web`'s Vite dev server and `api`'s Fastify server — this is new, no in-repo precedent, and must pair with the CORS config's `credentials: true` + a non-wildcard origin (already true today: `deps.config.corsOrigins`, `app.ts` line 101, is an explicit origin list, not `*`).

---

### `web/src/lib/session.ts` / `AuthContext.tsx` (provider/hook, event-driven) — NO ANALOG

No React Context/Provider exists anywhere in `web/src` (`App.tsx` is plain `useRoutes`; `HealthBadge.tsx` is local `useState`/`useEffect` only). The closest *structural* precedent for a stateful async manager is `web/src/lib/healthPoller.ts` (full file, already read) — its `create*(options)` factory returning `{start, stop, refresh, isChecking}` plus an `onUpdate` callback is a reasonable shape to adapt into a `useAuth`/`AuthProvider`, and its discriminated-union state type (`HealthState = {kind:"loading"}|{kind:"ok",...}|{kind:"error",...}`) is directly reusable as the model for auth state (`{kind:"loading"}|{kind:"authenticated",email,balance}|{kind:"anonymous"}`), per D-29 ("bootstrapped once on app load with `GET /api/me`... loading state rather than flashing the login screen"). But the React Context wiring itself, and any provider component, are new — no `createContext`/`useContext` usage exists in the repo today.

---

### `web/src/components/ProtectedRoute.tsx` (component, request-response) — NO ANALOG

`web/src/App.tsx`'s `RouteObject[]`/`useRoutes` structure (lines 53-98, already read) is the only routing precedent, and every existing route is public — no `Navigate`-on-condition guard exists yet, though `Navigate` itself is already imported and used for the `/` → `/markets` redirect (line 57), which is the one reusable primitive: `<Navigate to="/login" replace />` for the logged-out case (D-28).

---

### `web/src/pages/Signup.tsx`, `Login.tsx` (component, request-response)

**Analog (shell only):** `web/src/pages/ComingSoon.tsx` (full file, already read) — same minimal `export function X({ props }) { return <section>...</section>; }` shape and file location (`web/src/pages/`), nothing more; ComingSoon has no form, so the form markup/validation/submit-handler itself has no in-repo precedent. Client-side validation approach is explicitly Claude's Discretion per CONTEXT.md.

---

### `web/src/pages/Signup.test.tsx`, `Login.test.tsx` (test, request-response)

**Analog:** `web/src/components/HealthBadge.test.tsx` (full file, already read) for the pure-view `renderToStaticMarkup` assertion style (no React Testing Library, no `@testing-library/user-event`, no jsdom `fireEvent` anywhere in this repo — confirmed via `web/package.json`, no testing-library dependency present). This means **there is no in-repo pattern for testing form input/submit interactions** — only static markup assertions (error text visible for a given prop-driven state, like `HealthBadgeView`'s `state` prop) and `app.inject()`-driven API-level tests (`auth.test.ts`) can be copied directly. If the executor needs real interaction testing (typing into fields, clicking submit), that is new tooling (e.g. `@testing-library/react` + `user-event`) not present in any existing `devDependencies` — flag as a dependency gap for the planner to budget, or scope Signup/Login tests to pure-view assertions plus the `npm run smoke` D-34 browser step for the real interactive path.

---

### `web/src/App.tsx` (component, request-response) — modify

**Analog:** `web/src/App.tsx` (self, full file, already read)

**Route-array pattern to extend** (lines 53-94): add `{ path: "signup", element: <Signup /> }` and `{ path: "login", element: <Login /> }` as public children (D-28), and wrap the `wallet`/`orders` route elements in `<ProtectedRoute>` per D-28. **Nav pattern to extend** (lines 20-36, `navLinkClassName` + `NavLink`): D-30 wants the nav to show signed-in email + Log out (replacing Log in/Sign up) on every page — this belongs in `AppLayout` alongside the existing `<NavLink to="/markets">`/`<NavLink to="/trade">` etc., reading from the new auth context/hook, not as a new standalone nav file (there is no existing nav-as-separate-component precedent — `AppLayout` owns the whole shell in one file, D-01).

---

## Shared Patterns

### D-09 error envelope + `AppError`-style throw idiom
**Source:** `api/src/lib/errors.ts` (unchanged: `errorBody`, `registerErrorHandlers`) + `api/src/app.test.ts` lines 39-44 (the cast-and-throw idiom already in use)
**Apply to:** `api/src/routes/auth.ts`, `api/src/routes/wallet.ts`, and any new `api/src/lib/*.ts` that needs to signal a client-facing failure (`session.ts` expired/invalid, `password.ts` never throws client-facing errors directly — routes translate)
```typescript
const err = new Error("Invalid email or password") as Error & { statusCode: number; code: string };
err.statusCode = 401;
err.code = "INVALID_CREDENTIALS";
throw err;
```
Consider promoting this to a named `AppError` class in `errors.ts` (see Pattern Assignments above) before Phase 2 accumulates several call sites of the raw cast.

### Request-ID / userId log correlation (D-07, D-21)
**Source:** `api/src/app.ts` lines 17-23, 48-78, 91 (already reserves `request.userId`)
**Apply to:** the new auth preHandler (sets `request.userId`), every route under `/api/*`
No code change needed in `RequestLogController` — it already reads `request.userId ?? null` into every "request completed" log line; Phase 2's only job is to populate that decorator via a preHandler before handlers run.

### Service factory with injectable `db`/`now`/`fetchImpl`
**Source:** `api/src/lib/coingecko.ts` lines 14-20, 48-49
**Apply to:** `api/src/lib/session.ts` (`db`, `now`), any signup-flow helper that needs deterministic time for session-expiry math in tests

### FE fetch-wrapper + `ApiError`/`ApiResult` contract
**Source:** `web/src/lib/api.ts` lines 23-40, 42-75, 77-104 (unchanged `ApiError`, `ApiResult<T>`, `parseErrorResponse`)
**Apply to:** every new FE call (`signup`, `login`, `logout`, `fetchMe`, `fetchWallet`) — same try/catch → `ApiError` → `parseErrorResponse` chain; new calls additionally need `credentials: "include"` (see `web/src/lib/api.ts` Pattern Assignment above).

### Pure-view / stateful-wrapper split for testability
**Source:** `web/src/components/HealthBadge.tsx` lines 21-59 (`HealthBadgeView`, pure) vs. 71-103 (`HealthBadge`, stateful `useEffect`/`useState` wrapper)
**Apply to:** any Phase 2 component with async state (Signup/Login forms, nav auth controls) — keep the render logic in a props-only pure component so `renderToStaticMarkup` tests (the only FE test tool available today) can exercise every visual state without simulating real interaction.

### QA bug-report format
**Source:** `qa/bugs/BUG-001-health-badge-api-unreachable.md` (full file, already read — the only filled bug report in the repo)
**Apply to:** any `qa/bugs/BUG-NNN-*.md` filed while executing `qa/test-cases/auth.md` — same field table (ID/Title/Severity/Priority/Status/Environment/Build commit/Request ID/Linked test case/Linked requirement/Found in run/Reporter/Date), the redaction warning under `## Evidence` (this repo is public — never paste a real session cookie or password), and cross-linking a wiki finding page if the root cause is non-trivial.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `api/src/lib/password.ts` | utility | transform | No hashing/crypto utility exists in `api/src/lib/`; follow D-14's scrypt spec directly, matching only the surrounding `lib/` file conventions (named exports, decision-ID doc comments) |
| `web/src/lib/session.ts` / `AuthContext.tsx` | provider/hook | event-driven | No React Context/Provider pattern exists anywhere in `web/src`; adapt `healthPoller.ts`'s stateful-factory/discriminated-union shape, but the Context wiring itself is new |
| `web/src/components/ProtectedRoute.tsx` | component | request-response | No route guard exists; only the bare `<Navigate>` redirect primitive (used for `/` → `/markets`) is reusable |
| `web/src/pages/Signup.tsx`, `Login.tsx` (form bodies) | component | request-response | `ComingSoon.tsx` supplies the page-shell convention only; no form/validation/submit pattern exists in-repo |
| `web/src/pages/Signup.test.tsx`, `Login.test.tsx` (interaction tests) | test | request-response | No interaction-testing tooling (`@testing-library/react`, `user-event`, jsdom `fireEvent`) exists in either `package.json`; only pure-view `renderToStaticMarkup` assertions and full-stack `app.inject()`/`smoke-dev.mjs` browser tests are available patterns today |
| `api/src/lib/session.ts` cookie mechanics (`@fastify/cookie` registration) | service/middleware | request-response | `@fastify/cookie` is not yet a dependency in `api/package.json`; no cookie-setting code exists anywhere in the repo (`app.ts`'s only response-header write today is `x-request-id`) |
| `qa/test-cases/auth.md`, `qa/runs/RUN-YYYY-MM-DD-auth.md` | config (doc) | — | `qa/README.md` explicitly confirms `qa/test-cases/` and `qa/runs/` are "Planned Folders... starting in Phase 2" — only the empty templates exist, no filled precedent to copy content (not structure) from |

## Metadata

**Analog search scope:** `api/src/**`, `web/src/**`, `qa/**`, `scripts/**`, `api/package.json`, `web/package.json` (via `git ls-files` + direct `Read`)
**Files scanned:** 24 (all tracked source files under `api/`, `web/`, `qa/`, `scripts/`; confirmed via `git ls-files` — no gitignored mirrors encountered, this is a flat repo with no submodules)
**Pattern extraction date:** 2026-09-16

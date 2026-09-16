# Phase 2: Accounts - Research

**Researched:** 2026-09-16
**Domain:** Fastify session-cookie auth, `crypto.scrypt` password hashing, Drizzle+better-sqlite3 transactional writes, React 19 auth bootstrapping, Vitest+`inject` cookie testing
**Confidence:** MEDIUM-HIGH (stack is already installed and pinned from Phase 1; the one new package is a well-known official Fastify plugin; the riskiest facts — better-sqlite3's async-transaction trap, the missing `credentials: true`/`PRAGMA foreign_keys` gaps, and the FE test environment — were verified directly against source files and official docs this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Password storage**
- **D-14:** Hash with Node's built-in `crypto.scrypt` (N=16384, r=8, p=1, 32-byte key, 16-byte random per-user salt), stored as a single self-describing string (`scrypt$N$r$p$salt$hash`) so parameters can change later without a migration. Verify with `crypto.timingSafeEqual`. **Rationale:** argon2/bcrypt are native addons that complicate the $0 free-tier deploy (Phase 7); scrypt is memory-hard, in the standard library, and needs no build step. **[ASSUMED]** — the swap point is one module if you prefer argon2id.
- **D-15:** Password rule is AUTH-01's minimum only: ≥ 8 characters, no composition rules. Trimming is NOT applied to passwords.

**Sessions**
- **D-16:** Opaque random session tokens (32 bytes, base64url), NOT JWTs. The token's SHA-256 hash is stored in a `sessions` table with `user_id`, `created_at`, `expires_at`; the raw token only ever lives in the cookie. **Rationale:** server-side revocation on logout is what AUTH-03 actually needs, and a stolen DB row cannot be replayed as a session.
- **D-17:** Cookie: `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production only (so `localhost` dev over http still works), name `session`. Absolute lifetime **7 days**, no sliding renewal — a session expires 7 days after login regardless of activity. **[ASSUMED]** — sliding expiry is the obvious alternative.
- **D-18:** Logout deletes the session row AND clears the cookie. Logging out with an already-invalid session still returns success (idempotent).
- **D-19:** Expired sessions are rejected on read and deleted lazily when encountered. No background sweeper in this phase.

**Isolation (AUTH-04)**
- **D-20:** The user's identity comes **only** from the session cookie. No endpoint in this phase accepts a user id from the client — not in a path, query or body. `GET /api/wallet` and `GET /api/me` are session-scoped by construction, which is the structural guarantee behind AUTH-04.
- **D-21:** Auth middleware rejects unauthenticated requests with `401` and the Phase 1 error envelope (`{ error: { code, message, requestId } }`, D-09). Codes: `UNAUTHENTICATED` (no/invalid/expired session), `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `VALIDATION_FAILED`.
- **D-22:** Because no id-bearing endpoint exists yet, the QA IDOR cases prove isolation by swapping session cookies between two live accounts and confirming each only ever sees its own data — and by recording that no id-parameterized route exists to attack. When Phases 4-5 add such routes, QA-04/QA-05 must add real IDOR cases against them.

**Accounts and the balance grant**
- **D-23:** `users` table: `id` (autoincrement), `email`, `password_hash`, `created_at`. Email is normalized (trimmed, lowercased) before storage and comparison, with a UNIQUE index enforcing AUTH-01's duplicate rejection at the database level, not just in application code.
- **D-24:** `balances` table: `user_id`, `asset`, `amount` — with a UNIQUE constraint on `(user_id, asset)`. Amounts are stored as **TEXT decimal strings** (e.g. `"10000.00000000"`), never REAL/float, honoring the project's decimal-safe rule (WAL-03). Phase 2 only writes and displays the granted value; arithmetic arrives in Phase 4.
- **D-25:** The 10,000 USDT grant is inserted **inside the same database transaction as the user row**, so AUTH-05's "exactly once" is guaranteed by atomicity plus the UNIQUE constraint rather than by application sequencing. A retry or a duplicate signup can never double-credit.

**Error semantics**
- **D-26:** Login failures return one generic message ("Invalid email or password") for both unknown-email and wrong-password, so login cannot be used to enumerate accounts. Signup, by contrast, returns an explicit "That email is already registered" because a signup form inherently reveals existence and a vague error there is a genuinely bad experience. **[ASSUMED]** — this asymmetry is a deliberate, documented trade-off; the QA test cases must assert both behaviors.
- **D-27:** Validation errors are returned per field so the FE can show messages inline (email format, password length, duplicate email).

**Frontend**
- **D-28:** Routes `/signup` and `/login` are public; `/wallet` and `/orders` become protected. `/markets` and `/trade` stay public (Phase 3 shows public market data). Visiting a protected route while logged out redirects to `/login`.
- **D-29:** Session state is bootstrapped once on app load with `GET /api/me`, which returns the email and balance for a valid session and `401` otherwise. While that request is in flight, protected routes render a loading state rather than flashing the login screen.
- **D-30:** The top nav shows the signed-in email and a Log out control on every page (AUTH-03's "from any page"), replacing Log in / Sign up when authenticated. This extends the Phase 1 dark shell rather than restyling it (D-01).

**Rate limiting**
- **D-31:** No login rate limiting in this phase; it is recorded as a known gap in the test plan's risk register and belongs to Phase 6 hardening. **[ASSUMED]** — call it out if you want a simple per-IP throttle now.

**QA (QA-02)**
- **D-32:** `qa/test-cases/auth.md` from the project template, IDs `TC-AUTH-NNN`, each row tracing to an AUTH-* requirement, covering positive, negative (bad email, short password, duplicate email, wrong password), boundary (exactly 8 characters), security/isolation (cookie swap, `httpOnly` not readable from JS, protected route while logged out, session survives refresh, dead after logout) and the exactly-once grant.
- **D-33:** The cases are executed against the running app and the results recorded in `qa/runs/RUN-YYYY-MM-DD-auth.md` using the run-report template, with any failure filed as `qa/bugs/BUG-NNN-*.md`. An unexecuted test-case file does not satisfy QA-02.
- **D-34:** Extend the `npm run smoke` browser step (added in 01-10) with a signup → refresh → logout path, so the auth happy path is covered by an automated real-browser check, not only by manual cases. Keep it small: the full Playwright suite is still Phase 6 (AUT-02).

### Claude's Discretion
- Fastify plugin structure for auth, cookie parsing library (`@fastify/cookie`), exact Drizzle migration layout, form component structure and client-side validation approach, and how the FE stores nothing (no tokens in `localStorage` — the cookie is the only session store).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope (this CONTEXT.md was generated by delegated orchestration, not an interactive discuss session; see its own provenance note).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Sign up with email/password (email format, password ≥ 8 chars, duplicate email rejected) | §Password Hashing (Pattern 1), §Drizzle+SQLite (unique index), §Code Examples (signup handler) |
| AUTH-02 | Log in and stay logged in across refresh (httpOnly session cookie) | §Session Cookies in Fastify (Pattern 2, 3), §React auth bootstrap (Pattern 6) |
| AUTH-03 | Log out from any page | §Session Cookies (clearCookie pitfall), §React nav (D-30 pattern) |
| AUTH-04 | A user can never read/modify another user's data (server-side) | §Isolation pattern (session-only identity, Pattern 4), §Testing (cookie-swap pattern) |
| AUTH-05 | New account credited 10,000 USDT exactly once | §Drizzle transactions (Pattern 3 — sync callback), §Common Pitfalls #1 |
| QA-02 | Manual test cases for Auth with traceability to AUTH-* | §Testing Auth with Vitest+inject, existing `qa/templates/` conventions (unchanged from Phase 1) |
</phase_requirements>

## Summary

Phase 2 adds exactly one new runtime dependency — `@fastify/cookie` — on top of the stack Phase 1 already installed and pinned (Fastify 5.12.4, Drizzle 0.45.2 + better-sqlite3 13.0.3, React 19.3.0 + react-router 8.4.0, Vitest 5.0.1). Everything else (opaque tokens, scrypt hashing, the `users`/`sessions`/`balances` schema, the auth middleware, the FE `AuthProvider`) is hand-rolled on top of primitives already in the stack: `node:crypto` for hashing/tokens, Drizzle's `sqliteTable`/`references`/`uniqueIndex` for schema, and the existing Fastify plugin/hook conventions from `api/src/app.ts`.

Three facts verified directly against this repo's source this session change how the plan must be written, not just how it should be implemented: (1) `api/src/app.ts:100-103` registers `@fastify/cors` **without** `credentials: true`, and `web/src/lib/api.ts:49`'s `fetchHealth` calls `fetchImpl` **without** `credentials: 'include'` — both must be added or every authenticated request silently fails (browser drops the cookie on the way out, or refuses to expose the response on the way back). (2) `api/src/db/client.ts:21-26` sets `journal_mode = WAL` but never `PRAGMA foreign_keys = ON` — SQLite disables foreign-key enforcement per connection by default, so D-24's `ON DELETE CASCADE` on `sessions.user_id`/`balances.user_id` will silently no-op unless this phase adds the pragma. (3) `web/vite.config.ts` runs Vitest with `environment: "node"` (no jsdom, no `@testing-library/react` in `web/package.json`) and the existing FE test suite (`App.test.tsx`) only ever asserts on `renderToStaticMarkup` output — there is no DOM, no click/submit simulation available today. Interactive form behavior (submitting the login form, watching the nav swap) can only be proven by the D-34 real-browser `npm run smoke` extension, exactly as the `health-poller-illegal-invocation` finding warns.

The other domain-specific risk worth calling out up front: **better-sqlite3's `db.transaction()` callback must be synchronous.** This is not merely a lint rule — the underlying driver returns as soon as the (async) function object is created, commits the transaction, and only *then* do any `await`ed statements inside actually run, meaning they execute **after** commit, outside the transaction, with no error thrown. For a `db.transaction()` that must atomically insert a `users` row and a `balances` row (AUTH-05's "exactly once"), this is the single most consequential pitfall in the phase — get it right by keeping the callback a plain (non-`async`) function and calling `.run()`/`.get()` synchronously on every statement inside it.

**Primary recommendation:** Add `@fastify/cookie` (11.1.2) to `api/`; hand-roll the session/password modules directly on `node:crypto` and the existing Drizzle schema conventions; fix the two missing `credentials` wiring gaps in `app.ts`/`api.ts` as part of this phase (not a follow-up); add `PRAGMA foreign_keys = ON` to `db/client.ts`; and keep FE auth-state tests string/markup-based like the existing suite, deferring anything that needs real DOM events to the `npm run smoke` extension.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Password hashing & verification | API / Backend | — | `node:crypto.scrypt`/`timingSafeEqual` run server-side only; the plaintext password never persists |
| Session token issuance/validation/revocation | API / Backend | Database / Storage | Opaque token hashed with SHA-256 and stored in `sessions`; validation is a DB lookup on every request (D-19) |
| Session cookie transport | Browser / Client | API / Backend | `httpOnly` cookie is set by the API (`@fastify/cookie`) and carried automatically by the browser on same-site requests — no JS ever reads it |
| Signup/login/logout forms | Browser / Client | — | Form state, client-side validation feedback (D-27) and submit-to-fetch wiring live in React |
| Protected-route gating | Browser / Client | API / Backend | FE redirects to `/login` for UX (D-28/D-29); the API's `401` + auth middleware is the actual security boundary (D-20/D-21) — the FE gate is a convenience, not the control |
| The 10,000 USDT grant | Database / Storage | API / Backend | Atomicity guarantee (D-25) is a DB transaction property; the API only orchestrates the single transactional call |
| CORS + cookie credential policy | API / Backend | — | `@fastify/cors`'s `credentials: true` + explicit origin allow-list is server config; the FE only sets `credentials: 'include'` on its own requests |
| Nav auth state (email + logout control) | Browser / Client | — | Purely presentational, driven by the bootstrapped `GET /api/me` result (D-30) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/cookie` | 11.1.2 `[VERIFIED: npm registry + github.com/fastify/fastify-cookie README, package-legitimacy check verdict OK]` | Cookie parsing/serialization, `reply.setCookie`/`reply.clearCookie` | Official Fastify org plugin; the only maintained way to get `Set-Cookie` semantics right (attribute encoding, `Max-Age` vs `Expires`) without hand-rolling header strings |
| `fastify` | 5.12.4 (already installed) | Auth routes, `preHandler` hook for the session guard | Already the project's API framework (Phase 1) |
| `drizzle-orm` + `better-sqlite3` | 0.45.2 / 13.0.3 (already installed) | `users`/`sessions`/`balances` tables, transactional writes | Already the project's ORM/driver (Phase 1); see §Drizzle+SQLite Specifics for the transaction pitfall |
| `react` / `react-router` | 19.3.0 / 8.4.0 (already installed) | `AuthProvider`, protected-route wrapper, `/signup` `/login` routes | Already the project's FE stack (Phase 1); the existing app uses `useRoutes` (declarative), not a data router with loaders — see §React Patterns |
| `node:crypto` (built-in) | Node 24.14.0 `[VERIFIED: node -v, this session]` | `scrypt`/`scryptSync`, `randomBytes`, `timingSafeEqual`, `randomUUID` (already used for request IDs) | No dependency at all — D-14's explicit rationale for avoiding argon2/bcrypt native addons |
| `vitest` | 5.0.1 (already installed) | Unit/integration tests for auth routes, password/session modules, `AuthProvider` logic | Already the project's test runner; `app.inject()` supports a `cookies` option and response `.cookies` getter (`light-my-request`) for asserting `Set-Cookie` — see §Testing |

### Supporting
No new supporting packages. Everything else needed (validation, error envelope, request logging) already exists in `api/src/lib/errors.ts` and `api/src/app.ts` and should be reused, not reimplemented.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled session module on raw `sessions` table | `@fastify/session` + a store adapter | `@fastify/session` is built around pluggable stores (typically Redis/Mongo-shaped); this project's requirement is a two-column SQLite lookup with SHA-256 hashing (D-16) — a store adapter would be more code than the ~60-line hand-rolled module, for a feature (pluggable backends) this project doesn't need |
| `crypto.scrypt` (Node built-in) | `argon2`/`bcrypt` via native addon | Already decided (D-14); native addons complicate the $0 free-tier deploy build step (Phase 7) — this is the documented rationale, not re-litigated here |
| Opaque token + DB session row | Signed/JWT cookie via `@fastify/cookie`'s `signed: true` or a JWT lib | Already decided (D-16); JWTs cannot be revoked without a blocklist, which reintroduces the exact DB lookup this design already has — opaque tokens make revocation (AUTH-03's logout) a single `DELETE` |
| Manual `Set-Cookie` header construction | `@fastify/cookie` | Manually encoding `Max-Age`, `SameSite`, `Secure`, `HttpOnly` and escaping the value is exactly the kind of "don't hand-roll" problem Phase 1's research called out for logging/CORS — same logic applies here |

**Installation:**
```bash
npm install @fastify/cookie --workspace=api
```

**Version verification:** `npm view @fastify/cookie version` → `11.1.2`, published 2026-07-15 `[VERIFIED: npm registry, this session]`. All other packages are unchanged from Phase 1's pinned, verified versions (`api/package.json`, `web/package.json` read this session) — no re-verification needed since this phase does not bump them.

## Package Legitimacy Audit

| Package | Registry | Age (last publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|--------------|-------------|---------|-------------|
| `@fastify/cookie` | npm | 2026-07-15 | 2,071,485 | github.com/fastify/fastify-cookie | OK `[VERIFIED: gsd-tools package-legitimacy check]` | Approved |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none — `@fastify/cookie` is 2+ months old at time of research with 2M+ weekly downloads and no `postinstall` script (`npm view @fastify/cookie scripts.postinstall` returned empty) `[VERIFIED: npm view, this session]`, matching the official `fastify` GitHub org.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────┐   POST /api/signup, /api/login        ┌───────────────────────────────────────────┐
│  Browser (React SPA)          │ ──────────────────────────────────────▶│  Fastify API (api/)                        │
│  AuthProvider (bootstraps     │   credentials: 'include' (MUST ADD —   │  ┌───────────────────────────────────────┐ │
│  GET /api/me once on load)    │   web/src/lib/api.ts:49 pattern today  │  │ routes/auth.ts                        │ │
│                                │   omits it)                            │  │  signup: validate → hash (scrypt) →   │ │
│  ProtectedRoute wrapper        │◀──────────────────────────────────────│  │   db.transaction(sync): insert user + │ │
│  (/wallet, /orders)            │   Set-Cookie: session=<opaque token>;  │  │   insert balances row (D-25)          │ │
│                                │   HttpOnly; SameSite=Lax; Path=/       │  │  login: verify hash → issue session   │ │
│  Nav shell shows email +       │                                        │  │  logout: delete session row + clear   │ │
│  Log out (D-30)                │   GET /api/me, /api/wallet             │  │   cookie (D-18, idempotent)           │ │
│                                │   Cookie: session=<opaque token>       │  └──────────────┬────────────────────────┘ │
└──────────────────────────────┘ ──────────────────────────────────────▶│                 │                          │
                                                                          │  ┌──────────────▼────────────────────────┐ │
                                                                          │  │ plugins/auth.ts (preHandler)          │ │
                                                                          │  │  SHA-256(cookie token) → sessions      │ │
                                                                          │  │  lookup → expired? delete+401 (D-19)  │ │
                                                                          │  │  valid? request.userId = String(id)   │ │
                                                                          │  │  invalid/missing? 401 UNAUTHENTICATED │ │
                                                                          │  └──────────────┬────────────────────────┘ │
                                                                          │                 │                          │
                                                                          │  ┌──────────────▼────────────────────────┐ │
                                                                          │  │ better-sqlite3 + Drizzle               │ │
                                                                          │  │  users / sessions / balances tables    │ │
                                                                          │  │  PRAGMA foreign_keys = ON (MUST ADD —  │ │
                                                                          │  │  db/client.ts:21-26 omits it today)    │ │
                                                                          │  └────────────────────────────────────────┘ │
                                                                          │  @fastify/cors: credentials: true (MUST   │
                                                                          │  ADD — app.ts:100-103 omits it today)     │
                                                                          └───────────────────────────────────────────┘
```

### Recommended Project Structure
```
api/src/
├── lib/
│   ├── passwords.ts       # hashPassword/verifyPassword (scrypt, self-describing format)
│   ├── sessions.ts        # createSession/validateSession/deleteSession (opaque token, SHA-256 hash)
│   └── errors.ts          # existing — reuse errorBody(), add no new shape
├── plugins/
│   └── auth.ts            # preHandler hook: cookie → session lookup → request.userId, or 401
├── routes/
│   └── auth.ts            # POST /api/signup, /api/login, /api/logout, GET /api/me
└── db/
    ├── schema.ts           # add users, sessions, balances tables
    └── migrations/         # drizzle-kit generate output for the above

web/src/
├── lib/
│   └── auth.ts             # AuthProvider/useAuth, fetchMe/postJson wrappers with credentials:'include'
├── components/
│   └── ProtectedRoute.tsx  # redirects to /login while unauthenticated; renders loading while bootstrapping
└── pages/
    ├── Signup.tsx
    └── Login.tsx
```

### Pattern 1: `crypto.scrypt` password hashing — self-describing format
**What:** Async hash on signup (never blocks the event loop needlessly at high volume), sync-friendly verify, one string that carries its own parameters so they can change later without a migration (D-14).
**When to use:** `hashPassword` at signup; `verifyPassword` at login. Hashing happens **before** the `db.transaction()` call, not inside it — hashing is CPU work with no need to be inside the atomic insert, and (see Pitfall 1) the transaction callback must stay synchronous anyway.
**Example:**
```typescript
// Source: nodejs.org/api/crypto.md, Node v24.x source (raw.githubusercontent.com/nodejs/node/v24.x/doc/api/crypto.md, fetched this session) [CITED]
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCRYPT_N = 16384; // D-14. Node's own default for `cost`/N is also 16384.
const SCRYPT_R = 8;     // D-14. Node's own default for `blockSize`/r is also 8.
const SCRYPT_P = 1;     // D-14. Node's own default for `parallelization`/p is also 1.
const KEY_LEN = 32;     // D-14: 32-byte derived key.
const SALT_LEN = 16;    // D-14: 16-byte random salt.

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derivedKey = (await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  // scrypt$N$r$p$saltHex$hashHex
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  // Derive using the SAME keylen as the stored hash's byte length: timingSafeEqual
  // throws (not "returns false") on a length mismatch, so deriving with a
  // hardcoded keylen while the stored hash is a different length would crash
  // the request instead of just rejecting the login.
  const actual = (await scryptAsync(password, salt, expected.length, { N, r, p })) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
```
**Known-answer / property test approach:**
```typescript
// Source: pattern synthesized from Node's crypto.md fixed-vector example (CITED)
it("hashPassword output round-trips through verifyPassword", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  expect(await verifyPassword("correct horse battery staple", encoded)).toBe(true);
  expect(await verifyPassword("wrong password", encoded)).toBe(false);
});

it("verifyPassword rejects a malformed encoded string instead of throwing", async () => {
  await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
});
```
**The `maxmem` pitfall, quantified:** Node's default `maxmem` is `32 * 1024 * 1024` (32 MiB) and it errors when `128 * N * r > maxmem` (approximately) `[VERIFIED: raw.githubusercontent.com/nodejs/node/v24.x/doc/api/crypto.md, lines 5934-6076, fetched this session — quoted verbatim: "maxmem {number} Memory upper bound. It is an error when (approximately) 128 * N * r > maxmem. Default: 32 * 1024 * 1024"]`. D-14's `N=16384, r=8` needs `128 × 16384 × 8 = 16,777,216` bytes (16 MiB) — comfortably under the 32 MiB default, so **no `maxmem` override is needed for these exact parameters**. This is a trap only if the parameters are later tuned up (e.g. OWASP's suggested `N=32768, r=8` needs exactly 32 MiB, right at the default boundary) — leave a comment at the constant declaration noting the relationship so a future bump doesn't silently start throwing `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`.

### Pattern 2: Opaque session tokens + cookie via `@fastify/cookie`
**What:** 32 random bytes, base64url-encoded, is the cookie value; its SHA-256 hash (not the raw token) is what's stored in `sessions`, so a DB read alone can never be replayed as a session (D-16).
**When to use:** `createSession(userId)` at signup/login; `validateSession(rawToken)` in the auth `preHandler`.
**Example:**
```typescript
// Source: github.com/fastify/fastify-cookie README (fetched this session) [CITED] +
// nodejs.org/api/crypto.md randomBytes/createHash (CITED) + D-16/D-17
import { createHash, randomBytes } from "node:crypto";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const SESSION_COOKIE_NAME = "session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // D-17: 7-day absolute lifetime

function setSessionCookie(reply: FastifyReply, rawToken: string, isProduction: boolean): void {
  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction, // D-17: Secure only in prod so localhost http still works
    maxAge: SESSION_TTL_MS / 1000, // @fastify/cookie's maxAge is SECONDS, not ms
  });
}

function clearSessionCookie(reply: FastifyReply, isProduction: boolean): void {
  // MUST repeat the same path/secure/sameSite options used at set-time — per
  // cookie semantics (RFC 6265) a cookie is identified by name+path+domain;
  // clearCookie with mismatched options creates a SEPARATE expired cookie and
  // leaves the original one alive in the browser (AUTH-03/D-18 would silently
  // fail to log the user out in that case).
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "lax", secure: isProduction });
}
```
**Registering the plugin (before the auth routes, per the plugin's own ordering requirement):**
```typescript
// Source: github.com/fastify/fastify-cookie README [CITED]
import cookie from "@fastify/cookie";

await app.register(cookie); // no `secret` needed — tokens are opaque, not signed (D-16)
```
Note: `@fastify/cookie`'s `secret` option is only for *signed* cookies; this design stores the token's hash server-side instead, so signing is redundant — omit `secret` entirely (do not register with a placeholder secret "just in case").

### Pattern 3: Atomic user + balance insert — better-sqlite3 requires a SYNCHRONOUS transaction callback
**What:** D-25's atomicity guarantee for the 10,000 USDT grant.
**When to use:** The signup handler, after hashing the password (Pattern 1) and validating uniqueness client-side-friendly (D-27), but the actual duplicate-email rejection is enforced by the UNIQUE index inside the transaction.
**This is the single highest-risk implementation detail in the phase.** better-sqlite3's own docs are explicit: `[CITED: github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md, fetched this session — quoted: "Transaction functions do not work with async functions. Technically speaking, async functions always return after the first await, which means the transaction will already be committed before any async code executes."]` Drizzle's better-sqlite3 driver inherits this exactly — a tracked upstream bug confirms the transaction wrapper does not `await` the callback for the better-sqlite3, bun-sqlite, expo-sqlite, and op-sqlite drivers (only `sqlite-proxy` awaits correctly) `[CITED: github.com/drizzle-team/drizzle-orm/issues/2275, "the transaction callbacks are not awaited, except for sqlite-proxy... better-sqlite3 executes const result = transaction(tx); instead of const result = await transaction(tx);", open as of this session]`. The practical effect: an `async` transaction callback does not reliably throw — it can silently commit early and run its `await`ed statements **after** commit, outside the transaction. For a "grant exactly once alongside user creation" guarantee, this must never happen.
```typescript
// Source: pattern combining Drizzle's documented sync-callback requirement (CITED
// via the WiseLibs/better-sqlite3 docs and drizzle-orm#2275 above) with this
// repo's existing schema/db conventions (api/src/db/client.ts, api/src/db/schema.ts)

// ❌ WRONG — async callback: statements may run after commit, or the whole
// operation may appear to succeed while the balance row was never written.
await db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values({ email, passwordHash }).returning();
  await tx.insert(balances).values({ userId: user.id, asset: "USDT", amount: "10000.00000000" });
});

// ✅ CORRECT — plain (non-async) callback, every statement called synchronously
// via drizzle-orm's sqlite query-builder methods (.run()/.get()/.all()).
function createUserWithGrant(email: string, passwordHash: string) {
  return db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({ email, passwordHash })
      .returning()
      .get(); // .get() executes synchronously and returns the row, not a Promise
    tx.insert(balances)
      .values({ userId: user.id, asset: "USDT", amount: "10000.00000000" })
      .run();
    return user;
  });
}
```
Because the outer function itself has no `await` inside, `createUserWithGrant` can be called as a plain synchronous function from the (async) Fastify route handler — only the surrounding route handler is async, not the transaction body.

### Pattern 4: Auth `preHandler` hook — session-only identity (D-20)
**What:** Every protected route resolves `request.userId` from the session cookie alone; nothing else is ever trusted as an identity source.
**When to use:** Registered as a `preHandler` on `/api/me`, `/api/wallet`, `/api/logout`, and any future protected route — never inline per-route.
**Example:**
```typescript
// Source: pattern built on this repo's existing FastifyRequest.userId contract,
// read this session at api/src/app.ts:17-23:
//   declare module "fastify" {
//     interface FastifyRequest {
//       userId: string | null;
//     }
//   }
//   // "Phase 2 populates this from the authenticated session; until then it is
//   // always null, but the request-log line (D-07) always has the slot."
// `users.id` is an autoincrement INTEGER primary key (D-23) — this hook MUST
// convert it with String(...) to satisfy the existing `string | null` contract,
// which also makes it flow automatically into the D-07 request-completed log
// line (api/src/app.ts's RequestLogController already reads request.userId).
export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawToken = request.cookies[SESSION_COOKIE_NAME];
  const session = rawToken ? await validateSession(rawToken) : null; // D-19: lazy expiry check+delete inside validateSession
  if (!session) {
    reply.code(401).send(errorBody("UNAUTHENTICATED", "Not signed in", request.id));
    return reply; // short-circuits the route handler
  }
  request.userId = String(session.userId);
}
```

### Pattern 5: CORS + fetch credential wiring (the two gaps that must be closed this phase)
**What:** For the cookie to leave the browser AND for the browser to accept the response, both sides of the `credentials` contract must be explicit.
**Verified gap #1 — API side.** `api/src/app.ts:100-103` currently registers CORS as:
```typescript
await app.register(cors, {
  origin: deps.config.corsOrigins,
  exposedHeaders: ["X-Request-Id"],
});
```
`[VERIFIED: api/src/app.ts:100-103, read this session]` — there is no `credentials: true`. Per `@fastify/cors`'s own docs, `credentials` "Configures the Access-Control-Allow-Credentials CORS header. Set to true to pass the header; otherwise, it is omitted." `[CITED: raw.githubusercontent.com/fastify/fastify-cors/main/README.md, fetched this session]`. Without it, a `fetch(..., { credentials: 'include' })` from the browser is blocked from reading the response even if the cookie itself made it through — every authenticated FE call (`GET /api/me`, wallet, logout) would appear to fail with a generic network/CORS error. `deps.config.corsOrigins` is already an explicit array (not `origin: true`), which is required for `credentials: true` to be legal — MDN/the CORS spec forbid combining `Access-Control-Allow-Credentials: true` with a wildcard `Access-Control-Allow-Origin: *`; an explicit origin list is exactly the fix, so this part of the existing config is already compatible.
```typescript
// Fix — add credentials: true
await app.register(cors, {
  origin: deps.config.corsOrigins,
  credentials: true,
  exposedHeaders: ["X-Request-Id"],
});
```
**Verified gap #2 — FE side.** `web/src/lib/api.ts:49`'s `fetchHealth` calls:
```typescript
response = await fetchImpl(`${API_BASE_URL}/health`, { signal });
```
`[VERIFIED: web/src/lib/api.ts:49, read this session]` — no `credentials` option, meaning fetch's default (`'same-origin'`) applies. `/health` doesn't need cookies so this is fine as-is, but any new Phase 2 fetch helper (`postJson`, `fetchMe`, etc.) must explicitly add `credentials: 'include'` or the browser will never attach the session cookie to a cross-origin (`localhost:5173` → `localhost:3000`) request in the first place — this is a stricter, earlier failure than gap #1 (the cookie never leaves the browser at all).
```typescript
response = await fetchImpl(`${API_BASE_URL}/api/me`, { signal, credentials: "include" });
```
**Why `SameSite=Lax` still works for this dev topology:** "site" for `SameSite` purposes is scheme + registrable domain — **port is not part of it** `[CITED: developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite, fetched this session]`. `http://localhost:5173` and `http://localhost:3000` are therefore same-site (though different origins, so CORS still applies) — a same-site `fetch()` with `credentials: 'include'` sends a `SameSite=Lax` cookie normally; Lax only withholds cookies on **cross-site** subrequests. D-17's choice of `Lax` (not `None`) is compatible with this dev setup precisely because same-site ≠ same-origin. **Open question for Phase 7:** if the deployed web and API end up on genuinely different domains (not just different ports of one dev host), `SameSite=Lax` would need to become `SameSite=None; Secure` — flagged in Open Questions below, not a Phase 2 blocker since D-17 already scopes `Secure` to production only.

### Pattern 6: React auth bootstrap without a login-screen flash (D-29)
**What:** One `GET /api/me` call on mount; protected routes render a loading state, not the login screen, while it's in flight. This repo's existing `HealthBadge`/`healthPoller` pattern (`web/src/lib/healthPoller.ts`, read this session) already establishes the house style for this: a `{ kind: "loading" } | { kind: "ok"; ...} | { kind: "error"; ... }` union driven by a plain fetch wrapper, no external state library. Reuse that shape for `AuthState`, not a new pattern.
**When to use:** A top-level `AuthProvider` wrapping `<AppRoutes />`; note the existing app uses `useRoutes` (declarative router), not `createBrowserRouter` with data loaders — do not introduce the data-router API just for this, it would be a larger, un-asked-for refactor of `App.tsx`.
```typescript
// Pattern consistent with web/src/lib/healthPoller.ts's HealthState convention
// (read this session) — not independently fetched from react-router docs, since
// this repo doesn't use react-router's data-loader APIs at all.
export type AuthState =
  | { kind: "loading" }
  | { kind: "authenticated"; email: string; balance: string }
  | { kind: "unauthenticated" };

// AuthProvider: on mount, fetchMe() with credentials:'include' (Pattern 5).
// 200 -> { kind: "authenticated", ... }; 401 -> { kind: "unauthenticated" };
// network/other error -> also { kind: "unauthenticated" } (fail closed, do not
// render protected content on an ambiguous error).

// ProtectedRoute:
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.kind === "loading") return <LoadingShell />; // never flashes /login
  if (auth.kind === "unauthenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```
`Navigate` (declarative redirect component), not `useEffect` + `useNavigate`, per the general react-router guidance surfaced this session `[CITED: general react-router v7/v8 community guidance — "React Router's Navigate component is preferable to useEffect + useNavigate for protected routes because it solves flicker issues and prevents the protected component from briefly rendering before the redirect runs"]` — and this repo's own `App.tsx` already uses `<Navigate to="/markets" replace />` for its index redirect (`web/src/App.tsx:57`, read this session), so this is consistent with existing house style, not a new pattern being introduced.

### Anti-Patterns to Avoid
- **`async` better-sqlite3/Drizzle transaction callbacks:** See Pattern 3 — the single most consequential mistake available in this phase; breaks AUTH-05's atomicity guarantee silently.
- **Trusting any client-supplied identifier (path/query/body) as the user id:** D-20 is structural — only `request.userId`, set exclusively by the `preHandler` from the session cookie, may ever determine whose data a handler touches.
- **Hardcoding a `keylen` in `verifyPassword` instead of deriving from the stored hash's byte length:** `timingSafeEqual` throws (not "returns false") on a length mismatch `[CITED: raw.githubusercontent.com/nodejs/node/v24.x/doc/api/crypto.md, timingSafeEqual section: "An error is thrown if a and b have different byte lengths"]` — a malformed/corrupted stored hash would then crash the login request instead of just rejecting it.
- **Registering `@fastify/cookie` with a `secret` "just in case":** This design stores the token's SHA-256 hash server-side (D-16); signing is a different, unused defense for a different design (client-trusted cookie contents) and adds a secret-management burden with no benefit here.
- **Forgetting `PRAGMA foreign_keys = ON`:** See Common Pitfalls #2 — `ON DELETE CASCADE` on the schema is inert without it.
- **Testing the login *form* (clicks, submit events) in Vitest:** The FE test environment is `"node"` with no DOM (`web/vite.config.ts`, read this session) and no `@testing-library/react` in `web/package.json` (read this session) — see Common Pitfalls #8.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| `Set-Cookie` header construction/parsing | A manual string-builder for cookie attributes | `@fastify/cookie`'s `reply.setCookie`/`reply.clearCookie`/`request.cookies` | Attribute encoding, `Max-Age` vs `Expires` semantics, and value escaping are exactly the class of "looks right, breaks in one browser" bug this project's Phase 1 research already flagged for other headers |
| Password hashing primitive | A hand-rolled PBKDF2/HMAC loop | `node:crypto.scrypt`/`scryptSync` | Built into Node, memory-hard, no dependency — and D-14 already made this call for the $0-deploy constraint |
| Constant-time secret comparison | `===` or `Buffer.equals()` on hash bytes | `node:crypto.timingSafeEqual` | `===`/`.equals()` short-circuit on the first differing byte, leaking timing information about how many leading bytes matched — the entire point of a constant-time compare |
| CSRF protection for the auth endpoints | A custom CSRF token scheme | `SameSite=Lax` (already D-17) | Lax cookies are not sent on cross-site subrequests (fetch/XHR) or non-top-level navigations, which blocks the classic cross-site `POST`-from-another-page CSRF vector for these JSON endpoints without any additional token plumbing — see Security Domain below for the boundary of what this does and doesn't cover |
| Migration tracking | Hand-written `ALTER TABLE` scripts | `drizzle-kit generate`/`migrate` (already the Phase 1 convention, `api/src/db/client.ts:29-31` runs `migrate()` at boot) | Same rationale as Phase 1's research: hand-rolled tracking is a common source of schema drift |

**Key insight:** Every hand-roll temptation in this phase (cookies, hashing, comparison) has a specific, well-known failure mode that is easy to get subtly wrong and hard to notice in testing (a cookie that "sort of" clears, a comparison that's "usually" fast enough, a hash that "looks" random) — exactly the kind of bug that would surface as a security-relevant QA finding rather than a functional one, which is the wrong place to catch it for a project whose headline deliverable is the QA rigor itself.

## Common Pitfalls

### Pitfall 1: `async` transaction callback silently breaks AUTH-05's atomicity
**What goes wrong:** The signup handler appears to work in casual testing (the promise resolves, a 200 comes back) but the balance row is written after the transaction already committed — or, under load/a retry, is missing entirely, or a race causes two grants.
**Why it happens:** better-sqlite3 (and Drizzle's driver wrapper around it, tracked as drizzle-orm#2275) does not `await` an async transaction callback; the callback function's own return (a pending Promise) is treated as "done" immediately, per the constant-time nature of a synchronous SQLite driver.
**How to avoid:** Pattern 3 above — plain (non-`async`) callback, `.run()`/`.get()`/`.all()` on every statement, no `await` anywhere inside `db.transaction((tx) => { ... })`.
**Warning signs:** A test that inserts a user and then immediately queries `balances` in the SAME transaction/connection can pass by accident (the row often does get written a few microseconds later, before the test's own query runs) — the bug is nondeterministic under concurrency, not a hard failure. Add an explicit `expect` that the balance row exists **and** an integration test that fires two concurrent signups with the same email and asserts exactly one succeeds (proves the transaction boundary, not just eventual consistency).

### Pitfall 2: Cascade deletes are inert without `PRAGMA foreign_keys = ON`
**What goes wrong:** `sessions.user_id references users.id, { onDelete: 'cascade' }` (or any FK) compiles and migrates fine, but deleting a `users` row leaves orphaned `sessions`/`balances` rows behind — no error, just silently wrong data.
**Why it happens:** SQLite disables foreign-key enforcement per connection by default, for backwards compatibility `[VERIFIED: sqlite.org/foreignkeys.html, fetched this session — quoted: "Foreign key constraints are disabled by default (for backwards compatibility), so must be enabled separately for each database connection... PRAGMA foreign_keys = ON;"]`. `api/src/db/client.ts:21-26` (read this session) currently runs only `sqlite.pragma("journal_mode = WAL")` — no `foreign_keys` pragma.
**How to avoid:** Add `sqlite.pragma("foreign_keys = ON")` in `createDb()`, alongside the existing WAL pragma, before `migrate()` runs.
**Warning signs:** A test that deletes a user and asserts their sessions/balances are gone passes today (that scenario isn't actually exercised yet) but would start silently failing to clean up once such a test is added, unless the pragma is set.

### Pitfall 3: Missing `credentials` wiring on either side breaks every authenticated request
**What goes wrong:** `GET /api/me` (and every protected call) fails from the browser even though `curl`/Postman/`app.inject()` tests against the same route pass.
**Why it happens:** Two independent gaps verified in this repo this session — `api/src/app.ts:100-103` has no `credentials: true` on the CORS plugin, and the existing FE fetch pattern (`web/src/lib/api.ts:49`) doesn't set `credentials: 'include'`. See Pattern 5 for both fixes.
**How to avoid:** Fix both as part of this phase's implementation, not as a follow-up — `app.inject()`-based tests won't catch this class of bug because `light-my-request` doesn't enforce browser CORS/credentials rules at all (see Testing section).
**Warning signs:** Manual QA (D-32/D-33, which does drive a real browser) is the actual backstop here — a passing `app.inject()` suite plus a broken browser session is exactly the shape this bug takes.

### Pitfall 4: `reply.clearCookie` with mismatched options leaves the original cookie alive
**What goes wrong:** Logout "succeeds" (200 response, DB session row deleted) but the browser still holds and resends the old `session` cookie, and the *next* request that hits `requireSession` gets `401 UNAUTHENTICATED` (because the DB row is gone) even though the user's browser looks logged-in-ish, or — worse — the cookie is simply never removed from the browser's cookie jar at all.
**Why it happens:** Per cookie semantics, a cookie is identified by name + path (+ domain); `Set-Cookie` with `Max-Age=0` only overwrites/expires a cookie whose path matches exactly. `reply.clearCookie('session', {})` (no `path`) does not necessarily match a cookie that was set with `path: '/'`.
**How to avoid:** Pass the exact same `path` (and any other scoping attributes) to `clearCookie` that were used in `setCookie` — see Pattern 2.
**Warning signs:** A test asserting `Set-Cookie` was sent on logout (easy, passes) is not the same as a test asserting the *right* cookie (matching path) was cleared — assert the parsed cookie's `path` explicitly in the logout test.

### Pitfall 5: `request.userId`'s existing type contract is `string | null`, but `users.id` is an integer PK
**What goes wrong:** A naive `request.userId = session.userId` (leaving it as a `number`) type-errors against the existing `declare module "fastify"` augmentation (`api/src/app.ts:17-23`, read this session) — or, if the type is loosened to accommodate it, silently breaks the D-07 request-log convention that already reads `request.userId` expecting a string.
**Why it happens:** The Phase 1 skeleton anticipated this field for Phase 2 but the schema decision (D-23: `id` autoincrement integer) wasn't locked until this phase's context.
**How to avoid:** Convert explicitly — `request.userId = String(session.userId)` — in the auth `preHandler` (Pattern 4).
**Warning signs:** A TypeScript compile error is actually the friendly outcome here; the dangerous version is quietly changing the augmented type to `number | null` instead, which would then need every other place `request.userId` is read (the log controller) to be re-verified for a type it wasn't written against.

### Pitfall 6: The FE test environment has no DOM — interactive auth flows can't be unit-tested the way they'd naively be written
**What goes wrong:** A test that does `fireEvent.click(submitButton)` or `userEvent.type(emailInput, ...)` (the standard `@testing-library/react` pattern) fails immediately — not because the auth logic is wrong, but because there is no `document`/`window` in the test environment at all.
**Why it happens:** `web/vite.config.ts` (read this session) sets `test: { environment: "node" }`, and `web/package.json` (read this session) has no `jsdom`/`happy-dom`/`@testing-library/react` dependency. The existing FE suite (`web/src/App.test.tsx`) only ever asserts on `renderToStaticMarkup(...)` output strings and `matchRoutes()` structural checks — there has never been a DOM event in this test suite.
**How to avoid:** Two options, and the planner should pick one explicitly rather than defaulting into it: (a) keep this convention — test `AuthProvider`'s state-machine logic (Pattern 6) as pure functions/hooks with `renderToStaticMarkup`+string assertions like the rest of the suite, and prove the actual interactive form (typing, submit, redirect, nav swap) only via the D-34 `npm run smoke` real-browser extension; or (b) add `jsdom` + `@testing-library/react` as new devDependencies for this phase, which is a real scope/tooling decision (new packages, a different test environment possibly per-file) that CONTEXT.md left as Claude's Discretion but did not explicitly choose. Given the `health-poller-illegal-invocation` finding's explicit lesson — "Unit tests running in a Node environment cannot catch browser-only host-object rules" — leaning on the real-browser smoke step for interaction correctness (option a) is consistent with this project's established pattern and doesn't introduce new test infrastructure risk mid-phase.
**Warning signs:** A `jsdom` import or `@testing-library/react` import appearing in a new test file is the tell that option (b) was chosen implicitly rather than decided — the planner should make this an explicit task if chosen.

## Code Examples

### Drizzle schema additions (matches this repo's existing `schema.ts` conventions)
```typescript
// Source: pattern combining this repo's existing api/src/db/schema.ts conventions
// (sqliteTable/index import shape, read this session) with Drizzle's documented
// sqlite-core syntax for uniqueIndex and references(..., { onDelete: 'cascade' })
// [CITED: github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sqlite-core/README.md,
// fetched this session — quoted: "capital: integer('capital').references(() => cities.id,
// { onUpdate: 'cascade', onDelete: 'cascade' })" and "uniqueIdx: uniqueIndex('unique_idx').on(countries.name)"]
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(), // normalized (trimmed+lowercased) in application code before insert, per D-23
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull(), // SHA-256 hex of the raw cookie token
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const balances = sqliteTable(
  "balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").notNull(),
    amount: text("amount").notNull(), // D-24: TEXT decimal string, never REAL
  },
  (table) => [uniqueIndex("balances_user_asset_idx").on(table.userId, table.asset)],
);
```

### `db/client.ts` — add the missing pragma
```typescript
// Diff against api/src/db/client.ts:21-26 (read this session)
const sqlite = new Database(databasePath);

if (databasePath !== ":memory:") {
  sqlite.pragma("journal_mode = WAL");
}
sqlite.pragma("foreign_keys = ON"); // NEW — required for cascade deletes to fire at all (Pitfall 2); safe for :memory: too
```

### Testing auth with Vitest + Fastify `inject`
```typescript
// Source: fastify.dev Testing guide (already cited in 01-RESEARCH.md) + light-my-request's
// documented `cookies` request option and `.cookies` response getter
// [CITED: github.com/fastify/light-my-request — "cookies - cookies to encode onto the
// Cookie request header" and "cookies - a getter that parses the set-cookie response
// header and returns an array with all the cookies and their metadata"]

it("logs in and sets a Set-Cookie the client can use on the next request", async () => {
  const app = await buildApp({ config, db, logger });
  await app.inject({ method: "POST", url: "/api/signup", payload: { email: "a@example.com", password: "password1" } });

  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: "a@example.com", password: "password1" },
  });
  expect(login.statusCode).toBe(200);
  const setCookie = login.cookies.find((c) => c.name === "session");
  expect(setCookie).toBeDefined();
  expect(setCookie?.httpOnly).toBe(true);
  expect(setCookie?.sameSite).toBe("Lax");

  const me = await app.inject({
    method: "GET",
    url: "/api/me",
    cookies: { session: setCookie!.value }, // simulates the browser resending it
  });
  expect(me.statusCode).toBe(200);
  expect(me.json().email).toBe("a@example.com");
});

it("AUTH-04: a second user's session cannot see the first user's data (cookie-swap isolation proof)", async () => {
  const app = await buildApp({ config, db, logger });
  const tokenA = await signupAndLogin(app, "a@example.com");
  const tokenB = await signupAndLogin(app, "b@example.com");

  const meAsA = await app.inject({ method: "GET", url: "/api/me", cookies: { session: tokenA } });
  const meAsB = await app.inject({ method: "GET", url: "/api/me", cookies: { session: tokenB } });
  expect(meAsA.json().email).toBe("a@example.com");
  expect(meAsB.json().email).toBe("b@example.com"); // never a@example.com — proves D-20's isolation
});

it("logout is idempotent (D-18): calling it twice both return success", async () => {
  const app = await buildApp({ config, db, logger });
  const token = await signupAndLogin(app, "a@example.com");
  const first = await app.inject({ method: "POST", url: "/api/logout", cookies: { session: token } });
  const second = await app.inject({ method: "POST", url: "/api/logout", cookies: { session: token } });
  expect(first.statusCode).toBe(200);
  expect(second.statusCode).toBe(200); // already-invalid session still succeeds
});
```
**What `app.inject()` genuinely cannot prove — and needs the D-34 real-browser step instead:** CORS behavior (`light-my-request` never enforces `Access-Control-*` semantics — it's an in-process fake HTTP layer, not a browser), whether the cookie is actually `httpOnly` from JS's perspective (`document.cookie` reads happen in a real page, not in `inject()`), and whether `fetch(..., { credentials: 'include' })` on the FE actually attaches the cookie across the real `localhost:5173`→`localhost:3000` boundary (Pattern 5's two gaps are exactly the kind of thing that passes every `inject()` test and fails in the browser). This mirrors the `health-poller-illegal-invocation` finding precisely: **Node-environment tests, including `inject()`, cannot prove browser-only behavior** — the D-34 smoke extension (signup → refresh → logout in a real browser) is not a nice-to-have here, it's the only check that exercises the credentials/CORS wiring at all.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| JWT-in-cookie for session state | Opaque token + server-side session store | Long-standing OWASP guidance, not a recent shift | Already D-16's choice; JWTs' unrevocability is the standing objection — worth noting this isn't a stale/legacy pattern being replaced, it's the mainstream recommendation for a system that needs real logout |
| bcrypt/argon2 as the default password KDF recommendation | Node's built-in `scrypt` used directly (no native addon) | Not a general industry shift — a project-specific tradeoff (D-14) driven by the $0/no-build-step deploy constraint | argon2id is still the more commonly recommended default elsewhere; this project's choice is documented as reversible (D-14's `[ASSUMED]` tag) |

**Deprecated/outdated:** Nothing in this phase's stack is itself deprecated — the two "old approaches" above are alternative designs, not superseded versions of the same tool.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Hand-rolling the session module (rather than `@fastify/session` or another store-backed session plugin) is the right call for this schema | Standard Stack, Alternatives Considered | Low — carried forward from CONTEXT.md's own framing (Claude's Discretion); the hand-rolled module is small and directly matches D-16's exact requirement |
| A2 | `SameSite=Lax` will need to become `SameSite=None; Secure` if Phase 7's deployed web/API end up on different registrable domains (not just different ports/paths of one host) | Pattern 5 | Medium for Phase 7, zero for Phase 2 — D-17 already scopes `Secure` to prod-only, and this doesn't change anything about this phase's implementation, only flags a future decision point |
| A3 | Option (a) in Pitfall 6 (keep FE auth tests markup/string-based, rely on `npm run smoke` for interactive proof) rather than adding `jsdom`+`@testing-library/react` this phase | Common Pitfalls #6 | Medium — if the planner instead wants real DOM-event testing for the login/signup forms, that's a legitimate but larger scope decision (new deps, environment config) that should be made explicitly, not defaulted into |
| A4 | react-router's `Navigate`-over-`useEffect` guidance for protected routes (cited from general community sources, not react-router's own docs directly) applies unchanged to this repo's `useRoutes`-based (non-data-router) setup | Pattern 6 | Low — this repo's own `App.tsx` already uses `<Navigate replace />` for its index redirect, so this is confirmed consistent with existing code, not just external guidance |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Does `SameSite=Lax` need to become `SameSite=None; Secure` for the actual Phase 7 deployment topology?**
   - What we know: Port is not part of "site" for `SameSite` purposes, so the current dev topology (`localhost:5173` ↔ `localhost:3000`) works fine with `Lax` `[CITED: MDN, this session]`.
   - What's unclear: Whether Phase 7's free-tier hosting will put the web app and API on the same registrable domain (e.g. one Render/Fly service serving both, or a reverse proxy) or on genuinely different domains (e.g. `app.vercel.app` calling `api.onrender.com`).
   - Recommendation: No action needed in Phase 2 — D-17's cookie config already handles both dev and "same-domain prod" correctly. Revisit only if Phase 7's research surfaces a cross-domain deployment shape.

2. **Should FE auth-flow interaction (form submit, redirect, nav swap) get real DOM-event unit tests this phase, or rely entirely on the D-34 browser smoke extension?**
   - What we know: The existing FE suite has zero DOM-event tests and zero DOM-capable dependencies; adding them is a real (if small) infrastructure decision.
   - What's unclear: Whether the planner/user wants that coverage now or is comfortable deferring all interactive-DOM correctness to the smoke script and the manual QA cases (D-32/D-33), consistent with the project's established browser-receiver lesson.
   - Recommendation: Default to option (a) in Pitfall 6 (no new DOM deps this phase) unless the planner has a specific reason to add them; either way, make the choice an explicit task rather than an implicit one.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js `node:crypto` (scrypt, randomBytes, timingSafeEqual, createHash) | Password hashing, session tokens | ✓ | Node 24.14.0 `[VERIFIED: node -v, this session]` | — |
| `@fastify/cookie` on the npm registry | Cookie plugin | ✓ | 11.1.2, installable `[VERIFIED: npm view, this session]` | — |
| better-sqlite3's synchronous transaction API | AUTH-05 atomicity | ✓ | Already installed (13.0.3) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — this phase adds exactly one new package and it's confirmed installable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1, `environment: "node"` in both `api/` and `web/` (unchanged from Phase 1) `[VERIFIED: web/vite.config.ts, read this session]` |
| Config file | `api/vitest.config.ts`, `web/vite.config.ts` (existing, no changes needed) |
| Quick run command | `npm test --workspace=api` / `npm test --workspace=web` |
| Full suite command | `npm test --workspaces --if-present` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| AUTH-01 | Signup: email format, ≥8 char password, duplicate email rejected (DB-level UNIQUE) | unit/integration (`app.inject()`) | `npx vitest run api/src/routes/auth.test.ts -t signup` | ❌ Wave 0 |
| AUTH-02 | Login sets a valid `httpOnly`/`SameSite=Lax` cookie; `GET /api/me` succeeds with it across a simulated "refresh" (`app.inject()` cookie-jar reuse) | unit/integration | `npx vitest run api/src/routes/auth.test.ts -t login` | ❌ Wave 0 |
| AUTH-03 | Logout deletes the session row, clears the cookie, and is idempotent | unit/integration | `npx vitest run api/src/routes/auth.test.ts -t logout` | ❌ Wave 0 |
| AUTH-04 | Cookie-swap isolation: user B's session never returns user A's data | unit/integration | `npx vitest run api/src/routes/auth.test.ts -t isolation` | ❌ Wave 0 |
| AUTH-05 | Exactly-once grant, including a concurrent-signup race test | unit/integration | `npx vitest run api/src/lib/sessions.test.ts` (or a dedicated `db/transactions.test.ts`) | ❌ Wave 0 |
| QA-02 | Manual test cases + executed run report | manual (not automatable) | n/a — `qa/test-cases/auth.md` executed against the running app, results in `qa/runs/RUN-YYYY-MM-DD-auth.md` | ❌ Wave 0 — new files, following existing `qa/templates/` conventions |
| (all) | Real-browser signup→refresh→logout path (credentials/CORS wiring, cookie httpOnly-ness) | browser smoke (D-34) | `npm run smoke` (extended) | ❌ Wave 0 — extend `scripts/smoke-dev.mjs` |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <changed-file>.test.ts`
- **Per wave merge:** `npm test --workspaces --if-present` (full suite)
- **Phase gate:** Full suite green, plus `npm run smoke` (extended for D-34) and the executed QA run report, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `api/src/lib/passwords.test.ts` — covers hashPassword/verifyPassword round-trip, malformed-hash handling, length-mismatch safety
- [ ] `api/src/lib/sessions.test.ts` — covers token generation/hashing, expiry lazy-delete (D-19), the sync-transaction pattern for the grant (AUTH-05)
- [ ] `api/src/routes/auth.test.ts` — covers AUTH-01..04's `app.inject()` scenarios above, including the `cookies` option/`.cookies` getter patterns
- [ ] `web/src/lib/auth.test.ts` — `AuthProvider`/`AuthState` logic tested via `renderToStaticMarkup`, matching `App.test.tsx`'s existing convention (see Pitfall 6 for the DOM-testing scope decision)
- [ ] `qa/test-cases/auth.md`, `qa/runs/RUN-YYYY-MM-DD-auth.md` — QA-02/D-32/D-33
- [ ] `scripts/smoke-dev.mjs` extension — D-34's signup→refresh→logout real-browser path

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `crypto.scrypt` memory-hard KDF (D-14) with per-user random salt; generic login error (D-26) to resist enumeration; ≥8-char minimum (D-15/AUTH-01) |
| V3 Session Management | Yes | Opaque, high-entropy (32-byte) token; server-side session store with explicit revocation on logout (D-16/D-18); absolute expiry checked+lazily deleted on read (D-19); `httpOnly` cookie (D-17) prevents JS/XSS token theft |
| V4 Access Control | Yes | Session-cookie-only identity (D-20); no client-suppliable user id anywhere in this phase's routes (D-21/D-22) |
| V5 Input Validation | Yes | Email format + password length validated server-side, per-field errors (D-27); Fastify schema validation (existing `VALIDATION_ERROR` convention from `api/src/lib/errors.ts`, reused) |
| V6 Cryptography | Yes | `node:crypto.scrypt`/`randomBytes`/`timingSafeEqual`/`createHash` — all standard-library primitives, no hand-rolled crypto (Don't Hand-Roll table) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Password brute-forcing / credential stuffing | Spoofing | scrypt's cost parameters slow single-guess hashing; **no rate limiting yet (D-31, explicit known gap for Phase 6)** — call this out in the QA risk register per D-31 |
| Session fixation | Spoofing | A fresh token is generated on every successful login (never reused from an anonymous/pre-auth state) — this phase's design has no "anonymous session" concept to fixate in the first place |
| CSRF on state-changing endpoints (signup/login/logout) | Tampering | `SameSite=Lax` blocks the cookie on cross-site subrequests entirely, which covers the standard cross-site-form/fetch CSRF vector for these JSON endpoints without a separate token scheme — see Don't Hand-Roll |
| Timing attack on login password comparison | Information Disclosure | `crypto.timingSafeEqual`, with a length-mismatch guard so the comparison never throws in a way that leaks information about the stored hash's shape (Pitfall/Anti-Pattern on `verifyPassword`) |
| Account enumeration via signup/login error messages | Information Disclosure | Deliberately asymmetric by design (D-26): login is silent, signup is explicit — documented trade-off, not an oversight; QA cases must assert both behaviors per D-32 |
| Session token leakage via XSS | Information Disclosure | `httpOnly` cookie — the token is never readable from `document.cookie`/JS at all, so even a successful XSS cannot exfiltrate it directly (though it could still ride along on same-origin fetches — out of scope for this phase's mitigations) |
| Cross-origin credential leakage via CORS misconfiguration | Information Disclosure / Spoofing | Explicit origin allow-list (`deps.config.corsOrigins`, already an array not a wildcard) + `credentials: true` only for that list — never `origin: true` combined with `credentials: true` |

## Sources

### Primary (HIGH confidence — read directly from this repo's source this session)
- `api/src/app.ts` — CORS registration (no `credentials: true`), `FastifyRequest.userId: string | null` contract, `RequestLogController`
- `api/src/lib/errors.ts` — existing error envelope/codes to reuse
- `api/src/db/schema.ts`, `api/src/db/client.ts` — existing table/migration/pragma conventions, missing `foreign_keys` pragma
- `web/src/lib/api.ts` — existing fetch wrapper conventions, missing `credentials: 'include'`
- `web/src/App.tsx`, `web/src/lib/healthPoller.ts` — existing routing/state-machine conventions to extend
- `web/vite.config.ts`, `web/package.json`, `api/package.json` — confirmed test environment (`"node"`, no jsdom/testing-library) and already-pinned dependency versions
- `wiki/pages/findings/health-poller-illegal-invocation.md` — the browser-receiver lesson applied throughout this research
- Live `npm view`/`npm registry` calls for `@fastify/cookie` (version, publish date, downloads, repo, postinstall) — this session

### Secondary (MEDIUM confidence — official docs fetched this session)
- [raw.githubusercontent.com/nodejs/node/v24.x/doc/api/crypto.md](https://github.com/nodejs/node/blob/v24.x/doc/api/crypto.md) — `scrypt`/`scryptSync` signatures, `maxmem` default and formula, `timingSafeEqual` length-mismatch throw behavior
- [github.com/fastify/fastify-cookie/blob/main/README.md](https://github.com/fastify/fastify-cookie/blob/main/README.md) — plugin registration, `setCookie`/`clearCookie` API, `secret` option scope
- [raw.githubusercontent.com/fastify/fastify-cors/main/README.md](https://github.com/fastify/fastify-cors) — `credentials` option
- [github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sqlite-core/README.md](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sqlite-core/README.md) — `references(..., { onDelete: 'cascade' })`, `uniqueIndex` syntax
- [github.com/drizzle-team/drizzle-orm/issues/2275](https://github.com/drizzle-team/drizzle-orm/issues/2275) — confirmed open bug: better-sqlite3/bun-sqlite/expo-sqlite/op-sqlite transaction callbacks are not awaited
- [github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — "Transaction functions do not work with async functions"
- [sqlite.org/foreignkeys.html](https://www.sqlite.org/foreignkeys.html) — foreign keys disabled by default, per-connection `PRAGMA foreign_keys = ON`
- [developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite) — "site" excludes port; `Lax` cross-site subrequest behavior
- [github.com/fastify/light-my-request](https://github.com/fastify/light-my-request) — `inject()`'s `cookies` request option and `.cookies` response getter

### Tertiary (LOW confidence — WebSearch synthesis, community sources)
- react-router protected-route/`Navigate`-vs-`useEffect` guidance — general community blog/dev.to consensus, not fetched from react-router's own docs directly; corroborated by this repo's own existing use of `<Navigate replace />` (Assumption A4)
- OWASP-style scrypt parameter recommendations (`N=32768`) mentioned only to quantify the `maxmem` boundary — not independently verified against an OWASP source this session, used only for illustrative contrast with D-14's already-locked parameters

## Metadata

**Confidence breakdown:**
- Standard stack (the one new package): HIGH — verified live against npm registry + official GitHub README + the package-legitimacy gate
- better-sqlite3/Drizzle transaction behavior: HIGH — corroborated by two independent official sources (better-sqlite3's own docs and a tracked drizzle-orm GitHub issue), and consistent with this repo's synchronous `createDb`/`migrate()` pattern already in place
- In-repo gaps (`credentials`, `foreign_keys` pragma, test environment, `userId` type contract): HIGH — read directly from source files this session, quoted verbatim
- Cookie/CORS/SameSite semantics: MEDIUM-HIGH — MDN + official plugin READMEs, cross-checked against multiple independent explanations
- React auth-bootstrap pattern specifics: MEDIUM — grounded in this repo's own existing conventions (`healthPoller.ts`, `App.tsx`) more than in external react-router docs, which were not fetched directly

**Research date:** 2026-09-16
**Valid until:** ~2026-10-16 (30 days) for architecture/pitfall patterns; re-verify `@fastify/cookie`'s version at execution time if the plan is executed significantly later than this research

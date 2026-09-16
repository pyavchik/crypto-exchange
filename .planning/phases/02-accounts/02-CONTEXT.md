# Phase 2: Accounts - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning

> **Provenance:** the user delegated this phase ("keep going, don't stop until phase 2 is done") instead of running an interactive `/gsd-discuss-phase 2`. Every decision below was made by the orchestrator from `.planning/REQUIREMENTS.md`, the Phase 1 conventions, and the $0/public-repo constraints. Decisions marked **[ASSUMED]** are the ones a human would most plausibly want to change; they are safe defaults, not preferences the user stated. Overriding any of them is a context edit plus a replan, not a rewrite.

<domain>
## Phase Boundary

Accounts only: sign up, log in, stay logged in across refresh, log out, server-side isolation between users, and a one-time 10,000 USDT credit. Delivered as FE + BE + manual auth test cases in one phase (the project's vertical-slice rule).

Requirements: AUTH-01..05, QA-02.

In scope: users table, password hashing, session issuing/validation, auth middleware, the balance grant, sign-up / login screens, protected routes, a logout control, and `qa/test-cases/auth.md` plus an executed run report.

NOT in scope (later phases): markets data and the markets table (Phase 3), wallet UI beyond showing the granted balance, orders, fees, P&L (Phases 4-5), password reset / email verification / OAuth / 2FA (out of scope for v1 per TEST-PLAN.md), account reset (WAL-04, Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Password storage
- **D-14:** Hash with Node's built-in `crypto.scrypt` (N=16384, r=8, p=1, 32-byte key, 16-byte random per-user salt), stored as a single self-describing string (`scrypt$N$r$p$salt$hash`) so parameters can change later without a migration. Verify with `crypto.timingSafeEqual`. **Rationale:** argon2/bcrypt are native addons that complicate the $0 free-tier deploy (Phase 7); scrypt is memory-hard, in the standard library, and needs no build step. **[ASSUMED]** — the swap point is one module if you prefer argon2id.
- **D-15:** Password rule is AUTH-01's minimum only: ≥ 8 characters, no composition rules. Trimming is NOT applied to passwords.

### Sessions
- **D-16:** Opaque random session tokens (32 bytes, base64url), NOT JWTs. The token's SHA-256 hash is stored in a `sessions` table with `user_id`, `created_at`, `expires_at`; the raw token only ever lives in the cookie. **Rationale:** server-side revocation on logout is what AUTH-03 actually needs, and a stolen DB row cannot be replayed as a session.
- **D-17:** Cookie: `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production only (so `localhost` dev over http still works), name `session`. Absolute lifetime **7 days**, no sliding renewal — a session expires 7 days after login regardless of activity. **[ASSUMED]** — sliding expiry is the obvious alternative.
- **D-18:** Logout deletes the session row AND clears the cookie. Logging out with an already-invalid session still returns success (idempotent).
- **D-19:** Expired sessions are rejected on read and deleted lazily when encountered. No background sweeper in this phase.

### Isolation (AUTH-04)
- **D-20:** The user's identity comes **only** from the session cookie. No endpoint in this phase accepts a user id from the client — not in a path, query or body. `GET /api/wallet` and `GET /api/me` are session-scoped by construction, which is the structural guarantee behind AUTH-04.
- **D-21:** Auth middleware rejects unauthenticated requests with `401` and the Phase 1 error envelope (`{ error: { code, message, requestId } }`, D-09). Codes: `UNAUTHENTICATED` (no/invalid/expired session), `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `VALIDATION_FAILED`.
- **D-22:** Because no id-bearing endpoint exists yet, the QA IDOR cases prove isolation by swapping session cookies between two live accounts and confirming each only ever sees its own data — and by recording that no id-parameterized route exists to attack. When Phases 4-5 add such routes, QA-04/QA-05 must add real IDOR cases against them.

### Accounts and the balance grant
- **D-23:** `users` table: `id` (autoincrement), `email`, `password_hash`, `created_at`. Email is normalized (trimmed, lowercased) before storage and comparison, with a UNIQUE index enforcing AUTH-01's duplicate rejection at the database level, not just in application code.
- **D-24:** `balances` table: `user_id`, `asset`, `amount` — with a UNIQUE constraint on `(user_id, asset)`. Amounts are stored as **TEXT decimal strings** (e.g. `"10000.00000000"`), never REAL/float, honoring the project's decimal-safe rule (WAL-03). Phase 2 only writes and displays the granted value; arithmetic arrives in Phase 4.
- **D-25:** The 10,000 USDT grant is inserted **inside the same database transaction as the user row**, so AUTH-05's "exactly once" is guaranteed by atomicity plus the UNIQUE constraint rather than by application sequencing. A retry or a duplicate signup can never double-credit.

### Error semantics
- **D-26:** Login failures return one generic message ("Invalid email or password") for both unknown-email and wrong-password, so login cannot be used to enumerate accounts. Signup, by contrast, returns an explicit "That email is already registered" because a signup form inherently reveals existence and a vague error there is a genuinely bad experience. **[ASSUMED]** — this asymmetry is a deliberate, documented trade-off; the QA test cases must assert both behaviors.
- **D-27:** Validation errors are returned per field so the FE can show messages inline (email format, password length, duplicate email).

### Frontend
- **D-28:** Routes `/signup` and `/login` are public; `/wallet` and `/orders` become protected. `/markets` and `/trade` stay public (Phase 3 shows public market data). Visiting a protected route while logged out redirects to `/login`.
- **D-29:** Session state is bootstrapped once on app load with `GET /api/me`, which returns the email and balance for a valid session and `401` otherwise. While that request is in flight, protected routes render a loading state rather than flashing the login screen.
- **D-30:** The top nav shows the signed-in email and a Log out control on every page (AUTH-03's "from any page"), replacing Log in / Sign up when authenticated. This extends the Phase 1 dark shell rather than restyling it (D-01).

### Rate limiting
- **D-31:** No login rate limiting in this phase; it is recorded as a known gap in the test plan's risk register and belongs to Phase 6 hardening. **[ASSUMED]** — call it out if you want a simple per-IP throttle now.

### QA (QA-02)
- **D-32:** `qa/test-cases/auth.md` from the project template, IDs `TC-AUTH-NNN`, each row tracing to an AUTH-* requirement, covering positive, negative (bad email, short password, duplicate email, wrong password), boundary (exactly 8 characters), security/isolation (cookie swap, `httpOnly` not readable from JS, protected route while logged out, session survives refresh, dead after logout) and the exactly-once grant.
- **D-33:** The cases are executed against the running app and the results recorded in `qa/runs/RUN-YYYY-MM-DD-auth.md` using the run-report template, with any failure filed as `qa/bugs/BUG-NNN-*.md`. An unexecuted test-case file does not satisfy QA-02.
- **D-34:** Extend the `npm run smoke` browser step (added in 01-10) with a signup → refresh → logout path, so the auth happy path is covered by an automated real-browser check, not only by manual cases. Keep it small: the full Playwright suite is still Phase 6 (AUT-02).

### Claude's Discretion
- Fastify plugin structure for auth, cookie parsing library (`@fastify/cookie`), exact Drizzle migration layout, form component structure and client-side validation approach, and how the FE stores nothing (no tokens in `localStorage` — the cookie is the only session store).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §Phase 2 — goal, 4 success criteria, 3 planned plans
- `.planning/REQUIREMENTS.md` — AUTH-01..05, QA-02
- `.planning/PROJECT.md` — constraints ($0 budget, stack, decimal math, reviewer audience)

### Phase 1 conventions this phase must follow
- `.planning/phases/01-foundation-project-memory/01-CONTEXT.md` — D-01 (dark shell), D-02 (polling), D-09 (error envelope), D-13 (CI)
- `api/src/lib/errors.ts`, `api/src/app.ts` — existing error envelope, request-ID and CORS wiring
- `api/src/db/schema.ts`, `api/src/db/migrations/` — Drizzle table and migration conventions
- `web/src/lib/api.ts` — FE API client conventions, `ApiError`, request-ID surfacing
- `scripts/smoke-dev.mjs` — the real-browser smoke step to extend (D-34)
- `wiki/pages/findings/health-poller-illegal-invocation.md` — the browser-receiver lesson: Node tests do not prove browser behavior

### QA
- `qa/TEST-PLAN.md` — severity/priority rules, exit criteria, traceability conventions
- `qa/templates/test-case-template.md`, `qa/templates/run-report-template.md`, `qa/templates/bug-report-template.md`
- `qa/bugs/BUG-001-health-badge-api-unreachable.md` — the filed-bug format to match

### Project memory
- `wiki/SCHEMA.md`, `wiki/index.md`, `wiki/log.md` — decisions go in `wiki/pages/decisions/`, mirrored one line into `.planning/PROJECT.md` Key Decisions
- `wiki/pages/concepts/order-rules.md` — 10,000 USDT starting balance, decimal-safe rule

</canonical_refs>

<open_questions>
## Open Questions (non-blocking; defaults chosen, reversible)

1. Session lifetime: 7-day absolute (D-17) vs sliding renewal on activity.
2. Password hashing: `crypto.scrypt` (D-14) vs argon2id via a native addon.
3. Signup's explicit duplicate-email error (D-26) — accepted account-enumeration trade-off.
4. No login rate limiting in this phase (D-31).

</open_questions>

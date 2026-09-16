---
title: Session authentication model (scrypt passwords, opaque session cookies)
type: decision
updated: 2026-09-16
sources: []
related: [[foundation-skeleton-conventions]], [[tech-stack]], [[health-poller-illegal-invocation]]
---

# Session authentication model

**Status:** Accepted (Phase 2 "Accounts", 2026-09-16). Full detail: `.planning/phases/02-accounts/02-CONTEXT.md` (D-14..D-31, D-34).

## Context

AUTH-01..05 need password storage, session issuing/validation, cross-user isolation and a
one-time balance grant, all inside the project's $0 constraint (no native-addon build step for
the free-tier deploy in Phase 7) and its decimal-safe-money rule. Phase 2 shipped this as three
plans (sign-up tracer slice, login/logout/wallet, frontend login/guards) plus this closing plan,
which proves the whole journey in a real browser and records the decisions as durable memory.

## Decision

- **Password hashing (D-14):** `crypto.scrypt` (N=16384, r=8, p=1, 32-byte key, 16-byte random
  per-user salt) from Node's standard library, stored as a single self-describing string
  (`scrypt$N$r$p$salt$hash`) so the parameters can change later without a migration, verified
  with `crypto.timingSafeEqual`. Chosen over argon2id/bcrypt specifically because those are
  native addons that would complicate the free-tier deploy in Phase 7 — scrypt is memory-hard,
  ships in the standard library, and needs no build step. The swap point is one module
  (`api/src/lib/password.ts`) if a native KDF is ever preferred.
- **Opaque sessions (D-16..D-19):** 32-byte random tokens, never JWTs. Only the token's SHA-256
  hash is stored server-side in the `sessions` table, so a leaked database row cannot be replayed
  as a session — revocation on logout is a single `DELETE`, not a blocklist. The cookie is
  `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production only, with a 7-day **absolute**
  lifetime and no sliding renewal; expired sessions are rejected on read and deleted lazily
  (no background sweeper this phase).
- **Identity from the cookie only (D-20, D-22):** no endpoint in this phase accepts a user id
  from the client, in a path, query, or body — `GET /api/me` and `GET /api/wallet` are
  session-scoped by construction. This is the structural form of the cross-user isolation
  requirement, and it is why this phase's isolation proof is a cookie swap between two live
  accounts rather than an object-reference attack: there is no id-bearing route to attack yet.
  Phases 4-5, which add id-bearing routes (orders, cancellations), must add real IDOR cases
  against those routes when they land.
- **Atomic balance grant (D-24, D-25):** the 10,000 USDT grant is inserted inside the same
  `db.transaction` callback as the new user row, so "exactly once" is guaranteed by atomicity
  plus a `UNIQUE(user_id, asset)` constraint rather than by application sequencing. The trap this
  closes: `better-sqlite3`'s `db.transaction()` requires a **synchronous** callback — an `await`
  inside it silently breaks the atomicity guarantee instead of erroring, so the whole grant path
  is written as one synchronous function. The unique constraint is the backstop if a race still
  reaches the database concurrently (proven in 02-02 by firing two unawaited signups for the same
  email and asserting exactly one user row and one balance row survive).
- **Error-message asymmetry (D-26):** login returns one generic `INVALID_CREDENTIALS` message for
  both an unknown email and a wrong password, so login cannot be used to enumerate accounts.
  Signup, by contrast, returns an explicit `EMAIL_TAKEN` message, because a signup form already
  reveals whether an email is registered and a vague error there is a genuinely bad user
  experience for no security benefit. This is a deliberate, documented trade-off, not an
  oversight — the QA test cases assert both behaviors independently.
- **Two Phase 1 wiring gaps closed:** `credentials: true` added to the API's CORS configuration
  (without it, the browser discards the `Set-Cookie` response and silently strips the cookie on
  future requests, even though `app.inject()`-based tests never notice), and
  `PRAGMA foreign_keys = ON` added to the SQLite connection (without it, the schema's
  `ON DELETE CASCADE` rules on `sessions`/`balances` are declared but never enforced). Both are
  the same class of defect as [[health-poller-illegal-invocation]]: invisible to a Node-only test
  environment, visible only in a real browser or a real cascading delete.
- **Test-scope decision (02-03 lineage):** the `web/` workspace keeps its Node Vitest environment
  and asserts on rendered markup (`renderToStaticMarkup`); no DOM environment or
  interaction-testing library was added this phase. The interactive path — typing into a form,
  submitting, the redirect, the nav swap from Log in/Sign up to email + Log out — is proven
  instead by this plan's `npm run smoke` real-browser step (D-34), not by a unit test. This
  follows directly from [[health-poller-illegal-invocation]]'s lesson: a Node test cannot observe
  browser-only behavior, so the one thing worth paying for is a small, deterministic real-browser
  check rather than a heavier DOM-simulation dependency for markup-only assertions.
- **Known gap (D-31):** no login rate limiting in this phase. Recorded here and in
  `qa/TEST-PLAN.md`'s risk register as deferred to the Phase 6 hardening work, not an oversight.

## Consequences

- Revoking a session is one `DELETE`, and a stolen `sessions` row is useless without the raw
  token, which only ever lives in the httpOnly cookie — verified in this plan's `npm run smoke`
  step, which asserts `document.cookie` never contains a `session` entry at any point in the
  signup → logout → login journey.
- Because every session-scoped route is structurally incapable of taking an id from the client,
  adding a new private route in a later phase is safe by default; the risk only appears if a
  future route is written to accept an id parameter, which is exactly what D-22 flags for
  Phases 4-5 to re-examine.
- The atomic-grant pattern (synchronous `db.transaction` callback) is the template for any future
  multi-table write that must never partially apply — the order/fill logic in Phase 4-5 will need
  the same discipline for balance debits/credits.
- No rate limiting means brute-force login attempts are unmitigated until Phase 6; this is an
  accepted, time-boxed risk for a $0 portfolio project, not a production posture.

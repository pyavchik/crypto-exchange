---
phase: 02-accounts
plan: 02
subsystem: auth
tags: [fastify, cookie, scrypt, drizzle, better-sqlite3, vitest, session]

requires:
  - phase: 02-accounts
    provides: 02-01's users/sessions/balances schema, password.ts (scrypt), session.ts (opaque tokens, cookie helpers, requireSession), accounts.ts (atomic user+grant, findByEmail/findById/listBalances), errors.ts's D-09 envelope, POST /api/signup, GET /api/me
provides:
  - POST /api/login — issues a fresh session, one identical INVALID_CREDENTIALS message/status/code for unknown-email and wrong-password (D-26), case/whitespace-insensitive email match
  - POST /api/logout — idempotent (D-18): revokes the session row when present, always clears the cookie at the exact scope it was set with, always 200
  - GET /api/wallet — session-scoped balances only, structurally incapable of reading an identity from path/query/body (D-20)
  - AppError(statusCode, code, message, fields?) — the one constructor every client-facing failure in auth.ts now throws
  - errors.ts's D-27 fields extension — optional per-field validation detail on the D-09 envelope, VALIDATION_ERROR only, every other error unchanged
  - validateCredentials({email, password}) — shared signup/login semantic validation (email format, password length 8..200, boundary inclusive, never trims password)
  - Automated proofs: 7-day session expiry boundary (injected clock), lazy-delete-on-expiry row count, revocation isolation, AUTH-05's concurrent-duplicate-signup race, PRAGMA foreign_keys cascade, AUTH-04 cookie-swap isolation + forged-token rejection on both GET /api/me and GET /api/wallet
affects: [02-03 (frontend login/logout/protected routes — codes against this exact HTTP surface), 02-04/02-05 (QA test cases and manual run trace directly to these endpoints and fixed user-facing strings)]

actuals:
  tokens: 10400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "AppError class (extends Error, carries statusCode/code/optional fields) replaces the cast-and-assign Error idiom from 02-01 — every client-facing throw in auth.ts now goes through one constructor"
    - "validateCredentials(...) returns a fields record consumed by both signup and login, so both surfaces validate identically and both benefit from the timing-safe login path (validation happens before any account lookup)"
    - "DUMMY_PASSWORD_HASH computed once at module load (top-level await) as the verification target for an unmatched email, so login's scrypt cost is paid on every attempt regardless of whether the account exists (T-02-10 timing-safety)"
    - "Injected-clock testing (mutable `now` variable passed to createSessionService) for both sides of the expiry boundary, matching the project's existing coingecko.test.ts convention — no real clock in session.test.ts"

key-files:
  created:
    - api/src/routes/wallet.ts
    - api/src/routes/wallet.test.ts
    - api/src/lib/session.test.ts
    - api/src/lib/accounts.test.ts
  modified:
    - api/src/routes/auth.ts
    - api/src/routes/auth.test.ts
    - api/src/lib/errors.ts
    - api/src/app.ts
    - api/src/app.test.ts

key-decisions:
  - "Applied validateCredentials (including the 8-character password minimum) to login as well as signup, not just the empty-email case the plan's behavior block named explicitly — a login attempt with a password shorter than the minimum could never match a real account, so rejecting it as VALIDATION_ERROR rather than paying a wasted credential check is consistent with D-26 (it doesn't depend on account existence) and with the plan's own Task 2 action item 2 instruction that validateCredentials is 'used by both signup and login'"
  - "Password max-length rejection message is 'Password must be at most 200 characters' — the interface_contract's fixed-string list only specifies the minimum-length message; the maximum is Claude's Discretion per T-02-16's DoS mitigation, not asserted verbatim anywhere else"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

coverage:
  - id: D1
    description: "An existing user can log in and receive a fresh session cookie different from any prior one, and both remain valid"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/login > logs in with existing credentials and returns a session cookie different from signup's"
        status: pass
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/login > both the signup cookie and the login cookie work on GET /api/me"
        status: pass
    human_judgment: false
  - id: D2
    description: "Login failures are indistinguishable for an unknown email and a wrong password — same status, code, and byte-identical message"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/login > returns 401 INVALID_CREDENTIALS for an email that was never registered"
        status: pass
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/login > returns a byte-identical body (except requestId) for a wrong password as for an unknown email"
        status: pass
    human_judgment: false
  - id: D3
    description: "Login matches accounts case-insensitively and ignoring surrounding whitespace"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/login > matches the account case-insensitively and ignores surrounding whitespace"
        status: pass
    human_judgment: false
  - id: D4
    description: "Logout kills the session server-side, clears the cookie at the exact scope it was set with, and is idempotent (works twice, works with no cookie)"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/logout > returns 200 { ok: true } and clears the session cookie at path=/"
        status: pass
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/logout > kills the session server-side: replaying the same cookie on GET /api/me after logout returns 401"
        status: pass
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/logout > is idempotent: a second call with the same dead cookie, and a call with no cookie, both return 200"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/wallet returns exactly the caller's own balances and 401s without a session, never reading identity from path/query/body"
    requirement: "AUTH-04"
    verification:
      - kind: integration
        ref: "api/src/routes/wallet.test.ts#GET /api/wallet > returns exactly one USDT balance of 10000.00000000 for a fresh account"
        status: pass
      - kind: integration
        ref: "api/src/routes/wallet.test.ts#GET /api/wallet > returns 401 UNAUTHENTICATED with a requestId when there is no session cookie"
        status: pass
      - kind: unit
        ref: "grep -Eq check in wallet.ts's own <verify> — handler never references request.params/query/body"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cross-account isolation: two live accounts' session cookies each return only their own data on GET /api/me and GET /api/wallet; a forged (never-issued) token is rejected on both"
    requirement: "AUTH-04"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#GET /api/me > AUTH-04: cookie-swap isolation — each session returns only its own account, and a forged token returns 401"
        status: pass
      - kind: integration
        ref: "api/src/routes/wallet.test.ts#GET /api/wallet > AUTH-04: two live accounts each get 200 on their own cookie, and a forged token returns 401"
        status: pass
    human_judgment: false
  - id: D7
    description: "Sessions are valid up to their 7-day absolute expiry and rejected one minute past it, with the expired row deleted (no accumulation, no background sweeper); revoking one session leaves a sibling session of the same user valid"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "api/src/lib/session.test.ts#createSessionService > accepts a session one minute before its 7-day expiry and rejects it one minute after (D-17/D-19)"
        status: pass
      - kind: unit
        ref: "api/src/lib/session.test.ts#createSessionService > deletes the expired session row on validate, so the table does not accumulate dead rows and the same token cannot be retried (D-19)"
        status: pass
      - kind: unit
        ref: "api/src/lib/session.test.ts#createSessionService > revoking one session removes exactly that row and leaves the same user's other session valid"
        status: pass
    human_judgment: false
  - id: D8
    description: "A duplicate or concurrent signup for the same email can never double-credit — exactly one user row and one 10,000.00000000 USDT balance row survive, and the cascade delete (PRAGMA foreign_keys) is proven live, not just declared in the schema"
    requirement: "AUTH-05"
    verification:
      - kind: unit
        ref: "api/src/lib/accounts.test.ts#createAccountService > throws on a duplicate email and leaves exactly one user row and one balance row (AUTH-05)"
        status: pass
      - kind: integration
        ref: "api/src/lib/accounts.test.ts#AUTH-05 > two signups for the same email fired back to back settle as exactly one success and one 409, one user row and one balance row"
        status: pass
      - kind: unit
        ref: "api/src/lib/accounts.test.ts#createAccountService > deleting a user row cascades to that user's sessions and balances (PRAGMA foreign_keys proof)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Invalid signup or login input returns 400 with a per-field message per invalid field at once; the 8-character password boundary is inclusive; a password is never trimmed; a duplicate email is caught regardless of case/whitespace; every pre-existing error response keeps its exact three-member shape"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/signup — per-field validation (D-27) (6 tests: invalid email, short password, 8-char boundary, untrimmed password, both-fields-invalid, case/whitespace duplicate)"
        status: pass
      - kind: integration
        ref: "api/src/app.test.ts (three new tests: plain AppError keeps 3-member envelope, fields appear only when supplied, a 500-class AppError still returns the generic envelope)"
        status: pass
    human_judgment: false

duration: ~11min
completed: 2026-09-16
status: complete
---

# Phase 2 Plan 2: Login, Logout, Wallet, and the Validation/Isolation Proofs Summary

**Login/logout/`GET /api/wallet` complete the account lifecycle on top of 02-01's signup slice, with per-field validation routed through a single `AppError` constructor and automated proof — not just declared intent — that no session can read another account's data, the 10,000 USDT grant cannot double-credit under a concurrent race, and expired sessions are rejected and cleaned up on both sides of the 7-day boundary.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-09-16T10:04:22+03:00 (approximate — right after 02-01's docs commit)
- **Completed:** 2026-09-16T10:15:31+03:00
- **Tasks:** 3 (all committed)
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- `POST /api/login`: verifies credentials with a timing-safety guard (scrypt always runs, even against a fixed dummy hash for an unmatched email), issues a fresh session token distinct from any prior session, matches accounts case/whitespace-insensitively, and returns one byte-identical `INVALID_CREDENTIALS` body (status, code, message) for both an unknown email and a wrong password (D-26)
- `POST /api/logout`: idempotent (D-18) — revokes the DB session row when present and always clears the cookie through the same scoped helper used to set it (never a scope-mismatched second cookie), returning `200 { ok: true }` even with a dead or absent cookie
- `GET /api/wallet` (new route, `api/src/routes/wallet.ts`): session-scoped balances only; a `grep`-enforced structural guarantee that the handler never reads `request.params`/`query`/`body` backs AUTH-04 as a property of the code, not a check that could be forgotten (D-20)
- `AppError` (`api/src/lib/errors.ts`): the one constructor every client-facing throw in `auth.ts` now uses, replacing 02-01's cast-and-assign idiom; `errorBody`/`errorHandler` extended with an optional `fields` member (D-27), attached to the D-09 envelope only for non-empty validation detail below 500 — every other error keeps its exact three-member shape
- `validateCredentials({email, password})`: shared by signup and login — email trimmed and regex-validated (≤254 chars), password never trimmed (raw string is the secret, D-15), 8-character minimum with an inclusive boundary, 200-character maximum rejected before hashing (T-02-16); both fields' problems surface in one response
- Automated proofs added this plan: 7-day session expiry on both sides of the boundary via an injected clock (`session.test.ts`), lazy-delete-on-expiry verified by row count (not just the null return), revocation isolation between two sessions of the same user, AUTH-05's concurrent-duplicate-signup race fired via two unawaited `app.inject()` calls, the `PRAGMA foreign_keys` cascade proven live by deleting a user row and confirming sessions/balances are gone, and AUTH-04 cookie-swap isolation plus forged-token rejection on both `GET /api/me` and `GET /api/wallet`
- Full API suite green: 87/87 tests, `typecheck`/`lint`/`format:check` all clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Log in, log out, and read your own wallet** - `0bbe53d` (feat)
2. **Task 2: Per-field validation and the error-code contract** - `55fe3ae` (feat)
3. **Task 3: Prove isolation, exactly-once crediting, and session expiry** - `5b9ac82` (test)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

_Note: all three tasks carried `tdd="true"` — tests were written first and confirmed RED (404s for Task 1's not-yet-registered routes, 500s for Task 2's not-yet-existing `AppError`, and Task 3's isolation/expiry/exactly-once tests ran GREEN immediately since 02-01's `session.ts`/`accounts.ts` were already correct) before implementation made them pass; committed once per task per the plan's commit-scope (this plan's frontmatter is `type: execute`, not `type: tdd`)._

## Files Created/Modified

- `api/src/routes/wallet.ts` — `GET /api/wallet`, session-scoped, identity from `request.userId` only
- `api/src/routes/wallet.test.ts` — 3 tests: fresh-account balance, no-cookie 401, cookie-swap isolation + forged token
- `api/src/routes/auth.ts` — `POST /api/login`, `POST /api/logout` added; `validateCredentials` shared helper; all cast-and-assign throws converted to `AppError`
- `api/src/routes/auth.test.ts` — login (6 tests), logout (3 tests), signup validation (6 tests), cookie-swap isolation, login-empty-email-validation added; 39 tests total in the file
- `api/src/lib/errors.ts` — `AppError` class; `ApiErrorBody`/`errorBody` widened with optional `fields`
- `api/src/lib/session.test.ts` (new) — 4 tests: expiry boundary, lazy-delete row count, revocation isolation, forged-token null
- `api/src/lib/accounts.test.ts` (new) — 4 tests: single grant, duplicate-email row counts, cascade delete, AUTH-05 concurrent race
- `api/src/app.ts` — registers `walletRoutes` with the same `accounts` service and the same `createRequireSession(sessions)` instance used by auth routes
- `api/src/app.test.ts` — `AppError` replaces the local cast idiom for `/__test/bad-input`; 3 new envelope-shape assertions

## Decisions Made

- Applied `validateCredentials` (including the 8-character minimum) to login as well as signup — the plan's behavior block only named the empty-email case explicitly, but a login password shorter than the minimum can never match a real account, so rejecting it as `VALIDATION_ERROR` before touching account lookup keeps D-26's no-account-enumeration property intact (the check doesn't depend on whether the account exists) and matches Task 2's own instruction that the helper is "used by both signup and login."
- Password too-long rejection message is `"Password must be at most 200 characters"` — the interface contract's fixed-string list only specifies the minimum-length message; the maximum-length wording is Claude's Discretion per T-02-16.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' behavior blocks and acceptance criteria passed after implementation, with no bugs found in the 02-01 `session.ts`/`accounts.ts` code that Task 3's proofs exercised (all passed on first run).

## Issues Encountered

- `npm run format:check` flagged `api/src/lib/session.test.ts` and `api/src/routes/auth.ts` after Task 3's edits (Prettier line-wrapping preferences, not a logic issue). Fixed with `npx prettier --write` on exactly those two files; full suite re-verified green afterward. Not logged as a plan deviation (Rule 1 scope) since it's a formatting-only, zero-behavior-change fix required by the plan's own `<verify>` step.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 02-03 (frontend login/logout/protected routes) can code directly against this plan's `interface_contract` — the HTTP surface, status codes, error codes, and fixed user-facing strings (`Invalid email or password`, `That email is already registered`, `Enter a valid email address`, `Password must be at least 8 characters`) are all live and test-asserted.
- 02-04/02-05 (manual QA test cases and executed run) can trace directly to the endpoints and proofs in this plan — the cookie-swap isolation, exactly-once-grant, expiry-boundary, and idempotent-logout cases already have an automated analog to cross-reference.
- `web/` was not touched by this plan (scope fence honored) — no handoff items identified for 02-03 beyond what's already in the interface contract.
- No blockers. All plan-level `<verification>` items are green: `npm --prefix api run test` (87/87), `npm --prefix api run typecheck`, `npm run lint`, `npm run format:check`.

---
*Phase: 02-accounts*
*Completed: 2026-09-16*

## Self-Check: PASSED

- `api/src/routes/wallet.ts` — FOUND
- `api/src/routes/wallet.test.ts` — FOUND
- `api/src/lib/session.test.ts` — FOUND
- `api/src/lib/accounts.test.ts` — FOUND
- `api/src/routes/auth.ts` (login/logout routes) — FOUND
- `api/src/lib/errors.ts` (AppError) — FOUND
- Commit `0bbe53d` — FOUND in `git log --oneline --all`
- Commit `55fe3ae` — FOUND in `git log --oneline --all`
- Commit `5b9ac82` — FOUND in `git log --oneline --all`
- All plan `<verification>` commands re-run and passing: `npm --prefix api run test` (87/87), `npm --prefix api run typecheck`, `npm run lint`, `npm run format:check`
- No `web/` files modified (scope fence honored) — confirmed via `git diff --stat 9f124eb..HEAD -- web/` (empty)

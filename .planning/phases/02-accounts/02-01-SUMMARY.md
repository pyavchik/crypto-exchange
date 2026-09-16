---
phase: 02-accounts
plan: 01
subsystem: auth
tags: [fastify, cookie, scrypt, drizzle, better-sqlite3, react, session]

requires:
  - phase: 01-foundation-project-memory
    provides: Fastify app shell, D-09 error envelope, request-id/CORS wiring, SQLite+Drizzle client, React dark shell, npm run smoke real-browser step
provides:
  - users/sessions/balances SQLite schema + migration (0001)
  - scrypt password hashing (password.ts) — D-14
  - opaque session tokens, httpOnly cookie, requireSession preHandler (session.ts) — D-16/D-17/D-19/D-20
  - atomic user + 10,000 USDT grant (accounts.ts) — D-25
  - POST /api/signup, GET /api/me
  - React AuthProvider/useAuth auth state machine bootstrapped from GET /api/me — D-29
  - /signup and /wallet pages
  - npm run smoke real-browser signup -> funded wallet -> reload proof
affects: [02-02 (login/logout/wallet endpoint), 02-03 (protected routes, nav logout), 02-05 (QA test cases against these exact endpoints)]

actuals:
  tokens: 14700
  tasks: 3
  commits: 3

tech-stack:
  added: ["@fastify/cookie@11.1.2"]
  patterns:
    - "Service factory with injectable db/now (createSessionService, createAccountService), matching coingecko.ts"
    - "Synchronous better-sqlite3 db.transaction callback for atomic multi-table writes"
    - "React AuthState discriminated union (loading/authenticated/anonymous) modeled on healthPoller.ts's HealthState"
    - "Pure-view / stateful-wrapper split (SignupView/Signup, WalletView/Wallet) matching HealthBadgeView/HealthBadge"

key-files:
  created:
    - api/src/lib/password.ts
    - api/src/lib/password.test.ts
    - api/src/lib/session.ts
    - api/src/lib/accounts.ts
    - api/src/routes/auth.ts
    - api/src/routes/auth.test.ts
    - web/src/lib/auth.tsx
    - web/src/lib/auth.test.tsx
    - web/src/pages/Signup.tsx
    - web/src/pages/Wallet.tsx
  modified:
    - api/src/db/schema.ts
    - api/src/db/client.ts
    - api/src/config.ts
    - api/.env.example
    - api/src/app.ts
    - web/src/lib/api.ts
    - web/src/App.tsx
    - web/src/App.test.tsx
    - scripts/smoke-dev.mjs

key-decisions:
  - "Added AccountService.findById (not in the plan's interface_contract) — GET /api/me only has request.userId from the session and needs the account's email, which findByEmail alone cannot resolve"
  - "auth.test.ts renamed to auth.test.tsx — the file renders JSX (SignupView/WalletView/AppRoutes), which esbuild does not parse inside a .ts extension"
  - "Filtered the browser's own 'Failed to load resource ... 401' console message for GET /api/me specifically by URL — every anonymous page load triggers this expected 401 (D-29's bootstrap), and Chrome logs it as a console error independent of the app's own fetch handling"

patterns-established:
  - "Duplicate-email mapping keys off better-sqlite3's own error shape (code SQLITE_CONSTRAINT_UNIQUE, message containing the column name), verified empirically against the installed driver rather than assumed from docs"
  - "Session cookie set/clear helpers share one options function so clearCookie can never drift from setCookie's scoping attributes"

requirements-completed: [AUTH-01, AUTH-02, AUTH-04, AUTH-05]

coverage:
  - id: D1
    description: "A visitor can sign up in Chrome and land on /wallet showing 10,000.00000000 USDT"
    requirement: "AUTH-01"
    verification:
      - kind: e2e
        ref: "scripts/smoke-dev.mjs section (k) — npm run smoke"
        status: pass
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/signup > returns 201 with email and the 10,000.00000000 USDT grant"
        status: pass
    human_judgment: false
  - id: D2
    description: "The session survives a browser reload — signed in after F5 with no re-login"
    requirement: "AUTH-02"
    verification:
      - kind: e2e
        ref: "scripts/smoke-dev.mjs section (k1) — page.reload() then nav/wallet re-assertion"
        status: pass
    human_judgment: false
  - id: D3
    description: "The session cookie is httpOnly, SameSite=Lax, Path=/, 7-day max-age, and invisible to page JavaScript"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/signup > sets a session cookie with httpOnly, SameSite=Lax, Path=/, and a 7-day max-age"
        status: pass
      - kind: e2e
        ref: "scripts/smoke-dev.mjs section (k2) — document.cookie assertion"
        status: pass
    human_judgment: false
  - id: D4
    description: "A new account holds exactly one USDT balance row worth 10000.00000000, written atomically with the user row"
    requirement: "AUTH-05"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/signup > writes exactly one balances row per new account"
        status: pass
      - kind: e2e
        ref: "scripts/smoke-dev.mjs section (k3) — real SQLite read-only re-open, exactly-one-row assertion"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/me rejects an unauthenticated, garbage, or revoked-session request with 401 UNAUTHENTICATED in the D-09 envelope"
    requirement: "AUTH-04"
    verification:
      - kind: integration
        ref: "api/src/routes/auth.test.ts#GET /api/me (three 401 cases: no cookie, garbage cookie, deleted session row)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The two verified defects-in-waiting (CORS credentials, PRAGMA foreign_keys) are closed, proven in a real browser rather than only app.inject()"
    verification:
      - kind: e2e
        ref: "scripts/smoke-dev.mjs — full run, SMOKE OK"
        status: pass
      - kind: unit
        ref: "api/src/db/client.ts pragma + api/src/app.ts CORS credentials, asserted via the Task 1 <verify> grep checks"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-09-16
status: complete
---

# Phase 2 Plan 1: Sign-up Tracer Slice Summary

**Signup wires through scrypt password hashing, an opaque-token session cookie, and an atomic Drizzle+better-sqlite3 transaction to land a new visitor on /wallet with 10,000.00000000 USDT — proven end-to-end by `npm run smoke` driving real Chrome, not just `app.inject()`.**

## Performance

- **Duration:** ~45 min (approximate — not instrumented from session start; smoke alone runs ~68s per pass, run twice)
- **Started:** ~2026-09-16T09:15:00+03:00 (approximate)
- **Completed:** 2026-09-16T10:01:59+03:00
- **Tasks:** 3 (all committed)
- **Files modified:** 24

## Accomplishments

- `users`/`sessions`/`balances` SQLite schema + migration `0001_mute_redwing.sql`, with `PRAGMA foreign_keys = ON` added so the `ON DELETE CASCADE` rules actually fire
- `password.ts`: scrypt hash/verify with a self-describing `scrypt$N$r$p$salt$hash` stored string (D-14), constant-time compare derived at the stored hash's own byte length so a corrupted string rejects instead of throwing
- `session.ts`: 32-byte opaque tokens, only the SHA-256 hash persisted, `requireSession` preHandler resolving identity from the cookie alone (D-16/D-17/D-19/D-20)
- `accounts.ts`: user row + 10,000 USDT grant inserted inside one synchronous `db.transaction` callback — the single highest-risk detail in the phase, verified by a passing test asserting exactly one `balances` row per signup
- `POST /api/signup` and `GET /api/me`, `credentials: true` added to CORS so the browser will expose authenticated responses to the page
- React `AuthProvider`/`useAuth` bootstrapping auth state from `GET /api/me` on every page load, failing closed to `anonymous` on any error (D-29)
- `/signup` and `/wallet` pages, nav showing the signed-in email or Log in/Sign up links
- `npm run smoke` now drives Chrome through signup → funded wallet → reload → still signed in, asserts `document.cookie` never exposes the session token, and re-opens the real SQLite database to confirm exactly one user and one 10,000.00000000 USDT balance row

## Task Commits

Each task was committed atomically:

1. **Task 1: Sign-up API — schema, hashing, session cookie, atomic 10k grant** - `85fdec2` (feat)
2. **Task 2: Sign-up in the browser — auth bootstrap, signup form, funded wallet view** - `ffe36d4` (feat)
3. **Task 3: Prove the slice in a real browser — smoke signup and reload** - `f8f6bb5` (test)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

_Note: Task 1 carried `tdd="true"` — tests were written before their implementation and watched fail (RED) before the corresponding module was implemented (GREEN); committed once per task per the plan's commit-scope, not as separate RED/GREEN commits (this plan's frontmatter is `type: execute`, not `type: tdd`)._

## Files Created/Modified

- `api/src/lib/password.ts` — scrypt hash/verify (D-14)
- `api/src/lib/password.test.ts` — 7 tests covering round-trip, salt uniqueness, malformed/corrupted-hash rejection without throwing
- `api/src/lib/session.ts` — opaque tokens, cookie helpers, `requireSession` preHandler
- `api/src/lib/accounts.ts` — synchronous transactional signup + balance grant; also exposes `findById` (deviation, see below)
- `api/src/routes/auth.ts` — `POST /api/signup`, `GET /api/me`
- `api/src/routes/auth.test.ts` — 11 tests covering signup, cookie attributes, duplicate-email, exactly-once grant, and all three `/api/me` 401 cases
- `api/src/db/schema.ts` — `users`/`sessions`/`balances` tables
- `api/src/db/client.ts` — `PRAGMA foreign_keys = ON`
- `api/src/config.ts`, `api/.env.example` — `cookieSecure` (production-only)
- `api/src/app.ts` — `@fastify/cookie` registration, `credentials: true` CORS, auth route wiring
- `web/src/lib/api.ts` — `signup`/`fetchMe` with `credentials: "include"`
- `web/src/lib/auth.tsx` — `AuthProvider`/`useAuth`/`nextAuthState`
- `web/src/lib/auth.test.tsx` — 9 tests covering `nextAuthState`'s three branches, `SignupView`/`WalletView` rendering, and nav auth-state rendering
- `web/src/pages/Signup.tsx`, `web/src/pages/Wallet.tsx` — signup form and wallet view
- `web/src/App.tsx` — `/signup` route, `/wallet` now renders `Wallet`, nav auth state, `AuthProvider` wraps `AppRoutes`
- `web/src/App.test.tsx` — updated for `/wallet` no longer being a `ComingSoon` placeholder
- `scripts/smoke-dev.mjs` — real-browser signup/reload/cookie/database proof (section k)

## Decisions Made

- Added `AccountService.findById` beyond the plan's stated interface contract — `GET /api/me` only has `request.userId` (an id, from the session) and needs the account's email; `findByEmail` alone cannot serve that lookup.
- Kept the duplicate-email→409 mapping keyed off better-sqlite3's actual thrown error shape (`code: "SQLITE_CONSTRAINT_UNIQUE"`, message containing `users.email`), verified empirically against the installed driver rather than assumed from the research doc's approximate description.
- `auth.test.ts` → `auth.test.tsx`: the file renders JSX; esbuild does not parse JSX inside a `.ts` extension.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `AccountService.findById`**
- **Found during:** Task 1 (`GET /api/me` implementation)
- **Issue:** The plan's `<interface_contract>` fixes `AccountService` to `createWithGrant`/`findByEmail`/`listBalances` only, but `GET /api/me` resolves identity from `request.userId` (an integer id from the session), and no listed method can look up an account by id.
- **Fix:** Added `findById(userId): { id, email } | null` to `accounts.ts`, following the same synchronous read pattern as `findByEmail`.
- **Files modified:** `api/src/lib/accounts.ts`, `api/src/routes/auth.ts`
- **Verification:** `api/src/routes/auth.test.ts#GET /api/me > returns the account for a replayed valid session cookie` passes.
- **Committed in:** `85fdec2` (Task 1 commit)

**2. [Rule 3 - Blocking] Renamed `auth.test.ts` to `auth.test.tsx`**
- **Found during:** Task 2 (writing `web/src/lib/auth.test.ts` per the plan's stated filename)
- **Issue:** The test file needs to render `SignupView`, `WalletView`, and `AppRoutes` via `renderToStaticMarkup`, which requires JSX syntax. Vite's default esbuild loader for a `.ts` file does not parse JSX (`web/vite.config.ts` has no override), so the file fails to transform.
- **Fix:** Named the file `web/src/lib/auth.test.tsx` instead.
- **Files modified:** `web/src/lib/auth.test.tsx` (created directly with the correct extension)
- **Verification:** `npm --prefix web run test -- src/lib/auth.test.tsx` — 9/9 pass.
- **Committed in:** `ffe36d4` (Task 2 commit)

**3. [Rule 1 - Bug] `App.test.tsx`'s shared route-cases loop no longer matches `/wallet`**
- **Found during:** Task 2 (swapping the `/wallet` route's element from `ComingSoon` to `Wallet`, exactly as the plan instructs)
- **Issue:** The existing `ROUTE_CASES` loop asserted `"Coming soon"` text on all four routes together, including `/wallet`. Once `/wallet` renders the real `Wallet` page, that assertion fails for `/wallet` specifically — an unavoidable consequence of the plan's own instruction to swap the element, not an unrelated pre-existing issue.
- **Fix:** Split `/wallet` into its own test asserting the shell + `<h1>Wallet</h1>` without requiring "Coming soon" text; `markets`/`trade`/`orders` keep the original shared-loop assertions unchanged.
- **Files modified:** `web/src/App.test.tsx`
- **Verification:** `npm --prefix web run test -- src/App.test.tsx` — 6/6 pass.
- **Committed in:** `ffe36d4` (Task 2 commit)

**4. [Rule 1 - Bug] Expected `GET /api/me` 401 was polluting the smoke script's console-error assertion**
- **Found during:** Task 3 (`npm run smoke` first run after wiring `AuthProvider` into every page)
- **Issue:** `AuthProvider` bootstraps auth state via `GET /api/me` on every page load (D-29). For the anonymous visitor at the start of the smoke run, that request legitimately returns 401 — but Chrome's DevTools console logs any non-2xx `fetch()` response as a `"Failed to load resource..."` error message regardless of how the page's own JavaScript handles the rejection, which is unavoidable from application code. React StrictMode (already present in `web/src/main.tsx`) doubled the effect in dev, producing two such messages. This tripped the pre-existing zero-console-error assertion before section (h) even reached the new auth steps.
- **Fix:** Filtered the console-error listener to ignore messages whose failing resource URL (`message.location().url`) is `/api/me` specifically — not by message text, so an unrelated 401 anywhere else in the app still fails the run.
- **Files modified:** `scripts/smoke-dev.mjs`
- **Verification:** `npm run smoke` — `SMOKE OK`, run twice (~68s each).
- **Committed in:** `f8f6bb5` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 Rule 3/blocking-correctness gaps in the plan's own interface contract/tooling, 1 Rule 1 bug introduced by the plan's own instructed route swap and the new auth bootstrap).
**Impact on plan:** All four were necessary to make the plan's own instructions actually compile/pass; no scope creep beyond what Task 1-3's stated actions required.

## Issues Encountered

None beyond the four deviations above, all resolved inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 02-02 (login/logout/`GET /api/wallet`) and 02-03 (protected routes, nav logout) can build directly on `session.ts`/`accounts.ts`/the `AuthProvider` context value — `useAuth()`'s shape stays additive per the interface contract.
- `npm run smoke`'s new section (k) is the real-browser regression backstop for the cookie/CORS wiring; 02-02/02-03 should extend it rather than duplicate it, per D-34.
- No blockers. All plan-level `<verification>` items are green: `npm run test` (99 tests across both workspaces), `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run smoke` (SMOKE OK), and `api/src/db/migrations/0001_mute_redwing.sql` exists and is listed in `meta/_journal.json`.

---
*Phase: 02-accounts*
*Completed: 2026-09-16*

## Self-Check: PASSED

- `api/src/lib/password.ts` — FOUND
- `api/src/lib/session.ts` — FOUND
- `api/src/lib/accounts.ts` — FOUND
- `api/src/routes/auth.ts` — FOUND
- `web/src/lib/auth.tsx` — FOUND
- `web/src/pages/Signup.tsx` — FOUND
- `web/src/pages/Wallet.tsx` — FOUND
- `api/src/db/migrations/0001_mute_redwing.sql` — FOUND
- Commit `85fdec2` — FOUND in `git log --oneline --all`
- Commit `ffe36d4` — FOUND in `git log --oneline --all`
- Commit `f8f6bb5` — FOUND in `git log --oneline --all`
- All plan `<acceptance_criteria>`/`<verify>` commands re-run and passing (see Next Phase Readiness)

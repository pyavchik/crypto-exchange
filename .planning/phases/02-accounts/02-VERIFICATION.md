---
phase: 02-accounts
verified: 2026-09-16T12:40:00Z
status: passed
score: 4/4 must-haves verified
covered_files: [".planning/REQUIREMENTS.md", ".planning/phases/02-accounts/02-01-PLAN.md", ".planning/phases/02-accounts/02-01-SUMMARY.md", ".planning/phases/02-accounts/02-02-PLAN.md", ".planning/phases/02-accounts/02-02-SUMMARY.md", ".planning/phases/02-accounts/02-03-PLAN.md", ".planning/phases/02-accounts/02-03-SUMMARY.md", ".planning/phases/02-accounts/02-04-PLAN.md", ".planning/phases/02-accounts/02-04-SUMMARY.md", ".planning/phases/02-accounts/02-05-PLAN.md", ".planning/phases/02-accounts/02-05-SUMMARY.md", ".planning/phases/02-accounts/02-CONTEXT.md", ".planning/phases/02-accounts/02-UAT.md", "api/src/db/schema.ts", "api/src/lib/accounts.ts", "api/src/lib/errors.ts", "api/src/lib/password.ts", "api/src/lib/session.ts", "api/src/routes/auth.ts", "api/src/routes/wallet.ts", "qa/TEST-PLAN.md", "qa/runs/RUN-2026-09-16-auth.md", "qa/test-cases/auth.md", "scripts/smoke-dev.mjs", "web/src/App.tsx", "web/src/components/ProtectedRoute.tsx", "web/src/lib/api.ts", "web/src/lib/auth.tsx", "web/src/pages/Login.tsx", "web/src/pages/Signup.tsx", "wiki/pages/decisions/session-auth-model.md"]
covered_digest: "v1:sha256:674f093e80c0038bdc6babf35ad822b3c836a2e2c7fa6a3fe91893d0bb60903a"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Accounts Verification Report

**Phase Goal:** Users can create an account and hold a private, pre-funded demo wallet
**Verified:** 2026-09-16T12:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

**Note on ROADMAP `mode: mvp` field:** ROADMAP.md tags this phase `Mode: mvp`, but the phase goal text ("Users can create an account and hold a private, pre-funded demo wallet") is not in the required `As a [role], I want to [capability], so that [outcome].` user-story shape (`gsd_run query user-story.validate` returns `valid: false`, 4 missing slots). Since the dispatch for this verification supplied four discrete, truth-shaped ROADMAP Success Criteria to check — not a single user-story outcome clause — this report applies standard goal-backward verification against those four criteria rather than the MVP User Flow Coverage format. This is a planning-artifact inconsistency worth fixing before the next MVP-mode phase (re-run through `/gsd mvp-phase` if strict MVP-mode goal shape is wanted), not a phase-goal-achievement gap.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---------|------------|-----------|
| 1 | User can sign up, log in, refresh and stay logged in, and log out | ✓ VERIFIED | `npm run smoke` re-run live by this verifier against a real, freshly-spawned instance (real Chrome via `playwright-core`) drove the exact journey — signup → funded wallet → reload (still signed in) → logout → guarded `/wallet` redirect → re-login → funded wallet again — and printed `SMOKE OK`. Independently corroborated by `api/src/routes/auth.test.ts` (signup/login/logout describe blocks, 30 cases) and `web/src/App.test.tsx`/`ProtectedRoute.test.tsx`/`Login.test.tsx`. |
| 2 | Invalid signups (bad email, short password, duplicate email) show clear errors | ✓ VERIFIED | `api/src/routes/auth.ts` `validateCredentials()` rejects malformed email/short password with per-field messages (`VALIDATION_ERROR`, `fields.email`/`fields.password`); duplicate email maps the SQLite `UNIQUE` constraint to `409 EMAIL_TAKEN` ("That email is already registered"). Frontend renders these inline via `formErrorsFromApiError` in `web/src/lib/auth.tsx`, confirmed in `Login.tsx`/`Signup.tsx` (`field-error` elements, `noValidate` forms). Covered by `auth.test.ts`'s "per-field validation (D-27)" describe block (7 tests) and QA `TC-AUTH-006/007/008/011/012` (all recorded Pass in the executed run). |
| 3 | A new user sees exactly 10,000 USDT; user A cannot fetch user B's data via the API | ✓ VERIFIED | `api/src/lib/accounts.ts#createWithGrant` inserts the user row and a single `balances` row (`STARTING_USDT = "10000.00000000"`) inside one synchronous `db.transaction`, backed by a `UNIQUE(user_id, asset)` index (`schema.ts`) — verified by `accounts.test.ts`'s concurrent-duplicate-signup race test (fires two unawaited signups, asserts exactly one 201/one 409, one user row, one balance row) and reproduced live by the smoke run's direct SQLite reads before and after a logout/login round trip. Isolation: `request.userId` is the *only* identity source (`session.ts#createRequireSession`); no route in `api/src/routes/{auth,wallet}.ts` accepts an id from path/query/body (grep-confirmed — only `/api/signup`, `/api/login`, `/api/logout`, `/api/me`, `/api/wallet` exist, none parameterized). Cookie-swap isolation is directly tested in `auth.test.ts` ("AUTH-04: cookie-swap isolation") and `wallet.test.ts` ("AUTH-04: two live accounts..."), and re-proven live against a running server in QA `TC-AUTH-019`. |
| 4 | Auth test cases are written, executed, and results recorded | ✓ VERIFIED | `qa/test-cases/auth.md` — 24 `TC-AUTH-NNN` cases, each traced to an `AUTH-0*` requirement, spanning positive/negative/boundary/security/exactly-once types. `qa/runs/RUN-2026-09-16-auth.md` — executed run report, 24/24 pass, 0 bugs, against a dedicated temp instance (ports 58611/58612) at commit `a229ad9`; report documents environment setup, per-case evidence, and even a self-found QA-harness bug (fixed, not filed against the app). Spot-checked 5+ of the 24 cases (TC-AUTH-008, 009/010, 019, 022, 023) against the actual source and test suite — the cited automated analogs and code paths exist and do what the QA doc claims. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `api/src/lib/password.ts` | scrypt hash/verify, self-describing string (D-14) | ✓ VERIFIED | `hashPassword`/`verifyPassword` exported, 71 lines, `scrypt$N$r$p$salt$hash` format, `timingSafeEqual` compare, derives at `expected.length` not a hardcoded keylen. |
| `api/src/lib/session.ts` | opaque tokens, SHA-256 stored hash, cookie helpers, `requireSession` (D-16/17/19/20) | ✓ VERIFIED | All exports present; 7-day `SESSION_TTL_MS`; lazy expiry delete on `validate()`; `setSessionCookie`/`clearSessionCookie` share one `cookieOptions()` helper (prevents the mismatched-scope clear bug). |
| `api/src/lib/accounts.ts` | transactional user + 10,000 USDT grant (D-23/24/25) | ✓ VERIFIED | `STARTING_USDT`, `createAccountService` exported; user insert + balance insert inside one synchronous `db.transaction` callback. |
| `api/src/routes/auth.ts` | `POST /api/signup`, `GET /api/me`, `POST /api/login`, `POST /api/logout` | ✓ VERIFIED | All four routes present, all through `AppError`/D-09 envelope, `DUMMY_PASSWORD_HASH` timing-safety pattern for login. |
| `api/src/routes/wallet.ts` | session-scoped `GET /api/wallet` | ✓ VERIFIED | 53 lines; identity only from `request.userId`; no path/query param. |
| `api/src/db/schema.ts` | `users`, `sessions`, `balances` tables | ✓ VERIFIED | `users_email_idx` (unique), `sessions_token_hash_idx` (unique) + `sessions_user_id_idx`, `balances_user_asset_idx` (unique); `onDelete: "cascade"` FKs. |
| `web/src/components/ProtectedRoute.tsx` | route guard, loading/redirect/pass-through (D-28/29) | ✓ VERIFIED | 39 lines, three branches exactly as documented; wraps `/wallet` and `/orders` in `App.tsx`. |
| `web/src/lib/auth.tsx` | auth context with login/logout actions | ✓ VERIFIED | `AuthProvider`, `useAuth`, `nextAuthState`, `performLogin`, `performLogout`, `formErrorsFromApiError` all present and used. |
| `qa/test-cases/auth.md` | 24 TC-AUTH-NNN cases, traceable to AUTH-* | ✓ VERIFIED | Contains `TC-AUTH-001`..`TC-AUTH-024`; 61 lines; every row carries a `Req` column value. |
| `qa/runs/RUN-2026-09-16-auth.md` | executed run report | ✓ VERIFIED | 24/24 pass, per-case evidence, environment setup documented, exit-criteria checklist (one item honestly left unchecked — see Notes). |
| `wiki/pages/decisions/session-auth-model.md` | ADR for the session/auth model | ✓ VERIFIED | 90 lines; catalogued in `wiki/index.md`, appended to `wiki/log.md`, mirrored in `.planning/PROJECT.md` Key Decisions. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `api/src/routes/wallet.ts` | `api/src/lib/session.ts` | `requireSession` preHandler sets `request.userId`; handler queries by that id alone | ✓ WIRED | Confirmed by direct read — `const userId = Number(request.userId);` is the only source used. |
| `api/src/routes/auth.ts` | `api/src/lib/errors.ts` | routes throw `AppError`; `registerErrorHandlers` renders the D-09 envelope | ✓ WIRED | `AppError` thrown at every failure path; `errors.ts#errorHandler` maps `error.fields` onto the envelope. |
| `web/src/components/ProtectedRoute.tsx` | `web/src/lib/auth.tsx` | `useAuth()` state decides loading/redirect/children | ✓ WIRED | Confirmed in source. |
| `web/src/App.tsx` | `web/src/components/ProtectedRoute.tsx` | wallet/orders routes wrapped in the guard | ✓ WIRED | `<ProtectedRoute><Wallet /></ProtectedRoute>` and same for orders. |
| `wiki/index.md` | `wiki/pages/decisions/session-auth-model.md` | catalogued under Decisions | ✓ WIRED | `grep` confirms the link line in `wiki/index.md`, `wiki/log.md`, and `.planning/PROJECT.md`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full real-browser auth journey (signup, wallet grant, reload persistence, logout, guarded redirect, re-login, cookie httpOnly, exactly-once grant) | `npm run smoke` (re-executed live by this verifier, not taken from SUMMARY narration) | `browser: Chrome 152.0.7977.84` / `SMOKE OK` | ✓ PASS |
| Full workspace unit/integration suite | `npm test` | `9 test files / 87 tests passed (api)`, `8 test files / 70 tests passed (web)` | ✓ PASS |
| Type safety | `npm run typecheck` | clean, no output | ✓ PASS |
| Lint | `npm run lint` | clean, exit 0 | ✓ PASS |
| Formatting | `npm run format:check` | "All matched files use Prettier code style!" | ✓ PASS |
| Wiki structural lint | `node scripts/wiki-lint.mjs --base afc60aa` | `pages=18 orphans=0 broken_links=0 duplicates=0 unverified=5 errors=0` | ✓ PASS |
| Debt-marker scan (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) on all phase-touched auth files | `grep -n -E "..." <files>` | no matches in any of the 10 sampled core files | ✓ PASS |
| No id-parameterized route exists (structural AUTH-04 claim) | `grep -rn "app\.\(get\|post\|put\|delete\|patch\)" api/src/routes/ api/src/app.ts` | only `/api/signup`, `/api/me`, `/api/login`, `/api/logout`, `/api/wallet`, `/health` — none parameterized | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 02-01, 02-02, 02-03 | Sign up with email/password, validation, duplicate rejection | ✓ SATISFIED | `POST /api/signup`, `validateCredentials`, `EMAIL_TAKEN`, Signup.tsx inline errors. |
| AUTH-02 | 02-01, 02-02, 02-03 | Log in, stay logged in across refresh (httpOnly cookie) | ✓ SATISFIED | `POST /api/login`, 7-day cookie, smoke test reload proof. |
| AUTH-03 | 02-02, 02-03, 02-04 | Log out from any page | ✓ SATISFIED | `POST /api/logout` (idempotent), nav `Log out` control in `AppLayout`, smoke test (l). |
| AUTH-04 | 02-01, 02-02 | Cross-user isolation enforced server-side | ✓ SATISFIED | `request.userId`-only identity, cookie-swap isolation tests, no id-bearing route exists. |
| AUTH-05 | 02-01, 02-02, 02-04 | Exactly-once 10,000 USDT grant | ✓ SATISFIED | Atomic transaction + UNIQUE constraint, concurrent-race test, smoke test DB checks. |
| QA-02 | 02-05 | Manual auth test cases, executed, traceable | ✓ SATISFIED | `qa/test-cases/auth.md` (24 cases) + `qa/runs/RUN-2026-09-16-auth.md` (24/24 pass). |

No orphaned requirements — REQUIREMENTS.md's Phase 2 traceability table (AUTH-01..05, QA-02) matches exactly what the five plans collectively declared and delivered.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any of the phase's core auth files (`password.ts`, `session.ts`, `accounts.ts`, `auth.ts`, `wallet.ts`, `auth.tsx`, `ProtectedRoute.tsx`, `Login.tsx`, `Signup.tsx`, `App.tsx`). No stub handlers, no hardcoded-empty data flowing to render, no `console.log`-only implementations.

**ℹ️ Info — unpushed branch / CI not confirmed on GitHub for this exact commit.** `git status` confirms the local `main` branch is 25 commits ahead of `origin/main`; nothing in this phase has been pushed. The QA run report itself already discloses this transparently (`qa/runs/RUN-2026-09-16-auth.md` Exit Criteria: `- [ ] CI is green on the commit this run was executed against`, with a matching Observations entry). None of ROADMAP's 4 Success Criteria for this phase require CI-green-on-GitHub, so this is not treated as a blocking gap against the phase goal — but it is a genuine, outstanding action item before the work can be considered "shipped": run `git push` (or the project's `/gsd-ship` flow) so GitHub Actions actually runs against this code, then re-check that exit-criteria box.

### Deferred Items

None. No gaps were found that needed deferral to a later phase — all four ROADMAP success criteria are met now, by this phase's own artifacts.

### Human Verification Required

None. Every observable truth had either a live, verifier-executed behavioral proof (`npm run smoke` re-run fresh, real Chrome, real SQLite reads) or a passing, content-reviewed automated test exercising the exact state transition/invariant claimed (session expiry boundary, cookie-swap isolation, concurrent-signup race, idempotent logout). No visual-only, "feel", or external-service judgment calls remain open for this phase's scope.

### Gaps Summary

No gaps. All 4 ROADMAP Success Criteria are verified against running/tested code, not SUMMARY narration:
1. The full signup → login → refresh-persistence → logout journey was re-executed live by this verifier via `npm run smoke` against a freshly spawned instance, independent of anything claimed in the SUMMARY files.
2. Invalid-signup error handling was verified in both the server validation code and the client-side field-error rendering, with matching automated tests.
3. The exactly-once 10,000 USDT grant and cross-user isolation were verified structurally (atomic transaction, unique constraints, cookie-only identity, no id-bearing routes) and behaviorally (concurrent-race test, cookie-swap tests, live DB reads during the smoke run).
4. The QA deliverable (24 written + 24 executed test cases with recorded results) exists, is internally consistent with the actual code and test suite (5+ cases spot-checked against real source), and its self-reported gaps (QA-harness bug found and fixed, one test case's prose corrected, CI-not-pushed) are the marks of a genuine, honestly-reported execution rather than fabricated narration.

The one open item — the local branch not yet pushed to `origin/main`, so GitHub Actions has not run — is disclosed here for visibility and is not a phase-goal blocker; it is a pre-ship action item, not a gap in what this phase built.

---

_Verified: 2026-09-16T12:05:00Z_
_Verifier: Claude (gsd-verifier)_

## Re-validation after post-verification fixes (2026-09-16T12:40Z, orchestrator)

Commits landing after the original verification (`7e2d3da`, `a141a75`, `e6500bc`, `493ba19`, `ea1ac0f`) were the 02-REVIEW.md remediation, not new feature work: CR-01 (`verifyPassword` failed OPEN on a malformed stored hash), WR-01 (`AbortError` relabelled as `INVALID_RESPONSE_BODY` in the shared `parseJsonBody` helper), WR-02 (smoke script leaking a temp dir holding a real password hash), plus the RCA write-up. IN-01 remains open by decision.

All four success criteria were re-checked against the post-fix tree; none of the findings above changed the phase's behavioral contract, and no criterion's evidence depended on the buggy paths:

- `npm test` exit 0 — 93 api + 72 web (up from 87 + 70; the delta is the new CR-01 and WR-01 regression tests)
- `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- `npm run smoke` prints `SMOKE OK` (real Chrome 152, full signup -> wallet -> reload -> logout -> guarded route -> re-login journey), and the temp-dir count was unchanged across the run (32 before, 32 after), confirming the WR-02 leak fix
- CR-01 independently re-tested by the orchestrator against the fixed module: the reviewer's exact repro plus empty / truncated / odd-length-hex hash and non-hex salt all return `false`, while a correct password still returns `true` and a wrong one `false`

Status therefore remains `passed`, 4/4.

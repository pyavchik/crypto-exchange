---
phase: 02-accounts
plan: 04
subsystem: auth
tags: [playwright-core, chrome, vitest, scrypt, wiki, adr]

requires:
  - phase: 02-accounts
    provides: 02-01's signup/reload real-browser smoke section, 02-02's login/logout/GET /api/wallet HTTP surface, 02-03's Login page, ProtectedRoute guard, and nav Log out control
provides:
  - npm run smoke real-browser coverage of the full account journey — signup, funded wallet, reload, logout, blocked /wallet, login, funded wallet again, session-unreadable-from-JS, exactly-once-grant across the round trip
  - A fixed flaky password.test.ts assertion (byte-length-mismatch case)
  - wiki/pages/decisions/session-auth-model.md — the phase's durable ADR, catalogued and mirrored per SCHEMA.md
affects: [02-05 (manual QA test cases and executed run report trace to this real-browser proof and the ADR's recorded trade-offs), Phase 3+ (any id-bearing route added later must revisit D-22's isolation note)]

actuals:
  tokens: 4250
  tasks: 2
  commits: 2
  plan_head_before: c0dbda550723174f0e2303a2d393075f23c1ff0b

tech-stack:
  added: []
  patterns:
    - "Guard-verification via a full page.goto rather than a client-side NavLink click, to prove a route guard from a cold mount and avoid racing the app's own async post-logout navigate() call"

key-files:
  created:
    - wiki/pages/decisions/session-auth-model.md
  modified:
    - scripts/smoke-dev.mjs
    - api/src/lib/password.test.ts
    - wiki/index.md
    - wiki/log.md
    - .planning/PROJECT.md

key-decisions:
  - "Guard check for /wallet-after-logout uses page.goto (full navigation) rather than clicking the Wallet nav link — a client-side click raced handleLogout's own async navigate(\"/login\") call and landed on /wallet in roughly 1 of 3 runs; a full page load sidesteps any pending in-app navigation entirely and also proves the guard survives a cold mount, not just a client-side route change"
  - "Fixed password.test.ts's byte-length-mismatch case to append four fixed hex bytes instead of one — scrypt's PBKDF2-style extraction reproduces the original derived bytes exactly when re-derived at a larger keylen, so a single appended byte had a real 1-in-256 chance of coincidentally matching the freshly derived extra byte and passing when it should fail"

patterns-established:
  - "Real-browser guard verification via full navigation (page.goto), not a same-page client-side link click, whenever the check must be immune to a race with the app's own pending async navigation"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

coverage:
  - id: D1
    description: "npm run smoke drives a real browser through the whole journey — signup, funded wallet, reload, logout, blocked /wallet, login, funded wallet again — and exits SMOKE OK"
    requirement: "AUTH-02"
    verification:
      - kind: e2e
        ref: "scripts/smoke-dev.mjs sections (l)-(q) — npm run smoke, run 4 consecutive times after the race-condition fix"
        status: pass
    human_judgment: false
  - id: D2
    description: "After logging out in the browser, visiting /wallet lands on /login instead of showing wallet contents"
    requirement: "AUTH-03"
    verification:
      - kind: e2e
        ref: "scripts/smoke-dev.mjs section (m) — page.goto(/wallet) after logout asserts pathname === /login and body excludes the balance"
        status: pass
    human_judgment: false
  - id: D3
    description: "The whole repository is green: lint, format, typecheck, unit tests and the smoke run"
    requirement: "AUTH-01"
    verification:
      - kind: other
        ref: "npm run lint && npm run format:check && npm run typecheck && npm test && npm run smoke"
        status: pass
    human_judgment: false
  - id: D4
    description: "The session-authentication decisions are recorded as a wiki decision page, catalogued in the index, appended to the log, and mirrored one line into PROJECT.md"
    verification:
      - kind: other
        ref: "node scripts/wiki-lint.mjs --base afc60aa && grep -q session-auth-model wiki/index.md && grep -q session-auth-model .planning/PROJECT.md && tail -n 2 wiki/log.md | grep -q LINT"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-09-16
status: complete
---

# Phase 2 Plan 4: Full Browser Auth Journey, Green Repo, and the Session-Auth ADR Summary

**`npm run smoke` now drives real Chrome through the complete account lifecycle — signup, funded wallet, reload, logout, a blocked /wallet, login, funded wallet again, and a session-token-invisible-to-JS check — while the repository sits fully green and the phase's authentication decisions are recorded as `wiki/pages/decisions/session-auth-model.md`, catalogued and mirrored per project convention.**

## Performance

- **Duration:** ~40 min
- **Started:** ~2026-09-16T10:31:00+03:00 (approximate — right after 02-03's docs commit)
- **Completed:** 2026-09-16T10:55:13+03:00
- **Tasks:** 2 (both committed)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- `scripts/smoke-dev.mjs` sections (l)-(q): logs out through the nav control and waits for the
  signed-out nav state; navigates to `/wallet` via a full page load and asserts the guard lands on
  `/login` (both URL and body content, so a guard rendering the wrong markup at the wrong URL still
  fails); logs back in through `/login` with the same credentials and asserts the nav email and the
  `10000.00000000` USDT balance reappear; asserts `document.cookie` still never exposes a `session`
  entry after the second login; re-opens the temp SQLite database read-only and confirms exactly one
  user row and one `10000.00000000` balance row survive the full logout/login round trip (AUTH-05
  never re-credits); re-runs the page-error/console-error assertion for this section
- Fixed a genuinely flaky assertion in `password.test.ts` discovered while running the full local
  gate — see Deviations
- `wiki/pages/decisions/session-auth-model.md`: the phase's ADR covering password hashing (D-14),
  opaque cookie-only sessions (D-16..D-20, D-22), the atomic balance grant and its
  synchronous-callback trap (D-24/D-25), the login/signup error asymmetry (D-26), the two Phase 1
  wiring gaps this phase closed (CORS credentials, `PRAGMA foreign_keys`), the web workspace's
  test-scope decision (lineage from `[[health-poller-illegal-invocation]]`), and the deferred
  rate-limiting gap (D-31) — cross-linked to `[[foundation-skeleton-conventions]]`, `[[tech-stack]]`
  and `[[health-poller-illegal-invocation]]`
- `wiki/index.md` catalogues the new page under Decisions; `wiki/log.md` gained exactly one
  `DECISION` line and one `LINT` line (no past lines touched); `.planning/PROJECT.md`'s Key
  Decisions table gained one mirrored row
- Full local gate green: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`
  (87 API + 70 web tests), and `node scripts/wiki-lint.mjs --base afc60aa` (18 pages, 0 orphans, 0
  broken links, 0 duplicates, 5 pre-existing unverified mentions, 0 contradictions on manual read)

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete the real-browser auth path in the smoke run** - `7b25923` (test)
2. **Task 2: Take the repository green and record the phase's decisions** - `eea39a3` (docs)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `scripts/smoke-dev.mjs` — sections (l)-(q): logout, guarded-route redirect, re-login, session
  invisibility, exactly-once-grant, final error assertion
- `api/src/lib/password.test.ts` — byte-length-mismatch case widened from 1 to 4 fixed appended
  bytes to eliminate a real coincidental-match probability
- `wiki/pages/decisions/session-auth-model.md` — the phase's ADR (new)
- `wiki/index.md` — Decisions list gained one entry
- `wiki/log.md` — one `DECISION` line, one `LINT` line appended
- `.planning/PROJECT.md` — one mirrored Key Decisions row

## Decisions Made

- The `/wallet`-after-logout guard check uses `page.goto` (a full page load) instead of clicking
  the "Wallet" nav link. A client-side click raced `handleLogout`'s own async `navigate("/login")`
  call — both fire from independent promise chains — and landed on `/wallet` instead of `/login` in
  roughly 1 of 3 runs during development. A full navigation sidesteps any in-flight app navigation
  entirely and additionally proves the guard survives a cold mount (a fresh `GET /api/me` bootstrap
  against a truly revoked session), which is arguably the more realistic threat scenario (a user
  pasting the `/wallet` URL directly) anyway.
- `password.test.ts`'s byte-length-mismatch case widened its appended corruption from one fixed hex
  byte to four. scrypt's final extraction step is PBKDF2-style (built from independent hash-length
  blocks), so re-deriving at a larger `keylen` with the same password/salt/N/r/p reproduces the
  original derived bytes exactly and only appends new ones — a single fixed appended byte therefore
  had a real 1-in-256 chance of coincidentally matching the freshly derived extra byte, which is
  exactly what was observed (a genuine, not test-harness, flake). Four bytes drops the coincidental
  match probability to 1-in-2^32.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Flaky guard-verification race in the smoke script's own logout → /wallet check**
- **Found during:** Task 1, while stabilizing the new smoke sections (observed non-deterministically
  across repeated `npm run smoke` runs, not on the first run)
- **Issue:** Clicking the "Wallet" nav link immediately after the nav showed the signed-out state
  raced `AuthNav`'s `handleLogout`, whose `navigate("/login")` call is a separate async step fired
  after the auth-state flip, not synchronous with it. Depending on scheduling, the test's own click
  to `/wallet` could resolve before that pending navigation settled, non-deterministically leaving
  the page on `/wallet` instead of confirming the guard's redirect.
- **Fix:** Replaced the nav-link click with `page.goto(.../wallet)`, a full page navigation that is
  immune to any pending in-app `navigate()` call and additionally forces a fresh `GET /api/me`
  bootstrap against the now-revoked session.
- **Files modified:** `scripts/smoke-dev.mjs`
- **Verification:** `npm run smoke` run 4 consecutive times after the fix, all `SMOKE OK` (prior to
  the fix, 1 of 3 consecutive runs failed with exactly this symptom).
- **Committed in:** `7b25923` (Task 1 commit)

**2. [Rule 1 - Bug] Flaky byte-length-mismatch assertion in `password.test.ts`**
- **Found during:** Task 2, first `npm test` pass of the full local gate
- **Issue:** `verifyPassword`'s corrupted-hash test appended one fixed hex byte ("ab") to a valid
  stored hash to force a byte-length mismatch. Because scrypt's output extraction reproduces the
  original derived bytes exactly when re-derived at a larger `keylen` with the same inputs, the
  freshly derived extra byte had a genuine 1-in-256 chance of equaling the fixed appended byte,
  which would make the corrupted hash's re-derivation match and the assertion fail. This is exactly
  what happened on this run's first `npm test` pass (`expected true to be false`).
- **Fix:** Widened the appended corruption from one fixed byte to four, dropping the coincidental
  match probability to 1-in-2^32.
- **Files modified:** `api/src/lib/password.test.ts`
- **Verification:** `npx vitest run src/lib/password.test.ts` run 5 consecutive times, all 7/7
  passing; full `npm test` re-run green afterward (87 API + 70 web).
- **Committed in:** `eea39a3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — genuine flaky-test bugs surfaced by running the
plan's own verification steps repeatedly, not pre-existing issues out of this plan's scope).
**Impact on plan:** Both fixes were necessary for the plan's own `<verify>` commands to pass
deterministically, as the plan's own instructions require ("fix anything it surfaces before writing
documentation"). No scope creep beyond what Task 1/2's stated verification requirements demanded.

## Issues Encountered

None beyond the two deviations above, all resolved inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 (Accounts) is functionally complete: sign-up, login, logout, session persistence across
  reload, cross-user isolation, the one-time 10,000 USDT grant, and the full journey are all proven
  in both `app.inject()` tests and a real browser.
- 02-05 (manual QA test cases and the executed run report) can trace directly to this plan's
  real-browser proof and to `wiki/pages/decisions/session-auth-model.md`'s recorded trade-offs
  (the login/signup error asymmetry, the deferred rate-limiting gap) when writing negative and
  security/isolation test cases.
- `[[session-auth-model]]`'s D-22 note (no id-bearing endpoint exists yet, so the IDOR proof is a
  cookie swap) is a standing flag for Phase 4-5 planning: any new route that accepts an id must add
  a real object-reference test case at that point.
- No blockers. All plan-level `<verification>` items are green: `npm run smoke` (SMOKE OK, run
  repeatedly), `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` (87 API + 70
  web), `node scripts/wiki-lint.mjs --base afc60aa` (0 orphans, 0 broken links), and the index/
  PROJECT.md/log.md grep checks.

---
*Phase: 02-accounts*
*Completed: 2026-09-16*

## Self-Check: PASSED

- `scripts/smoke-dev.mjs` (sections l-q) — FOUND
- `wiki/pages/decisions/session-auth-model.md` — FOUND
- `wiki/index.md` (session-auth-model entry) — FOUND
- `wiki/log.md` (DECISION + LINT lines appended) — FOUND
- `.planning/PROJECT.md` (session-auth-model row) — FOUND
- Commit `7b25923` — FOUND in `git log --oneline --all`
- Commit `eea39a3` — FOUND in `git log --oneline --all`
- All plan `<verification>` commands re-run and passing: `npm run smoke` (SMOKE OK), `npm run lint`,
  `npm run format:check`, `npm run typecheck`, `npm test` (87 API + 70 web), `node
  scripts/wiki-lint.mjs --base afc60aa` (0 orphans, 0 broken links, 0 contradictions)

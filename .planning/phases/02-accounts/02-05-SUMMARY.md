---
phase: 02-accounts
plan: 05
subsystem: testing
tags: [qa, manual-testing, playwright-core, auth, better-sqlite3]

requires:
  - phase: 02-accounts
    provides: 02-01's signup/session/grant endpoints, 02-02's login/logout/wallet HTTP surface and fixed error strings, 02-03's Login page/ProtectedRoute/nav logout, 02-04's full-journey smoke coverage and session-auth-model ADR
provides:
  - qa/test-cases/auth.md — 24 TC-AUTH-NNN cases tracing to AUTH-01..05, spanning positive, negative, boundary, security/isolation, and exactly-once-crediting types
  - qa/runs/RUN-2026-09-16-auth.md — an executed run report (24/24 pass, 0 bugs) against a real temp instance of the app at commit a229ad9
  - qa/TEST-PLAN.md updated with R-15 (deferred login rate limiting, D-31, owned gap), a Phase 2 automated-checks traceability table, extended R-09/R-10 test-focus cells, the D-26 error-asymmetry observation, and flipped deliverable status
  - qa/README.md pointing at the delivered qa/test-cases/auth.md and qa/runs/ files instead of describing them as planned
affects: [Phase 3+ (any id-bearing route must revisit D-22/TC-AUTH-022's isolation note), Phase 6 hardening (must add rate-limit test cases alongside implementing R-15)]

actuals:
  tokens: 9700
  tasks: 3
  commits: 3
  plan_head_before: 71ed1b3b54069062967d91b0208a8ac5efe6637e

tech-stack:
  added: []
  patterns:
    - "Independent per-client cookie-jar objects (not a shared HTTP client) in a small fetch-based Node script, so a cookie-swap isolation case is a genuine two-session test rather than a single shared jar accidentally proving nothing"
    - "Direct SQLite row edits (sessions.expires_at) against the temp DB file to force the session-expiry boundary deterministically, mirroring the injected-clock unit test but exercising the real running server end-to-end"

key-files:
  created:
    - qa/test-cases/auth.md
    - qa/runs/RUN-2026-09-16-auth.md
  modified:
    - qa/TEST-PLAN.md
    - qa/README.md

key-decisions:
  - "Executed all 24 cases against one dedicated temp stack (ports 58611/58612, scratch SQLite + log file, GIT_COMMIT=a229ad9) — never the developer's own npm run dev ports — following scripts/smoke-dev.mjs's own port-allocation and env-var pattern exactly, per the plan's environment_notes"
  - "TC-AUTH-008's written expectation (duplicate-email message as a 'form-level error') was corrected in place to describe the app's actual behavior (rendered under the email field, per web/src/lib/auth.tsx's formErrorsFromApiError) once execution surfaced the mismatch — the app's behavior was correct throughout; only the test case's own prose was wrong"
  - "A bug in the QA harness itself (an unconditional Content-Type: application/json header on bodyless POST /api/logout calls, which Fastify correctly rejected with 400) was fixed inline and documented in the run report's Observations rather than filed as a qa/bugs/ entry — the running application's behavior was correct the whole time; only the test script needed a fix"

patterns-established:
  - "Run-report evidence citing both a manual execution AND the pre-existing automated analog (test file/describe-block) for the same behavior, so a reviewer can cross-check a passing manual result against a passing automated one for the identical claim"

requirements-completed: [QA-02]

coverage:
  - id: D1
    description: "24 TC-AUTH-NNN test cases written in the project's template, each traced to an AUTH-01..05 requirement, spanning positive/negative/boundary/security types plus the exactly-once grant"
    requirement: "QA-02"
    verification:
      - kind: other
        ref: "Task 1 <verify> — template header present, >=22 TC-AUTH-* rows, every AUTH-0[1-5] traced, every case type (positive/negative/boundary/security) present"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 24 cases executed against a real running instance of the app (commit a229ad9); results recorded in qa/runs/RUN-2026-09-16-auth.md — 24/24 pass, 0 bugs found, no unfilled placeholders"
    requirement: "QA-02"
    verification:
      - kind: other
        ref: "Task 2 <verify> — results-table row count equals case count, no Not-run/placeholder rows remain, build commit field populated with a real short SHA"
        status: pass
    human_judgment: true
    rationale: "Task 2's <verify> carries a <human-check> ('confirm the run report reads as a real execution record ... no session cookie, password or API key appears anywhere') — deferred to end-of-phase UAT harvesting per workflow.human_verify_mode=end-of-phase, not executed by this executor."
  - id: D3
    description: "qa/TEST-PLAN.md and qa/README.md updated to reflect Phase 2's delivered auth QA artifacts and the deferred login-rate-limiting gap (R-15/D-31) as an owned, documented risk rather than an oversight"
    requirement: "QA-02"
    verification:
      - kind: other
        ref: "Task 3 <verify> — risk-row count >=15, 'rate limit' present, README links qa/test-cases/auth.md, TEST-PLAN.md carries TC-AUTH- references, the Auth deliverable row flips to Done, all 13 top-level headings intact"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-16
status: complete
---

# Phase 2 Plan 5: Auth QA — Written, Executed, and Folded Into the Test Plan Summary

**24 `TC-AUTH-NNN` test cases were written and then actually run against a live temp instance of the app (signup/login/logout/session/isolation/exactly-once-grant) via curl/fetch with independent cookie jars and Chrome driven through `playwright-core` — 24/24 pass, zero defects — with the results recorded in an executed run report and folded into `qa/TEST-PLAN.md` as delivered, owned-risk-documented Phase 2 QA.**

## Performance

- **Duration:** ~20 min (approximate — not instrumented from session start)
- **Started:** ~2026-09-16T08:00:00Z (approximate — right after 02-04's docs commit)
- **Completed:** 2026-09-16T08:11:27Z
- **Tasks:** 3 (all committed)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `qa/test-cases/auth.md`: 24 `TC-AUTH-001`..`TC-AUTH-024` cases in the project's template
  (8-column table, usage notes preserved), covering signup/login/session-persistence/logout
  (positive), malformed input/duplicate email/account-enumeration (negative), the 8-character
  password and email-normalization boundaries plus the 7-day session-expiry boundary (boundary),
  cookie attributes/JS-invisibility/protected-route redirect/unauthenticated-401/cookie-swap
  isolation/dead-cookie-after-logout/idempotent-logout/the no-id-bearing-route structural
  observation (security), and the exactly-once 10,000 USDT grant under a concurrent duplicate
  signup and across a logout/login round trip
- Executed every case against a dedicated temp instance (ports 58611 API / 58612 web, scratch
  SQLite + log file, `GIT_COMMIT=a229ad9`), confirming entry criteria first: `npm run lint`,
  `npm run typecheck`, `npm test` (87 API + 70 web), and `npm run smoke` all green on commit
  `a229ad9` before any case ran. Browser-facing cases were driven through installed Google Chrome
  via `playwright-core` (`channel: "chrome"`), matching `scripts/smoke-dev.mjs`'s own mechanism;
  API-facing cases used direct `curl`/`fetch` calls, keeping each "client"'s cookie independent so
  the cookie-swap case (TC-AUTH-019) genuinely proves isolation rather than sharing one jar
- The session-expiry boundary (TC-AUTH-014) was proven against the real server by editing the
  `sessions.expires_at` column directly in the temp SQLite file, then replaying the (now
  server-side-expired) cookie — not inferred from the unit test's injected clock
- `qa/runs/RUN-2026-09-16-auth.md`: the executed run report — 24/24 Pass, 0 Fail/Blocked/Not-run,
  0 bugs raised, every result citing the actual status/code/message or DOM state observed plus a
  pointer to the pre-existing automated analog for the same behavior; the exit-criteria checklist
  is honestly partial (CI-green is unchecked because the branch has not been pushed yet, recorded
  as an Observation rather than silently checked)
- `qa/TEST-PLAN.md`: added risk `R-15` for the deferred login-rate-limiting gap (D-31) with its
  trading impact, likelihood/impact, test focus and Phase 6 owner; extended `R-09`/`R-10`'s test
  focus cells with the Phase 2 case ids that now cover them; added a "Phase 2 automated checks"
  traceability table mapping every `AUTH-01..05` requirement to its test files and manual cases;
  recorded the `D-26` login/signup error-asymmetry as a deliberate trade-off, not an
  inconsistency; flipped the auth test-cases and run-report deliverable rows to Done
- `qa/README.md`: the "Planned Folders" section now links the delivered `qa/test-cases/auth.md`
  and `qa/runs/RUN-2026-09-16-auth.md` instead of describing both folders as not-yet-existing

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the auth test cases** - `a229ad9` (docs)
2. **Task 2: Execute the cases and file the run report** - `7e5e177` (test)
3. **Task 3: Fold Phase 2 into the test plan** - `e576073` (docs)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `qa/test-cases/auth.md` — 24 `TC-AUTH-NNN` cases, template-conformant, every AUTH requirement traced
- `qa/runs/RUN-2026-09-16-auth.md` — the executed run report, one row per case, real evidence
- `qa/TEST-PLAN.md` — risk register (`R-15` + extended `R-09`/`R-10`), Phase 2 traceability table, D-26 observation, deliverable status flip
- `qa/README.md` — "Planned Folders" section updated with links to the delivered artifacts

## Decisions Made

- Executed against one dedicated temp stack for the whole task rather than per-case instances —
  matches `scripts/smoke-dev.mjs`'s own pattern and keeps the build-commit-under-test constant
  (`a229ad9`) across every case in the run report, which the run report's own consistency check
  (`grep -qE '^\| \*\*Build commit\*\* \| [0-9a-f]{7}'`) and the honesty of a single "build under
  test" field both depend on.
- Corrected `TC-AUTH-008`'s written expectation in place (field-level, not form-level, rendering
  of the duplicate-email message) the moment browser execution surfaced the mismatch, rather than
  leaving an inaccurate case description standing next to a passing result — the app's behavior
  was correct throughout; only the case's own prose needed the fix.
- Documented the QA harness's own `Content-Type` bug (found while executing `TC-AUTH-020`/`021`)
  in the run report's Observations rather than filing it as `qa/bugs/`, since the running
  application correctly rejected the malformed request the harness sent it — the defect was in
  the test tooling, not the product.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] QA execution script sent an unconditional `Content-Type: application/json` header on bodyless `POST /api/logout` calls**
- **Found during:** Task 2, first pass of the API-execution helper script (`TC-AUTH-020`/`021`/`024`)
- **Issue:** The script's `call()` helper always set `Content-Type: application/json`, even when no
  body was sent. Fastify's body-content-type parser correctly rejected the empty-but-declared-JSON
  body with `400 FST_ERR_CTP_EMPTY_JSON_BODY` before the logout handler ever ran — this is a bug in
  the QA harness script, not in the application under test, but it meant the first pass never
  actually exercised the logout/replay/idempotency behavior those three cases are supposed to prove.
- **Fix:** Only set `Content-Type` when a request body is actually being sent.
- **Files modified:** the QA execution script (scratch tooling under the session's temp directory,
  not committed to the repository — it exists only to drive the manual run, per the plan's
  environment notes; its logic and result are fully described in the run report's Observations)
- **Verification:** re-ran `TC-AUTH-020`, `TC-AUTH-021`, `TC-AUTH-024` after the fix — all three now
  correctly exercise a real `200 { ok: true }` logout, a dead-cookie replay returning `401`, and
  idempotent double-logout, and pass.
- **Committed in:** not applicable — the fix lives in scratch tooling, not a repository file; the
  finding and its resolution are recorded in `qa/runs/RUN-2026-09-16-auth.md`'s Observations
  section (this is documentation of test-process work, not a code change requiring its own commit).

**2. [Rule 1 - Bug] `TC-AUTH-008`'s written expectation described the wrong UI location for the duplicate-email message**
- **Found during:** Task 2, browser execution of `TC-AUTH-008`
- **Issue:** The case as written in Task 1 said the "That email is already registered" message
  renders "as a form-level error." Browser execution showed it actually renders as a field-level
  error under the email input (`#signup-email-error`) — `web/src/lib/auth.tsx`'s
  `formErrorsFromApiError` maps `EMAIL_TAKEN` onto the email field specifically (D-26), not the
  generic form-error slot. The status code, error code, and message text were all correct in the
  original case; only the rendering-location claim was wrong.
- **Fix:** Corrected the case's Expected column in `qa/test-cases/auth.md` in place to describe the
  actual field-level rendering.
- **Files modified:** `qa/test-cases/auth.md`
- **Verification:** re-executed against the running app — `#signup-email-error` reads exactly "That
  email is already registered", 409 status. Passes.
- **Committed in:** `7e5e177` (Task 2 commit, alongside the run report)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs — one in ephemeral QA tooling, one in the test
case's own written prose — surfaced by actually running the cases against the live app rather than
assuming the plan's draft steps were already correct).
**Impact on plan:** Both fixes were necessary for the plan's own instruction to produce a truthful
execution record; neither reflects a defect in the application under test. No scope creep.

## Issues Encountered

None beyond the two deviations above, all resolved inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 (Accounts) is now fully closed out: implementation (02-01..02-04) plus manual QA
  authored and executed (02-05), with zero open defects. `AUTH-01..05` and `QA-02` are both
  satisfied by an actual execution record, not a written-but-unrun test file (D-33).
- `R-15` (deferred login rate limiting, D-31) is now a tracked, owned risk in `qa/TEST-PLAN.md`
  pointed at Phase 6 — the hardening phase must add throttling test cases alongside the
  implementation; no case in `qa/test-cases/auth.md` exercises it today by design.
- `TC-AUTH-022`'s structural isolation note (D-22) is a standing flag: the moment Phase 4/5 adds
  any id-bearing route (an order id in a cancel endpoint, for example), that phase's QA plan must
  add real object-reference (IDOR) cases against it — the cookie-swap proof here is complete for
  Phase 2's actual route surface but does not generalize automatically.
- **Not yet done, flagged rather than silently skipped:** commit `a229ad9` (and the whole Phase 2
  branch) has not been pushed to `origin/main`, so GitHub Actions has not run against the exact
  commit this run report cites. The run report's exit-criteria checklist leaves that box
  unchecked and calls it out in Observations — the local gate mirroring CI was confirmed green,
  but that is not the same thing as CI itself being green.
- No blockers otherwise. All plan-level `<verification>` items are green: `qa/test-cases/auth.md`
  exists in template format with every AUTH requirement traced; a run report exists under
  `qa/runs/` with one recorded result per case and a real build commit; no failures occurred so no
  bug report was required; `qa/TEST-PLAN.md`/`qa/README.md` reflect Phase 2's delivered artifacts
  and its one known gap; `npm run format:check` is green across every updated Markdown file.

---

_Phase: 02-accounts_
_Completed: 2026-09-16_

## Self-Check: PASSED

- `qa/test-cases/auth.md` — FOUND
- `qa/runs/RUN-2026-09-16-auth.md` — FOUND
- `qa/TEST-PLAN.md` (R-15, Phase 2 traceability table) — FOUND
- `qa/README.md` (links to delivered artifacts) — FOUND
- Commit `a229ad9` — FOUND in `git log --oneline --all`
- Commit `7e5e177` — FOUND in `git log --oneline --all`
- Commit `e576073` — FOUND in `git log --oneline --all`
- All plan `<verify>` commands re-run and passing: Task 1 (`cases-ok`), Task 2 (`run-ok 24 rows`),
  Task 3 (`plan-ok`)
- `npm run format:check` — green across the full repository
- `git rev-list --count 71ed1b3..HEAD` — 3 (matches `actuals.commits`)

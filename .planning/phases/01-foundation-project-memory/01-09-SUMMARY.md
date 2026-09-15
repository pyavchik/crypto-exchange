---
phase: 01-foundation-project-memory
plan: 09
subsystem: web
tags: [vitest, tdd, health-poller, browser-receiver-rule, error-handling]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: healthPoller.ts / api.ts / HealthBadge.tsx from plan 01-05, and the confirmed UAT root cause from 01-UAT.md gaps G-01-1..3
provides:
  - Receiver-safe health poller timers (fixes the browser-only "Illegal invocation" bug)
  - Programming-error/API-error separation in the poller's fetch chain
  - ApiError INVALID_RESPONSE_BODY for unparsable 2xx bodies
affects: [01-10 (real-browser confirmation), 01-11 (BUG-001 / wiki finding closure)]

actuals:
  tokens: 3644
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Timer receiver-rule regression testing: stub globalThis.setTimeout/clearTimeout with strict-receiver shims that reproduce the WebIDL 'Illegal invocation' check inside Vitest (Node's timers have no such check)"
    - "Copy option-provided callback functions into local consts immediately after destructuring, and call only those locals — never as `obj.method(...)` — to guarantee the call is unqualified (this=undefined) regardless of caller-supplied receiver-sensitive functions"
    - ".then(fulfilled, rejected) instead of .then().catch() when a bug in the fulfilled handler must never be caught by the rejected handler"

key-files:
  created: []
  modified:
    - web/src/lib/healthPoller.ts
    - web/src/lib/healthPoller.test.ts
    - web/src/lib/api.ts
    - web/src/lib/api.test.ts

key-decisions:
  - "gsd_run check tdd-red-evidence targets node --test's TAP summary format (# tests/# pass/# fail lines), which Vitest's built-in --reporter=tap does not emit — the check misclassifies a legitimate RED as zero_tests_discovered. RED evidence was instead confirmed directly from Vitest's default-reporter output (named-test assertion failures matching the intended behavior), captured below."
  - "fix(01-09) used instead of feat(01-09) for both GREEN commits, per this plan's explicit instructions — this is a bug fix (gap closure), not new functionality"

requirements-completed: [FND-01, FND-03]

coverage:
  - id: D1
    description: "Default health-poller timers (no timers option) work under the browser receiver rule: start() reaches ok (never error) and the 60s poll still fires"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#default timers work when the global timer functions reject a non-global receiver"
        status: pass
    human_judgment: false
  - id: D2
    description: "Timer functions injected via the timers option are called without a receiver, so browser-native timer functions work when passed in"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#injected timer functions are invoked without a receiver"
        status: pass
    human_judgment: false
  - id: D3
    description: "refresh() recovers the poller from an error state back to ok under the browser receiver rule"
    requirement: "FND-01"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#refresh() recovers from an error state to ok under the browser receiver rule"
        status: pass
    human_judgment: false
  - id: D4
    description: "An exception thrown by onUpdate after a settled fetch propagates out of refresh() and is never rendered as an error state; the next poll is still scheduled"
    requirement: "FND-03"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#an exception from onUpdate after a successful fetch propagates and is not reported as an error state"
        status: pass
    human_judgment: false
  - id: D5
    description: "A non-ApiError rejection from fetchHealth is rethrown from refresh(), never rendered as an error state, and polling continues"
    requirement: "FND-03"
    verification:
      - kind: unit
        ref: "web/src/lib/healthPoller.test.ts#a non-ApiError rejection from fetchHealth is rethrown, not rendered"
        status: pass
    human_judgment: false
  - id: D6
    description: "An unparsable 2xx GET /health body rejects with ApiError INVALID_RESPONSE_BODY carrying the HTTP status and X-Request-Id header value, not a raw SyntaxError"
    requirement: "FND-03"
    verification:
      - kind: unit
        ref: "web/src/lib/api.test.ts#rejects with ApiError INVALID_RESPONSE_BODY when a 2xx response body is not valid JSON"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 9: Health Poller Browser Receiver-Rule Fix Summary

**Fixed the `TypeError: Illegal invocation` root cause behind UAT gaps G-01-1/G-01-2/G-01-3 by never calling the poller's timer functions as `timers.setTimeout(...)` member calls, added Node-side regression tests that reproduce the browser's WebIDL receiver rule, and split the fetch chain so programming errors (onUpdate exceptions, non-ApiError rejections, unparsable 2xx bodies) can no longer masquerade as "API unreachable".**

## Performance

- **Duration:** 35 min
- **Started:** 2026-09-15T22:21:00Z
- **Completed:** 2026-09-15T22:26:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `createHealthPoller`'s default timers now call the global `setTimeout`/`clearTimeout` as bare (unqualified) calls, and any injected `timers` option's functions are copied into local consts and called the same way — the receiver is always `undefined`, never the `timers` object, matching the browser's WebIDL rule that Node's Vitest environment does not enforce.
- New `describe("createHealthPoller under the browser timer-receiver rule")` block reproduces the browser rule inside Vitest by stubbing `globalThis.setTimeout`/`clearTimeout` with strict-receiver shims, so this exact class of bug will fail CI going forward (before this plan, only Node ran the suite and the bug was invisible).
- `performFetch`'s fetch chain is now a single `.then(fulfilled, rejected)` instead of `.then().catch()`, so an exception thrown while handling a successful result (e.g. a bug in `onUpdate`) can never be caught by the rejected handler and disguised as an API error. Both handlers still reschedule the next poll (`afterSettled()` in `finally`) even when they propagate an exception.
- `fetchHealth` now wraps the 2xx JSON parse in try/catch and throws `ApiError(status, "INVALID_RESPONSE_BODY", requestId)` on a malformed body, closing REVIEW WR-01.
- `healthPoller.ts`'s rejected handler narrows with `error instanceof ApiError` (a value import) instead of the unchecked `error as ApiError` cast, closing REVIEW WR-02.

## Task Commits

Each RED/GREEN step was committed atomically (TDD, `tdd="true"` on both tasks):

1. **Task 1 RED:** `test(01-09): add failing browser timer-receiver regression tests` - `36f0419`
2. **Task 1 GREEN:** `fix(01-09): invoke health poller timers without a receiver` - `0cc2053`
3. **Task 2 RED:** `test(01-09): add failing tests for programming-error separation` - `56a3f35`
4. **Task 2 GREEN:** `fix(01-09): separate programming errors from API errors in the health poller` - `bc236b9`

**Plan metadata:** committed alongside this SUMMARY.

_Note: this plan used `fix(01-09)` for both GREEN commits instead of `feat(01-09)` — this is a bug fix (gap closure against a confirmed UAT root cause), not new functionality, per the plan's own commit-message instructions._

## Files Created/Modified

- `web/src/lib/healthPoller.ts` - Exports `PollerTimers`; receiver-safe default/injected timer invocation via local consts; `.then(fulfilled, rejected)` fetch chain with `instanceof ApiError` narrowing
- `web/src/lib/healthPoller.test.ts` - New receiver-rule describe block (3 tests) plus 2 programming-error-separation tests in the existing describe block
- `web/src/lib/api.ts` - `fetchHealth`'s 2xx path wraps `response.json()` in try/catch, throwing `ApiError` `INVALID_RESPONSE_BODY` on parse failure
- `web/src/lib/api.test.ts` - New test for the `INVALID_RESPONSE_BODY` path

## TDD Gate Compliance

Both tasks carried `tdd="true"`. RED commits precede GREEN commits for both:

| Task | RED | GREEN | Status |
|------|-----|-------|--------|
| Task 1 (tracer) | `36f0419` | `0cc2053` | Pass |
| Task 2 | `56a3f35` | `bc236b9` | Pass |

**RED failure excerpts (Task 1, `npm run test --workspace=web -- src/lib/healthPoller.test.ts` against pre-fix code):**
```
 Test Files  1 failed (1)
      Tests  3 failed | 8 passed (11)

FAIL  src/lib/healthPoller.test.ts > createHealthPoller under the browser timer-receiver rule > default timers work when the global timer functions reject a non-global receiver
  expected last "vi.fn()" call to have been called with [ Array(1) ]
  actual:   [{ error: TypeError { message: "Illegal invocation" }, kind: "error" }]
  expected: [{ data: {...}, kind: "ok", requestId: "r-1" }]

FAIL  src/lib/healthPoller.test.ts > ... > injected timer functions are invoked without a receiver
  (same failure shape as above)

FAIL  src/lib/healthPoller.test.ts > ... > refresh() recovers from an error state to ok under the browser receiver rule
  TypeError: Illegal invocation
    at strictSetTimeout (healthPoller.test.ts:249:15)
    at scheduleFromNow (healthPoller.ts:67:22)
```

**RED failure excerpts (Task 2, `npm run test --workspace=web -- src/lib/healthPoller.test.ts src/lib/api.test.ts` against pre-fix code):**
```
Test Files  2 failed (2)
     Tests  3 failed | 16 passed (19)

FAIL src/lib/api.test.ts > fetchHealth > rejects with ApiError INVALID_RESPONSE_BODY when a 2xx response body is not valid JSON
  AssertionError: expected SyntaxError: Unexpected token 'o', "not j"... to be an instance of ApiError

FAIL src/lib/healthPoller.test.ts > createHealthPoller > an exception from onUpdate after a successful fetch propagates and is not reported as an error state
  AssertionError: promise resolved "undefined" instead of rejecting

FAIL src/lib/healthPoller.test.ts > createHealthPoller > a non-ApiError rejection from fetchHealth is rethrown, not rendered
  AssertionError: promise resolved "undefined" instead of rejecting
```

**Tooling deviation:** `gsd_run check tdd-red-evidence` (the machine-checked RED-evidence gate) parses `node --test`'s TAP summary lines (`# tests`/`# pass`/`# fail`). Vitest's built-in `--reporter=tap` does not emit those summary lines (confirmed by running it directly — see the raw TAP capture at `/private/tmp/.../scratchpad/red-task1.tap.txt` during this session), so the check would misclassify every legitimate RED here as `zero_tests_discovered` (INVALID_RED). `workflow.tdd_mode` is `false` for this project and this plan's frontmatter is `type: execute` (not `type: tdd`), so the machine-checked gate is advisory rather than a hard requirement here. RED evidence was instead confirmed directly from Vitest's own failure output above — each target test is named explicitly, fails with an assertion tied to the exact behavior under test (the `Illegal invocation` TypeError / unresolved rejection), and the pre-existing suite's tests kept passing alongside the new failures.

## Decisions Made

- Reused the plan's exact interface contract (`PollerTimers`, `TimerHandle = ReturnType<typeof setTimeout>`) rather than inventing an alternative shape, since `01-10`'s real-browser check and future consumers depend on this exact export surface.
- Kept `HealthBadge.tsx` completely untouched, per the plan's interface note that it is the only consumer and calls `createHealthPoller` with no `timers` option (verified via `git diff --stat` against the pre-plan HEAD: zero changes to that file).

## Deviations from Plan

None - plan executed exactly as written. The `gsd_run check tdd-red-evidence` tooling note above is a deviation from the generic TDD reference's evidence-persistence step (not from this plan's own `<action>` text, which only asked to run the tests and confirm failure), logged for traceability rather than as a Rule 1-4 deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-01-1/G-01-2/G-01-3 root cause is fixed and regression-tested at the unit level; the badge's default (production) code path is receiver-safe.
- Real-browser confirmation of this same path (the actual Chrome walkthrough that surfaced the bug) is deferred to plan 01-10, as scoped by this plan's `<success_criteria>`.
- Plan 01-11 can now copy these exact test names, RED excerpts and fix commit SHAs into `BUG-001` and `wiki/pages/findings/health-poller-illegal-invocation.md`.

## Self-Check: PASSED

- `web/src/lib/healthPoller.ts` exists and contains `PollerTimers`, `scheduleTimeout`, `cancelTimeout` — FOUND
- `web/src/lib/healthPoller.test.ts` exists and contains the new describe block and both programming-error tests — FOUND
- `web/src/lib/api.ts` contains `INVALID_RESPONSE_BODY` — FOUND
- `web/src/lib/api.test.ts` contains `INVALID_RESPONSE_BODY` — FOUND
- Commits `36f0419`, `0cc2053`, `56a3f35`, `bc236b9` all present in `git log --oneline --all` — FOUND
- `npm run test --workspace=web` (33 tests), `npm run typecheck --workspace=web`, `npm run lint`, `npm run format:check` all exit 0 — CONFIRMED
- `grep -vE '^\s*(//|\*)' web/src/lib/healthPoller.ts | grep -cE 'timers\.(setTimeout|clearTimeout)\('` = 0 — CONFIRMED
- `web/src/components/HealthBadge.tsx` unchanged (`git diff --stat` against pre-plan HEAD is empty for this file) — CONFIRMED

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*

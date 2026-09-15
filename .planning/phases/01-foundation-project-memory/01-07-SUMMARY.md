---
phase: 01-foundation-project-memory
plan: 07
subsystem: testing
tags: [qa, test-plan, templates, github-issue-template, markdown]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: "buildApp/createLogger/createDb contracts, GET /health shape, request-ID logging, and the .github/workflows/ci.yml job names (lint/typecheck/test) from 01-01/01-02"
provides:
  - "qa/TEST-PLAN.md — full test strategy: scope, out of scope, test approach, 14-row trading risk register, environments, entry/exit criteria, S1-S4/P1-P3 definitions, traceability, request-ID evidence workflow, deliverables status"
  - "qa/templates/{test-case,run-report,bug-report}-template.md — reusable QA templates for Phases 2-7"
  - ".github/ISSUE_TEMPLATE/bug_report.md — GitHub issue form mirroring the bug template field-for-field"
  - "qa/README.md — map of qa/ artifacts, planned folders, defect flow, Phase 1 automated checks"
affects: [01-08, "Phase 2-7 QA cycles (all reference qa/TEST-PLAN.md and qa/templates/)"]

# Actuals (#2632)
actuals:
  tokens: 6809
  tasks: 2
  commits: 2
  plan_head_before: effb703c556d608b35c985d3e49a15eb27dc9f8c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QA docs are plain GitHub-readable Markdown with exact H2 heading sets, verified by grep-based acceptance criteria rather than prose review alone"
    - "Bug report template written first, then the GitHub issue template mirrors it field-for-field (metadata table + H2 headings identical) so both surfaces stay in sync by construction"

key-files:
  created:
    - qa/TEST-PLAN.md
    - qa/README.md
    - qa/templates/test-case-template.md
    - qa/templates/run-report-template.md
    - qa/templates/bug-report-template.md
    - .github/ISSUE_TEMPLATE/bug_report.md
  modified: []

key-decisions:
  - "Wrote qa/templates/bug-report-template.md before .github/ISSUE_TEMPLATE/bug_report.md and copied the exact field/heading list into the issue template, per the plan's explicit ordering, so a mirror-drift bug is structurally impossible rather than merely reviewed"
  - "Kept every non-Phase-1 deliverable in TEST-PLAN.md's Deliverables and Status table as 'Planned (Phase N)' and asserted zero fabricated pass-rate/coverage strings, per QA-01's transparency requirement and the plan's prohibition"

patterns-established:
  - "Trading risk register format (ID, Risk, Trading impact, Likelihood, Impact, Test focus, Requirements, Phase) — future phases should append rows here rather than starting a parallel risk list"
  - "Severity/Priority are documented as independent axes with a worked example, to prevent later QA artifacts from conflating 'how bad' with 'how urgent'"

requirements-completed: [QA-01]

coverage:
  - id: D1
    description: "qa/TEST-PLAN.md has all 13 required H2 headings in order, is trading-aware (rounding, fees, min notional, stale prices, rate limits, crossing, locked funds, concurrency, isolation, session, key exposure, P&L, traceability all present), defines S1-S4/P1-P3 with trading examples including wrong-balance-after-fill as S1, has measurable entry/exit criteria, and makes no fabricated claims of executed results"
    requirement: "QA-01"
    verification:
      - kind: other
        ref: "grep loop over 13 H2 headings in qa/TEST-PLAN.md (headings-ok)"
        status: pass
      - kind: other
        ref: "grep -cE '^\\| R-[0-9]{2} ' qa/TEST-PLAN.md (14, >= 13 required)"
        status: pass
      - kind: other
        ref: "acceptance_criteria greps: S1/S4/P3/wrong-balance, double-spend/stale/429/AUTH-04/rounding, X-Request-Id/api.log, Planned(Phase)>=8 (12 found), no fabricated pass-rate strings, redact/never-paste present"
        status: pass
    human_judgment: true
    rationale: "Whether the strategy reads as rigorous and trading-aware enough for a Senior QA reviewer (the actual portfolio goal) is a judgment automated greps cannot make — flagged in the plan's own 'Flagged Assumptions' section for end-of-phase human review."
  - id: D2
    description: "qa/templates/test-case-template.md has the exact D-10 column header; qa/templates/bug-report-template.md and .github/ISSUE_TEMPLATE/bug_report.md have identical field names and section headings (mirror-ok), both carry the redaction warning, the issue template has valid GitHub issue-template frontmatter (name/labels), and run-report-template.md records Blocked/Not run/Build commit"
    requirement: "QA-01"
    verification:
      - kind: other
        ref: "grep -qxF exact header line in qa/templates/test-case-template.md (columns-ok)"
        status: pass
      - kind: other
        ref: "grep -oE field/heading extraction diffed between bug-report-template.md and bug_report.md (mirror-ok)"
        status: pass
      - kind: other
        ref: "acceptance_criteria: all 13 bold field names present, all 7 H2 headings present, redact+cookie present in both templates, frontmatter name:/labels: present, run-report Blocked/Not run/Build commit present, README links TEST-PLAN.md and bug-report-template.md"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 7: QA Test Strategy and Templates Summary

**qa/TEST-PLAN.md with a 14-row trading-aware risk register and S1-S4/P1-P3 definitions, plus the test-case, run-report and bug-report templates and a field-for-field-mirrored GitHub issue template.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-15T17:58:21Z
- **Completed:** 2026-09-15T18:02:31Z
- **Tasks:** 2
- **Files modified:** 6 created

## Accomplishments

- `qa/TEST-PLAN.md`: all 13 required H2 headings (Purpose through Deliverables and Status) in exact order, scope mapped to requirement families and phases, out-of-scope table copied from `REQUIREMENTS.md` with reasons, and a test-approach table spanning Vitest unit tests through Phase 7 release checklists
- 14-row trading risk register (R-01..R-14) covering decimal rounding, fee calculation, minimum notional/validation, stale prices, rate limits/429s (explicitly flagged unverified), limit-order crossing at exact equality, locked-funds release on cancel, concurrency/double-spend, cross-user isolation, session handling, API key exposure, average-cost P&L, request-ID traceability, and account-reset side effects — each with likelihood, impact, test focus, requirement IDs and phase
- Severity S1-S4 and Priority P1-P3 defined with trading-specific examples (S1 includes "wrong balance after a fill", "double-spend on double-click", "User A reading User B's wallet", "API key visible in the browser") and a worked example showing the two axes are set independently
- Traceability section with ID conventions (`TC-AREA-NNN`, `RUN-YYYY-MM-DD-SCOPE`, `BUG-NNN`) and a Phase 1 automated-checks table mapping FND-01..04/MEM-01..04/QA-01 to concrete file paths for plan 01-08 to verify
- Evidence and Defect Workflow section spelling out the request-ID thread (UI -> Network tab -> `api/logs/api.log` grep -> bug report -> RCA) and a redaction rule for secrets in evidence
- Deliverables and Status table: only Phase 1 artifacts marked "Done (Phase 1)"; 12 other artifacts marked "Planned (Phase N)"; no run results, pass rates or coverage numbers stated anywhere
- `qa/templates/bug-report-template.md` written first (13 bold metadata fields, 7 exact H2 sections, redaction blockquote under Evidence), then `.github/ISSUE_TEMPLATE/bug_report.md` copied field-for-field with GitHub issue-template frontmatter (`name`, `about`, `title`, `labels`) plus a pointer back to the canonical `qa/bugs/BUG-NNN-SLUG.md`
- `qa/templates/test-case-template.md` with the exact header `| ID | Title | Req | Preconditions | Steps | Expected | Priority | Type |` and a single bracketed-placeholder example row
- `qa/templates/run-report-template.md` with Run ID/Scope/Build commit/Environment/Tester/dates, a Pass/Fail/Blocked/Not run summary table, a per-TC results table, and an Exit Criteria checklist copied from `TEST-PLAN.md` as unchecked boxes
- `qa/README.md` mapping `qa/` contents, the planned `qa/test-cases/`, `qa/runs/`, `qa/bugs/` folders with naming conventions, the defect flow, and the Phase 1 automated-check commands

## Task Commits

Each task was committed atomically:

1. **Task 1: qa/TEST-PLAN.md** — `e985ad5` (feat)
2. **Task 2: Templates, GitHub issue template, qa/README.md** — `5b51ff0` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit hash in the orchestrator's completion report).

## Files Created/Modified

- `qa/TEST-PLAN.md` — full test strategy document
- `qa/README.md` — map of QA artifacts and naming conventions
- `qa/templates/test-case-template.md` — per-feature test case table template
- `qa/templates/run-report-template.md` — execution report template
- `qa/templates/bug-report-template.md` — bug report template with request-ID evidence
- `.github/ISSUE_TEMPLATE/bug_report.md` — GitHub issue form mirroring the bug template

## Decisions Made

- Bug report template authored first, GitHub issue template copied from it field-for-field (same 13 metadata fields, same 7 H2 headings, same redaction blockquote) rather than drafted independently — eliminates mirror drift by construction, matching `01-PATTERNS.md`'s explicit ordering guidance.
- No run results, coverage percentages, or automation claims written anywhere in `TEST-PLAN.md`; every non-Phase-1 artifact explicitly marked "Planned (Phase N)" — honors QA-01's transparency requirement given this is a portfolio artifact under human review.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. All six files are complete, reviewable documents — no placeholder content beyond the templates' own intentional bracketed placeholders (which are the template's purpose, not stubs).

## Human verification (end-of-phase)

Per `workflow.human_verify_mode: end-of-phase`, this plan's judgment-tier item is deferred to
the phase-level UAT rather than a mid-flight checkpoint:

- **What to review:** Read `qa/TEST-PLAN.md` in full and judge whether it reads as a rigorous,
  trading-aware test strategy that would credibly demonstrate Senior QA Engineer judgment to a
  reviewer (per the plan's "Flagged Assumptions" note — QA-01 is unclassified/unresolved on
  this axis because automated greps can only check structure, not quality).
- **How to verify:** Open `qa/TEST-PLAN.md`, `qa/README.md`, and the three files under
  `qa/templates/` plus `.github/ISSUE_TEMPLATE/bug_report.md` on GitHub (or locally) and confirm
  they read naturally, the risk register rows feel concrete rather than generic, and the
  severity/priority examples are convincing.
- **Resume signal:** No action needed to unblock further phases — this is a quality read, not a
  blocking gate. Note any wording changes desired in `.planning/STATE.md` blockers if found.

## Next Phase Readiness

- `qa/TEST-PLAN.md` and `qa/templates/` are ready for plan 01-08's verification pass (checks that the Phase 1 automated-checks paths listed in Traceability actually exist).
- Every later phase (2-7) has the templates it needs already in place: test cases can be written into `qa/test-cases/<FEATURE>.md` following `qa/templates/test-case-template.md`'s exact header from Phase 2 onward.
- The QA-01 requirement is code-complete per this plan's automated acceptance criteria; the one open item is the human quality read noted above, deferred to end-of-phase per `human_verify_mode`.

## Self-Check: PASSED

- `test -f qa/TEST-PLAN.md && test -f qa/README.md && test -f qa/templates/test-case-template.md && test -f qa/templates/run-report-template.md && test -f qa/templates/bug-report-template.md && test -f .github/ISSUE_TEMPLATE/bug_report.md` → all found
- `git log --oneline --all --grep="01-07"` → matches `5b51ff0 feat(01-07): QA templates, mirrored GitHub issue template, and qa/README.md` and `e985ad5 feat(01-07): trading-aware qa/TEST-PLAN.md — risks, severity/priority, entry/exit criteria`
- Re-ran all `<acceptance_criteria>` for Task 1 and Task 2 → all PASS (see command transcript above)
- Re-ran plan-level `<verification>`: 13/13 headings present, 14 risk rows (>= 13 required), test-case column header exact, bug template and issue template field names/headings identical (mirror-ok)

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*

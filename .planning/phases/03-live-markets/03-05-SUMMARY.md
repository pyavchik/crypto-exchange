---
phase: 03-live-markets
plan: 05
subsystem: testing
tags: [qa, test-plan, coingecko, wiki, playwright]

requires:
  - phase: 03-live-markets
    provides: "03-01..03-04's markets table, trade page/chart, stale-serve fallback and poller — the implementation this plan tests"
provides:
  - "qa/test-cases/markets.md — 36 TC-MKT-NNN cases tracing every DATA-01..04/MKT-01..05 requirement of this phase"
  - "qa/runs/RUN-2026-09-16-markets.md — executed run report, 35/36 pass, 1 Blocked (documented automation-environment limitation), 0 bugs"
  - "qa/TEST-PLAN.md's R-05: verified Demo rate limits with citations, the monthly-cap risk explicitly accepted, a Phase 3 automated-checks traceability table"
  - "wiki/pages/decisions/market-data-cache-and-stale.md — the ADR for the cache/stale/quote-convention decisions"
affects: [phase-4-wallet-trading, qa-04, qa-05]

actuals:
  tokens: 20781
  tasks: 3
  commits: 3

plan_head_before: 3edff16f31ef1c86bf4cbeea7e8d93784a74a897

tech-stack:
  added: []
  patterns:
    - "Per-case Pass/Fail/Blocked QA execution harness, extending scripts/smoke-dev.mjs's temp-stack/stub/playwright-core discipline but recording every case's outcome instead of failing fast on the first mismatch, so one bad case never prevents honestly recording the rest"

key-files:
  created:
    - qa/test-cases/markets.md
    - qa/runs/RUN-2026-09-16-markets.md
    - wiki/pages/decisions/market-data-cache-and-stale.md
  modified:
    - qa/TEST-PLAN.md
    - qa/README.md
    - wiki/pages/concepts/market-data-caching.md
    - wiki/pages/entities/coingecko-api.md
    - wiki/pages/decisions/coingecko-proxy.md
    - wiki/index.md
    - wiki/log.md
    - .planning/PROJECT.md

key-decisions:
  - "TC-MKT-020 (tab-visibility pause/resume) recorded Blocked, never Pass or Fail, after two independent CDP-level probes confirmed headless Chrome via playwright-core cannot synthesize a real visibilitychange across Playwright-driven pages in this environment — the underlying pause/resume logic is proven instead by web/src/lib/poller.test.ts's dedicated visibility tests, part of the pre-run green suite"
  - "TC-MKT-008's expected format was corrected in place (formatCompact has no currency symbol) after actually running the case surfaced the mismatch — a test-case authoring fix, not a product defect, mirroring the Phase 2 TC-AUTH-008 precedent"
  - "R-05's monthly-cap exposure is recorded as an explicitly accepted risk with a stated warning sign and reversal condition, rather than built into a throttle this phase — 03-CONTEXT.md open question 5, resolved"
  - "A stale ~30-calls/min figure found in wiki/pages/decisions/coingecko-proxy.md during the mandated contradiction pass (a page this plan's file list did not name) was also corrected, since leaving a known-stale fact in the wiki right after this phase's own research settled it would defeat the point of the pass"

patterns-established:
  - "Per-case Pass/Fail/Blocked QA harness recording is the template for executing a large manual test-case file against a real temp instance without one bad case hiding the rest of the results"

requirements-completed: [QA-03]

coverage:
  - id: D1
    description: "qa/test-cases/markets.md: 36 TC-MKT-NNN cases spanning positive/negative/boundary/security types, tracing every DATA-01..04 and MKT-01..05 requirement, stating the dynamic-curated-list rule in the preamble"
    requirement: QA-03
    verification:
      - kind: other
        ref: "plan <verify> automated check (Task 1): header/row-count/requirement-trace/type-coverage grep — cases-ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "qa/runs/RUN-2026-09-16-markets.md: every written case executed against a real temp instance (D-51 local stub for deterministic upstream failures), 35/36 Pass, 1 Blocked with a documented environment-limitation reason, 0 bugs filed"
    requirement: QA-03
    verification:
      - kind: other
        ref: "plan <verify> automated check (Task 2): row-count-matches-cases, no unfilled placeholders, build-commit-present — run-ok 36 rows"
        status: pass
    human_judgment: true
    rationale: "The plan's own Task 2 <verify> includes a <human-check> asking a reviewer to confirm the run report reads as a real execution record — environment detail, the key-exposure row's full pass condition, every failed row linking a bug, no secrets anywhere — a narrative-quality judgment beyond what a grep can substitute for."
  - id: D3
    description: "qa/TEST-PLAN.md: R-05 carries the verified Demo rate limits (100 calls/min, 10,000 call credits/month) with citations in place of the old unconfirmed marker, the monthly-cap exposure as an explicitly accepted risk with a reversal condition, a Phase 3 automated-checks traceability table, the DOM-test-tooling coverage-boundary note, and the USD/USDT quote convention"
    requirement: QA-03
    verification:
      - kind: other
        ref: "plan <verify> automated check (Task 3): rate-limit figures/citation present, unverified marker gone, TC-MKT traceability present, every existing top-level heading intact, wiki-lint clean, format:check clean"
        status: pass
    human_judgment: true
    rationale: "The plan's own Task 3 <verify> includes a <human-check> asking a reviewer to confirm the R-05 note reads as a managed decision (not a disclaimer) and that the new wiki decision page does not contradict the concept page — a coherence judgment beyond grep/lint."
  - id: D4
    description: "qa/README.md lists the delivered markets test cases and run report, matching the existing auth entries' style"
    requirement: QA-03
    verification:
      - kind: other
        ref: "plan <verify> automated check (Task 3): grep 'qa/test-cases/markets.md' qa/README.md"
        status: pass
    human_judgment: false
  - id: D5
    description: "wiki/pages/decisions/market-data-cache-and-stale.md (new ADR) records the cache, stale-serve and quote-convention decisions as one coherent record; market-data-caching.md and coingecko-api.md updated with the verified numbers and linked to it; a stale figure in coingecko-proxy.md found during the contradiction pass was also corrected; index.md and log.md updated"
    requirement: QA-03
    verification:
      - kind: other
        ref: "node scripts/wiki-lint.mjs --base e39073e (the Phase 2 end commit)"
        status: pass
    human_judgment: true
    rationale: "wiki-lint proves structure/frontmatter/links/index/log mechanically but explicitly does not check for contradictions or stale facts (per its own header comment) — the contradiction pass across four related pages is a judgment call a human should spot-check."

duration: ~44min
completed: 2026-09-16
status: complete
---

# Phase 3 Plan 5: Markets QA — Test Cases, Real Execution, and Test-Plan/Memory Close-Out Summary

**36 TC-MKT-NNN market-data test cases executed against a real temporary instance of the app (35
pass, 1 honestly recorded Blocked — not fabricated Pass), R-05's Demo rate limits finally verified
and cited, and the phase's cache/stale/quote decisions recorded as a durable wiki ADR.**

## Performance

- **Duration:** ~44 min
- **Started:** 2026-09-16T11:15:00Z (approx.)
- **Completed:** 2026-09-16T11:59:31Z
- **Tasks:** 3
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments

- Wrote `qa/test-cases/markets.md`: 36 `TC-MKT-NNN` cases in the project's template format,
  covering table contents/formatting (including the sub-cent legibility and self-pair-exclusion
  boundary cases), search, sort (including a deliberate tie fixture and a null-value fixture),
  auto-refresh/freshness, the 1D/7D/30D chart (including the ms-vs-s timestamp check), the
  degraded/stale-price mode, attribution, and — the file's most important row — the browser-traffic
  key-exposure case (success criterion 3). Every DATA-01..04 and MKT-01..05 requirement of this
  phase is traced by at least one case; no case hardcodes which coins are in the dynamic curated
  list.
- Built a per-case QA execution harness extending `scripts/smoke-dev.mjs`'s proven temp-stack /
  local-stub / `playwright-core` discipline, and ran it against a real temporary instance (never
  the developer's own `npm run dev`): 34 of 36 cases produced a genuine Pass on the first attempt;
  1 (TC-MKT-020, tab-visibility pause/resume) was investigated further after the harness's own
  measurement looked wrong, diagnosed via two independent CDP-level probes as an
  automation-environment limitation (not an app defect) and honestly recorded **Blocked**, never
  fabricated as Pass; 1 (TC-MKT-008) surfaced a test-case authoring error (an incorrectly assumed
  `$` prefix), corrected in place and re-verified as Pass. Ran the bundle-grep key-exposure case
  (TC-MKT-034) via a Node script that computes a match count without ever printing the key's value.
  Wrote `qa/runs/RUN-2026-09-16-markets.md` recording all 36 results with concrete evidence
  (response bodies, log lines, request ids, canvas/DOM state) and which upstream each group used.
  Zero defects found — no bug reports filed.
- Folded the phase into `qa/TEST-PLAN.md`: R-05 now states the verified Demo limits (100
  calls/min, 10,000 call credits/month, cited) in place of the old "unverified" marker, the
  monthly-cap exposure is recorded as an explicitly accepted risk with its arithmetic and a named
  reversal condition, R-04 and R-11's test-focus cells now name the covering `TC-MKT-*` cases, a
  Phase 3 automated-checks table maps every DATA/MKT requirement to its test files and manual
  cases, and two standing notes were added: the `web/` workspace's deliberate no-DOM-tooling
  coverage boundary, and the USD-upstream/USDT-display quote convention Phase 4's order math
  inherits. `qa/README.md` now lists the delivered markets artifacts.
- Wrote `wiki/pages/decisions/market-data-cache-and-stale.md`, a new ADR recording four decisions
  as one coherent record: the keyed in-memory cache (and why it is not the durable table the ping
  check uses), the stale-serve contract, the verified USD/USDT quote convention, and the accepted
  monthly-cap exposure. Updated `wiki/pages/concepts/market-data-caching.md` and
  `wiki/pages/entities/coingecko-api.md` with the verified numbers and cross-links, ran the
  contradiction pass this phase's touched pages required and found (and fixed) one more stale fact
  in `wiki/pages/decisions/coingecko-proxy.md` outside this plan's own file list, updated
  `wiki/index.md`, appended `wiki/log.md` (never rewritten), and mirrored one row into
  `.planning/PROJECT.md`'s Key Decisions table. `node scripts/wiki-lint.mjs --base e39073e` (the
  Phase 2 end commit) is clean: 20 pages, 0 orphans, 0 broken links, 0 duplicates, 0 errors.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the market-data test cases** - `f82d151` (test)
2. **Task 2: Execute the cases and file the run report** - `2ea338f` (test)
3. **Task 3: Fold Phase 3 into the test plan and into project memory** - `8853a7f` (docs)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `qa/test-cases/markets.md` - 36 `TC-MKT-NNN` cases covering DATA-01..04, MKT-01..05
- `qa/runs/RUN-2026-09-16-markets.md` - the executed run report, 35/36 pass, 1 Blocked
- `wiki/pages/decisions/market-data-cache-and-stale.md` - new ADR for the cache/stale/quote decisions
- `qa/TEST-PLAN.md` - R-05 verified limits + accepted risk, Phase 3 automated-checks table, coverage-boundary and quote-convention notes
- `qa/README.md` - lists the delivered markets test cases and run report
- `wiki/pages/concepts/market-data-caching.md` - "as built" facts replacing the Phase 3 planned-design framing
- `wiki/pages/entities/coingecko-api.md` - verified limits, `vs_currency=usdt` rejection, endpoint params actually called
- `wiki/pages/decisions/coingecko-proxy.md` - stale ~30-calls/min figure and "still open" TTL note corrected (contradiction pass)
- `wiki/index.md` - catalogs the new decision page
- `wiki/log.md` - DECISION and LINT entries appended
- `.planning/PROJECT.md` - one mirrored Key Decisions row

## Decisions Made

- TC-MKT-020 recorded Blocked (not Pass or Fail) after diagnosing a genuine headless-Chrome
  automation limitation, rather than either silently passing it or filing a bug against the app —
  see Key Decisions in frontmatter for the two-probe diagnosis.
- R-05's monthly-cap exposure accepted and documented explicitly, with a warning sign and a
  reversal condition, rather than building a safety-valve throttle this phase.
- The contradiction pass corrected a stale fact in `coingecko-proxy.md`, a page not in this plan's
  own `<files>` list, because leaving a known-stale figure in the wiki right after this session's
  own research settled it would defeat the point of the pass.

## Deviations from Plan

None - plan executed exactly as written. The `coingecko-proxy.md` correction is the mandated
contradiction pass working as intended (the plan explicitly asks to "fix or flag anything that
disagrees" against pages this phase touched), not a deviation from any plan instruction.

## Issues Encountered

- The QA execution harness's first attempt at TC-MKT-008 used an incorrect expected format
  (assumed a `$` prefix `formatCompact` does not produce); corrected the test case in place and
  re-verified. Not an app defect.
- The QA execution harness's first attempt at TC-MKT-020 (tab-visibility pause) produced a
  misleading Fail signal because headless Chrome via `playwright-core` does not synthesize a real
  `visibilitychange` event across Playwright-driven pages in this environment. Diagnosed with two
  independent CDP probes (`Emulation.setEmulatedVisibility` unavailable;
  `Page.setWebLifecycleState` produced no event) before concluding it is an automation-environment
  limitation, not an app defect, and recording the case Blocked with the full diagnosis in the run
  report rather than guessing either way.

## User Setup Required

None - no external service configuration required. This plan touched no application code and no
environment variables.

## Next Phase Readiness

- QA-03 is complete: 36 written cases, 35 executed with a genuine Pass, 1 honestly Blocked, 0
  defects, a fully updated test plan and a durable wiki record of why the cache/stale/quote
  decisions are what they are.
- TC-MKT-020 should be re-attempted the next time a human is available for UAT (a real OS-level
  tab switch, not headless automation) — flagged explicitly in the run report's Observations
  rather than left as a silent gap.
- Phase 4's order-math work inherits the USD-upstream/USDT-display quote convention recorded here
  — `qa/TEST-PLAN.md`'s Test Approach section now states this explicitly so Phase 4's cases do not
  accidentally assert a genuinely stablecoin-quoted feed exists.
- No blockers. No application code changed; the full local gate (`npm run lint`,
  `npm run typecheck`, `npm test` — 156 API + 175 web, `npm run smoke`) was confirmed green on the
  pre-plan commit `3edff16` before this run started, and remains valid since no `api/src` or
  `web/src` file was touched by this plan.

---

*Phase: 03-live-markets*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 12 referenced files (3 created + 8 modified + this SUMMARY) confirmed present on disk; all 3
task commit hashes (`f82d151`, `2ea338f`, `8853a7f`) confirmed present in git history.

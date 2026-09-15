---
title: QA artifacts are first-class deliverables
type: decision
updated: 2026-09-15
sources: [raw/2026-09-15-railsware-senior-qa-tradezella.md]
related: [[qa-portfolio-alignment]], [[railsware-senior-qa-tradezella]], [[foundation-skeleton-conventions]]
---

# QA artifacts are first-class deliverables

**Status:** Accepted (project init, 2026-09-15). Recorded in `.planning/PROJECT.md` Key Decisions row
5.

## Context

The target role is Senior QA Engineer, not developer ([[railsware-senior-qa-tradezella]]) — so
the QA artifacts, not just the app, are the headline deliverable ([[qa-portfolio-alignment]]).

## Decision

- Every feature phase ships FE + BE + manual test cases together — QA work is never a separate,
  deferred pass.
- Phase 6 is a dedicated QA hardening phase: exploratory sessions, a Playwright suite, an API
  test collection and RCA write-ups.
- QA artifacts live in `qa/`: `TEST-PLAN.md`, `test-cases/<feature>.md`, `runs/`,
  `bugs/BUG-NNN-*.md`, and reusable `templates/` ([[foundation-skeleton-conventions]]).
- Test cases use `TC-<AREA>-NNN` IDs; bugs use `BUG-NNN`; severity is S1-S4 and priority is
  P1-P3.

## Consequences

- A reviewer can trace any requirement to its test case, to a test run, to a bug report, to its
  RCA write-up, all via consistent IDs — the exact evidence chain the target job asks for.
- QA scope grows with every feature phase instead of being crammed into a single pass at the
  end, so test coverage compounds the same way the wiki does.

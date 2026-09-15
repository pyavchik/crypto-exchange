# QA

This folder holds the manual and automated QA artifacts for the CoinGecko Paper Exchange —
the headline deliverable of this portfolio project.

## Start Here

- [`TEST-PLAN.md`](./TEST-PLAN.md) — test strategy: scope, out of scope, test approach, the
  trading-aware risk register, environments, entry/exit criteria, severity and priority
  definitions, traceability conventions, and the request-ID evidence workflow.

## Templates

- [`templates/test-case-template.md`](./templates/test-case-template.md) — per-feature test
  case table (`TC-AREA-NNN`).
- [`templates/run-report-template.md`](./templates/run-report-template.md) — execution report
  for a test cycle (`RUN-YYYY-MM-DD-SCOPE`).
- [`templates/bug-report-template.md`](./templates/bug-report-template.md) — bug report with
  request-ID evidence (`BUG-NNN`). Mirrored field-for-field by
  [`.github/ISSUE_TEMPLATE/bug_report.md`](../.github/ISSUE_TEMPLATE/bug_report.md) for
  reporters who prefer filing a GitHub issue; the file under `qa/bugs/` is always canonical.

## Planned Folders

These do not exist yet — they are created when their first file is written, starting in
Phase 2. **Status: Planned.**

| Folder | Contents | Naming convention |
|--------|----------|--------------------|
| `qa/test-cases/` | One Markdown file per feature area | `<FEATURE>.md`, e.g. `auth.md` |
| `qa/runs/` | One execution report per test cycle | `RUN-YYYY-MM-DD-SCOPE.md` |
| `qa/bugs/` | One bug report per defect | `BUG-NNN-<slug>.md` |

## Defect Flow

1. A manual or automated test case fails, or exploratory testing finds an issue.
2. A bug report is filed at `qa/bugs/BUG-NNN-<slug>.md` using
   [`templates/bug-report-template.md`](./templates/bug-report-template.md), linking the
   originating test case and requirement, and quoting the request ID plus a log/network
   excerpt as evidence.
3. Optionally, the same bug is mirrored as a GitHub issue via
   [`.github/ISSUE_TEMPLATE/bug_report.md`](../.github/ISSUE_TEMPLATE/bug_report.md), pointing
   back to the canonical `qa/bugs/` file.
4. Once fixed, significant defects (Phase 6+) get an RCA write-up linking the bug, the log and
   network evidence, the root cause, the fix, and a regression test.

## Phase 1 Automated Checks

These run today and are the only "Done" row in `TEST-PLAN.md`'s Deliverables and Status table:

| Command | What it proves |
|---------|-----------------|
| `npm test` | Unit tests across the `api` and `web` workspaces |
| `npm run smoke` | Full-stack smoke test (`scripts/smoke-dev.mjs`) against the real `npm run dev` |
| `node scripts/wiki-lint.mjs` | Project-memory wiki conventions (MEM-01..04) |

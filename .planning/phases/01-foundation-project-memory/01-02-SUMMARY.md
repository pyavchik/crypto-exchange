---
phase: 01-foundation-project-memory
plan: 02
subsystem: infra
tags: [eslint, prettier, github-actions, ci, gh-cli, secret-scan]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: "buildApp/createLogger/createDb/createCoingeckoStatusService/fetchHealth contracts and the api/web/scripts source tree from 01-01"
provides:
  - "eslint.config.js flat config (ESLint 10, typescript-eslint recommended, node/browser globals split by workspace, eslint-config-prettier last)"
  - "Root lint / format / format:check npm scripts"
  - ".prettierrc.json (printWidth 100) and .prettierignore keeping wiki/, .planning/, qa/, .claude/, .gsd/, migrations and all Markdown untouched"
  - ".github/workflows/ci.yml: independent lint, typecheck and test jobs on Node 24 with npm cache, concurrency cancellation, contents:read permissions, no secrets referenced"
  - "Public GitHub repository pyavchik/crypto-exchange with origin remote and a green CI run for HEAD"
affects: [01-03, 01-04, 01-05]

# Actuals (#2632)
actuals:
  tokens: 2134
  tasks: 2
  commits: 2
  plan_head_before: 2df45be368b017095366fd2cc4183d81d7a3cab3

# Tech tracking
tech-stack:
  added:
    - "eslint.config.js flat config wiring @eslint/js + typescript-eslint + globals + eslint-config-prettier (all packages already installed by 01-01)"
    - "GitHub Actions workflow CI: three independent jobs (lint, typecheck, test), actions/checkout@v4 + actions/setup-node@v4"
  patterns:
    - "Prettier/ESLint ignore both centered on the same durable-content boundary: wiki/, .planning/, qa/, .claude/, .gsd/ and migrations are never reformatted or linted — protects the append-only wiki log and GSD/orchestrator state"
    - "CI jobs are independent (no needs: edges) so lint/typecheck/test each report their own status instead of hiding behind a single combined job"

key-files:
  created:
    - eslint.config.js
    - .prettierrc.json
    - .prettierignore
    - .github/workflows/ci.yml
  modified:
    - package.json
    - .gitignore
    - api/src/lib/coingecko.ts
    - api/src/routes/health.ts
    - api/src/db/schema.ts
    - scripts/smoke-dev.mjs

key-decisions:
  - "Added .gsd/ and .planning/milestone.lock to .gitignore (and to .prettierignore/eslint ignores) before the first public push, per the orchestrator's explicit instruction — these are GSD orchestrator runtime files, not project source, and must never enter the public history"
  - "Public repo created via gh repo create --public --source=. --remote=origin --push per D-12/D-13, after a clean secret scan across all 14 commits reachable from HEAD"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "npm run lint, format:check, typecheck and test all exit 0 from the repo root; ESLint demonstrably lints TypeScript (stdin probe exits 1 on an unused var); Prettier demonstrably ignores wiki/log.md"
    requirement: "FND-02"
    verification:
      - kind: other
        ref: "npm run lint && npm run format:check && npm run typecheck && npm test && npm run smoke"
        status: pass
      - kind: other
        ref: "printf 'const unused = 1\\n' | npx eslint --stdin --stdin-filename api/src/probe.ts (exit 1, @typescript-eslint/no-unused-vars)"
        status: pass
      - kind: other
        ref: "npx prettier --file-info wiki/log.md (ignored: true)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GitHub Actions CI workflow with independent lint, typecheck and test jobs on Node 24, concurrency cancellation, contents:read permissions, no secrets or CoinGecko references, green for the pushed HEAD"
    requirement: "FND-02"
    verification:
      - kind: other
        ref: "gh run watch 35003724708 --repo pyavchik/crypto-exchange --exit-status (exit 0)"
        status: pass
      - kind: other
        ref: "gh run view 35003724708 --json jobs -> lint=success, typecheck=success, test=success"
        status: pass
    human_judgment: false
  - id: D3
    description: "Public GitHub repository pyavchik/crypto-exchange exists with clean history (no .env, no CG- key pattern in any of the 14 commits) and origin remote tracking main with no ahead count"
    requirement: "FND-02"
    verification:
      - kind: other
        ref: "git rev-list --all | xargs git grep -I -n -E 'CG-[A-Za-z0-9]{16,}' (exit 1, nothing found); git ls-files / git log --all --name-only for .env (nothing found)"
        status: pass
      - kind: other
        ref: "gh repo view pyavchik/crypto-exchange --json visibility -> PUBLIC; git status -sb -> main...origin/main, no ahead count"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 2: Lint/Format Gates, CI and Public Repo Summary

**ESLint 10 flat config + Prettier gates that provably run over api/web/scripts, a three-job (lint/typecheck/test) GitHub Actions workflow on Node 24, and the public repo `pyavchik/crypto-exchange` pushed with CI green.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-15 (continuing directly after 01-01)
- **Completed:** 2026-09-15T17:51:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 6 modified, 4 created

## Accomplishments

- `eslint.config.js` flat config: `@eslint/js` recommended + `typescript-eslint` recommended, node/browser globals split correctly per workspace (`api/**`, `scripts/**` → node; `web/src/**` → browser; `web/vite.config.ts` → both), `@typescript-eslint/no-unused-vars` set to error with `^_` ignore pattern, `eslint-config-prettier` last so formatting rules never fight lint rules
- `.prettierrc.json` (printWidth 100) and `.prettierignore` keep Prettier off `wiki/`, `.planning/`, `qa/`, `.claude/`, `.gsd/`, `api/src/db/migrations/` and all Markdown — proven by `npx prettier --file-info wiki/log.md` reporting `ignored: true`
- Root `lint` / `format` / `format:check` scripts added to `package.json` without touching the existing `test`/`typecheck`/`smoke`/`dev` scripts
- Proved the gates are not vacuous: an unused-var TypeScript stdin probe makes `eslint` exit 1 with `@typescript-eslint/no-unused-vars`; `npm --prefix api run test -- src/__no_such_dir__` exits non-zero (Vitest refuses to pass with zero test files, confirming no `passWithNoTests`/`--if-present` vacuous-pass paths exist)
- `.github/workflows/ci.yml`: workflow `CI`, `push` + `pull_request` triggers, top-level `permissions: contents: read`, `concurrency` group keyed on `github.workflow`/`github.ref` with `cancel-in-progress: true`, `env.GIT_COMMIT` from `github.sha`; three independent jobs (`lint`, `typecheck`, `test`) with no `needs:` edges, each on `ubuntu-latest` via `actions/checkout@v4` + `actions/setup-node@v4` (Node 24, `cache: npm`) then `npm ci` and the job's own command
- Secret scan run across all 14 commits reachable from HEAD before any push: no `.env` file tracked or in any commit, no `CG-[A-Za-z0-9]{16,}` pattern anywhere in history — safe to make the repo public per D-12
- Created public repository `pyavchik/crypto-exchange` via `gh repo create --public --source=. --remote=origin --push`; pushed `main` with upstream tracking
- Watched CI for the pushed HEAD (`f81961f`, run `35003724708`) to completion: `lint=success`, `typecheck=success`, `test=success`

## Task Commits

Each task was committed atomically:

1. **Task 1: Lint and format gates** — `22ee3ad` (feat)
2. **Task 2: CI workflow, secret scan, public repo, CI green** — `f81961f` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit hash in the orchestrator's completion report).

## Files Created/Modified

- `eslint.config.js` — ESLint 10 flat config (created)
- `.prettierrc.json`, `.prettierignore` — Prettier config and ignore list (created)
- `.github/workflows/ci.yml` — GitHub Actions CI workflow (created)
- `package.json` — added `lint`, `format`, `format:check` root scripts
- `.gitignore` — added `.gsd/` and `.planning/milestone.lock`
- `api/src/lib/coingecko.ts` — removed a useless double-assignment of `httpStatus` (lint fix, no behavior change)
- `api/src/routes/health.ts`, `api/src/db/schema.ts`, `scripts/smoke-dev.mjs` — Prettier quote-style reformatting only (no behavior change; re-verified by `npm test`/`npm run smoke` after formatting)

## Decisions Made

- **`.gsd/` and `.planning/milestone.lock` added to `.gitignore`** before the first public push. These are GSD orchestrator runtime files (dispatch-isolation sentinel, milestone lock), not project source or planning documentation, and the orchestrator explicitly instructed they must never be pushed. Also excluded from `.prettierignore`/ESLint's `globalIgnores` for consistency, though gitignore is the binding control.
- **Repository created and pushed only after the secret scan passed clean** across all 14 commits (no `.env`, no CoinGecko `CG-` key pattern) — D-12's stated reversibility guard; no push would have occurred on any hit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a useless double-assignment of `httpStatus` in `coingecko.ts`**
- **Found during:** Task 1, `npm run lint`
- **Issue:** `no-useless-assignment` flagged `httpStatus = null` inside the `catch` block — `httpStatus` was already `null` from its initial declaration and the `try` block only ever reassigns it to `response.status`, so the catch-path reassignment was dead code, not gated behind any conditional that would make it meaningful.
- **Fix:** Removed the redundant `httpStatus = null;` line inside the `catch` block. No behavior change — the caught-error path already leaves `httpStatus` at its initial `null` value.
- **Files modified:** `api/src/lib/coingecko.ts`
- **Verification:** `npm run lint` exits 0; `npm test` (both workspaces) and `npm run smoke` still pass after the fix.
- **Committed in:** `22ee3ad` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added `.gsd/` and `.planning/milestone.lock` to `.gitignore` before the first public push**
- **Found during:** Task 2, pre-push review (per explicit orchestrator instruction)
- **Issue:** These GSD orchestrator runtime files were untracked but not gitignored; without an explicit ignore rule they could be accidentally `git add`-ed and pushed to the now-public repo in a later plan.
- **Fix:** Added both paths to `.gitignore` (and to `.prettierignore`/ESLint ignores for consistency). Neither file was ever staged or committed by this plan.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` confirms `.gsd/` and `.planning/milestone.lock` remain untracked after the push; `git ls-files` does not list either.
- **Committed in:** `22ee3ad` (Task 1 commit, bundled with the lint/format gate work since both touch root config)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing-critical safeguard)
**Impact on plan:** Both fixes were necessary — one for lint correctness, one for repository hygiene ahead of a one-way public push. No scope creep.

## Issues Encountered

- GitHub Actions surfaced an informational annotation on all three jobs: "Node.js 20 is deprecated... actions/checkout@v4 and actions/setup-node@v4 are being forced to run on Node.js 24." This is GitHub's own runner-infrastructure notice about the JS runtime the *action code itself* executes under (unrelated to this workflow's `node-version: '24'` for the *job's* Node), affects essentially every workflow currently pinned to `actions/checkout@v4`/`actions/setup-node@v4`, and does not fail the run. Per the threat model (only GitHub-owned, pinned major-version actions), no action version change was made — left as-is, not a defect in this plan's work.

## User Setup Required

None — no external service configuration required. `gh` was already authenticated as `pyavchik`.

## Known Stubs

None.

## Next Phase Readiness

- CI is green on GitHub for `lint`, `typecheck` and `test` (ROADMAP success criterion 2 met); every subsequent commit on `main` will now be gated.
- Public repo `pyavchik/crypto-exchange` exists with clean history and no secrets — reviewers can browse `.planning/`, `wiki/` and source from day one (D-12).
- `.planning/config.json` `git.allow_default_branch_commits: true` (set in 01-01, still uncommitted/local-only) continues to apply; this plan's commits landed directly on `main` as expected for this project's `branching_strategy: "none"`.
- Wave-3 plans (01-03, 01-04, 01-05) inherit a repo where `npm run lint`/`format:check`/`typecheck`/`test` are real gates, not placeholders — any regression they introduce will be caught locally before it reaches CI.

## Self-Check: PASSED

- `test -f eslint.config.js && test -f .prettierrc.json && test -f .prettierignore && test -f .github/workflows/ci.yml` → all found
- `git log --oneline --all --grep="01-02"` → matches `f81961f feat(01-02): GitHub Actions CI with independent lint, typecheck and test jobs` and `22ee3ad feat(01-02): lint and format gates that provably run over api, web and scripts`
- Re-ran all `<acceptance_criteria>` for Task 1 and Task 2 → all PASS (see command transcript in execution log)
- Re-ran plan-level `<verification>`: `npm run lint && npm run format:check && npm run typecheck && npm test` → all exit 0; `gh repo view pyavchik/crypto-exchange` → PUBLIC; HEAD CI run `35003724708` → `lint=success`, `typecheck=success`, `test=success`

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*

---
title: Tech stack (React+TS / Node+TS / SQLite)
type: decision
updated: 2026-09-16
sources: []
related: [[project-overview]], [[foundation-skeleton-conventions]], [[health-poller-illegal-invocation]]
---

# Tech stack

**Status:** Accepted (project init, 2026-09-15). Recorded in `.planning/PROJECT.md` Key Decisions row
3.

## Context

One language across the app and the Playwright test automation directly matches the target
job's Playwright (TypeScript) nice-to-have, and keeps the whole stack reviewable by a
QA-focused audience.

## Decision

- React + TypeScript (Vite) frontend, Node + TypeScript backend, SQLite database — the
  single-language stack fixed at project init.
- Concrete Phase 1 choices (see [[foundation-skeleton-conventions]]): npm workspaces monorepo
  (`api/`, `web/`, single root lockfile); Vite 8 + React 19 + `react-router` 8 for the web
  shell; Fastify 5 with pino JSON logging for the API; `better-sqlite3` + Drizzle ORM 0.45 with
  committed SQL migrations; Vitest 5 in both workspaces; ESLint 10 flat config +
  typescript-eslint + Prettier 3; GitHub Actions CI on Node 24.
- TypeScript pinned to `~6.0.3` (not a newer 7.x line) because `typescript-eslint@8.70.0`
  declares a peer `typescript` range below `6.1.0` — verified via `npm view` before install.
- `playwright-core` 1.63 as a root devDependency (library only, not the Playwright test runner),
  used by the `npm run smoke` browser step to drive installed Google Chrome via the `"chrome"`
  channel (the bundled Chromium cannot be installed on macOS 13); added in Phase 1 gap closure
  after [[health-poller-illegal-invocation]].

## Consequences

- Playwright TS in Phase 6 (AUT-02) reuses the same language, tooling and CI runner as the app
  — no second toolchain to maintain.
- The SQLite choice constrains Phase 7 hosting: the deployment target must support a persistent
  SQLite volume, or the project switches to a free Postgres instance instead (decision recorded
  as `free-hosting-public-repo`, added alongside this page).
- Any future TypeScript major-version bump must first confirm `typescript-eslint`'s peer range,
  or lint tooling breaks across all three workspaces.
- The `npm run smoke` real-browser step needs Google Chrome installed locally and is not a CI
  job; Phase 6 AUT-02 builds its Playwright suite and CI job on the same `playwright-core` line.

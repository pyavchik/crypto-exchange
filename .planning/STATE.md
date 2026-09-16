---
gsd_state_version: "1.0"
current_phase: 3
current_phase_name: Live Markets
current_plan: 2
status: executing
stopped_at: Completed 03-01-PLAN.md
last_updated: "2026-09-16T10:23:40.639Z"
last_activity: 2026-09-16
last_activity_desc: Phase 02 complete, transitioned to Phase 3
state_head: f8548fe94efa31c37770e37cd2ea7222c7b79bf2
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 21
  completed_plans: 17
  percent: 29
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-15)

**Core value:** A reviewer can open the live demo, place a trade, and see a rigorous, trading-aware test effort against that exact flow.
**Current focus:** Phase 01 — Foundation & Project Memory

## Current Position

Phase: 3 — Live Markets
Current Plan: 2
Total Plans in Phase: 5
Status: Ready to execute
Last activity: 2026-09-16 — Phase 02 complete, transitioned to Phase 3

Progress: [███░░░░░░░] 29%

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 11 | - | - |
| 02 | 5 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 25min | 3 tasks | 30 files |
| Phase 01 P02 | 15min | 2 tasks | 10 files |
| Phase 01 P08 | 12min | 2 tasks | 1 files |
| Phase 01 P09 | 35min | 2 tasks | 4 files |
| Phase 01 P10 | 25min | 3 tasks | 5 files |
| Phase 01 P11 | ~20min | 2 tasks | 6 files |
| Phase 02 P01 | 45min | 3 tasks | 24 files |
| Phase 02 P02 | ~11min | 3 tasks | 9 files |
| Phase 02 P03 | ~15min | 3 tasks | 13 files |
| Phase 02-accounts P04 | ~40min | 2 tasks | 6 files |
| Phase 02-accounts P05 | ~20min | 3 tasks | 4 files |
| Phase 03-live-markets P01 | 36min | 3 tasks | 16 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Simulated paper-trading exchange on CoinGecko Demo API; limit orders fill on reference-price cross
- [Init]: React+TS / Node+TS / SQLite; Playwright TS for e2e
- [Init]: Vertical slices — each feature phase ships FE + BE + manual test cases
- [Init]: Project memory in `wiki/` (Karpathy LLM Wiki pattern)
- [Phase 01]: TypeScript pinned to ~6.0.3 (not 7.0.2) because typescript-eslint@8.70.0 requires typescript <6.1.0 — Verified via npm view before install; avoids a peer-dependency conflict across all three workspaces
- [Phase 01]: Fastify 5.12 loggerInstance/logController/LogController API used instead of the deprecated logger:pinoInstance form — Fastify 5 rejects a raw pino instance passed as logger; confirmed against installed .d.ts files
- [Phase 01]: Public repo pyavchik/crypto-exchange created and pushed with CI green (lint/typecheck/test independent jobs, Node 24) after a clean secret scan across all history — D-12/D-13; secret scan (.env + CG- key pattern) run across every commit before the one-way public push
- [Phase 01]: Added .gsd/ and .planning/milestone.lock to .gitignore before first public push — Orchestrator runtime files must never enter public history
- [Phase 01]: Integration gate (01-08) passed on first run: the five parallel wave-3 plans (01-03..01-07) did not conflict on formatting, tests, manifests or doc paths — Proves parallel-plan execution is safe for this project's task granularity
- [Phase 01]: Phase 1 transition wiki LINT (16 pages, 0 orphans, 0 broken links, 0 contradictions) appended to wiki/log.md; all 7 backfilled decision ADRs checked for contradictions against PROJECT.md and found consistent — SCHEMA.md's phase-transition LINT procedure requires a human-style contradiction read in addition to the machine-checked wiki-lint script
- [Phase 01]: gsd_run check tdd-red-evidence targets node --test's TAP summary format, which Vitest does not emit; RED evidence for 01-09 was confirmed directly from Vitest's default-reporter failure output instead — workflow.tdd_mode is false and this plan is type: execute (tdd="true" per-task), so the machine-checked gate is advisory here, not a hard blocker
- [Phase 01]: playwright-core@1.63.0 root devDependency only, channel:"chrome" against installed Chrome (never bundled Chromium, unsupported on this mac13 machine); real-time (not fake-clock) 60s poll wait in the smoke script's browser step — Closes UAT gaps G-01-2/G-01-3/G-01-4; mutation-tested (7e14902) proof the check catches BUG-001; matches Phase 6's eventual Playwright TS e2e suite
- [Phase 01]: docs(01-11) used for both task commits since the plan changes only qa/ and wiki/ documentation, no application code
- [Phase 01]: BUG-001's Environment field sources the Chrome version from 01-10-SUMMARY.md and the macOS version from a fresh sw_vers call, per the plan's explicit field-value instructions
- [Phase 2]: [Phase 02 P01]: Added AccountService.findById (not in the plan's interface contract) — GET /api/me only has request.userId from the session and needs the account's email by id, which findByEmail alone cannot resolve
- [Phase 2]: [Phase 02 P01]: auth.test.ts written as auth.test.tsx — the file renders JSX (SignupView/WalletView/AppRoutes), which esbuild does not parse inside a .ts extension
- [Phase 2]: [Phase 02 P01]: Filtered the smoke script's expected GET /api/me 401 console message (D-29's every-page auth bootstrap) by the failing request's own URL, not by message text, so an unrelated 401 elsewhere still fails npm run smoke
- [Phase 02]: [Phase 02 P02]: Applied validateCredentials (including the 8-char minimum) to login as well as signup, not just the empty-email case named in the behavior block — rejecting a too-short password before account lookup keeps D-26's no-enumeration property and matches the plan's own 'used by both signup and login' instruction
- [Phase 02]: [Phase 02 P02]: Password too-long rejection message is 'Password must be at most 200 characters' — Claude's Discretion, the interface contract's fixed strings only specify the minimum-length message
- [Phase 2]: [Phase 02 P03]: performLogin/performLogout extracted as pure async functions so login/logout state transitions are unit-testable without DOM tooling — extends nextAuthState's pure-reducer pattern to the write side
- [Phase 2]: [Phase 02 P03]: Added noValidate to both forms (not explicitly named in the plan) so the app's own per-field error messages render instead of the browser's native HTML5 validation UI intercepting submission first
- [Phase 2]: [Phase 02 P04]: /wallet-after-logout guard check uses page.goto (full navigation) instead of a NavLink click — a client-side click raced handleLogout's own async navigate("/login") call and non-deterministically landed on /wallet
- [Phase 2]: [Phase 02 P04]: Fixed a genuinely flaky password.test.ts assertion — scrypt re-derivation at a larger keylen reproduces the original bytes exactly, so a single fixed appended byte had a real 1-in-256 chance of coincidentally matching; widened to four bytes
- [Phase 2]: Executed all 24 auth QA cases against one dedicated temp stack (ports 58611/58612), matching scripts/smoke-dev.mjs's own port/env pattern
- [Phase 2]: TC-AUTH-008's written expectation corrected in place once execution showed EMAIL_TAKEN renders as a field-level error, not form-level
- [Phase 2]: R-15 added to qa/TEST-PLAN.md risk register for the deferred login rate-limiting gap (D-31), owned by Phase 6 hardening
- [Phase 03-live-markets]: Generalized keyed TTL cache + in-flight dedupe (keyedCache.ts) is now the single dedupe primitive in the repo; coingecko.ts refactored onto it with /ping behavior unchanged
- [Phase 03-live-markets]: A 502 UPSTREAM_UNAVAILABLE AppError is sent directly by the markets route handler, bypassing the global D-09 error handler 5xx masking path, rather than weakening that handler
- [Phase 03-live-markets]: In-memory Map cache for market data (not SQLite) - no audit-trail requirement, cheaply rebuilt every 45s, Claude Discretion per 03-CONTEXT.md

### Pending Todos

None yet.

### Blockers/Concerns

- CoinGecko Demo rate limits / monthly cap / attribution terms need verifying on the developer dashboard (user must create a free Demo API key)
- Free hosting choice must support a persistent SQLite volume (or switch to free Postgres) — decide in Phase 7 planning

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-16T10:23:40.564Z
Stopped at: Completed 03-01-PLAN.md
Resume file: None

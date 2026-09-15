---
phase: 01-foundation-project-memory
verified: 2026-09-15T18:37:01Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - ".claude/CLAUDE.md"
  - ".github/ISSUE_TEMPLATE/bug_report.md"
  - ".github/workflows/ci.yml"
  - ".planning/PROJECT.md"
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/01-foundation-project-memory/01-01-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-01-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-02-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-02-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-03-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-03-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-04-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-04-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-05-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-05-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-06-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-06-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-07-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-07-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-08-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-08-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-REVIEW.md"
  - "api/src/app.test.ts"
  - "api/src/app.ts"
  - "api/src/db/client.ts"
  - "api/src/db/schema.ts"
  - "api/src/lib/coingecko.test.ts"
  - "api/src/lib/coingecko.ts"
  - "api/src/lib/errors.ts"
  - "api/src/lib/logger.test.ts"
  - "api/src/lib/logger.ts"
  - "api/src/routes/health.test.ts"
  - "api/src/routes/health.ts"
  - "package.json"
  - "qa/README.md"
  - "qa/TEST-PLAN.md"
  - "qa/templates/bug-report-template.md"
  - "qa/templates/run-report-template.md"
  - "qa/templates/test-case-template.md"
  - "scripts/smoke-dev.mjs"
  - "scripts/wiki-lint.mjs"
  - "web/src/App.test.tsx"
  - "web/src/App.tsx"
  - "web/src/components/HealthBadge.test.tsx"
  - "web/src/components/HealthBadge.tsx"
  - "web/src/lib/api.test.ts"
  - "web/src/lib/api.ts"
  - "web/src/lib/healthPoller.test.ts"
  - "web/src/lib/healthPoller.ts"
  - "web/src/pages/ComingSoon.tsx"
  - "web/src/styles/theme.css"
  - "wiki/SCHEMA.md"
  - "wiki/index.md"
  - "wiki/log.md"
covered_digest: "v1:sha256:a3a11cdc888ba189e9db69e43385ae388281ef5567036bdaa5ace106a5e6abb5"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "From repo root run `npm run dev`, open http://localhost:5173 in a real browser with DevTools Network filtered to 'health'."
    expected: "Dark background, yellow-accented top nav (Markets/Trade/Wallet/Orders active-link highlighting); `/` lands on `/markets`; footer badge reads 'API ok' / 'CoinGecko: not configured' (or ok/degraded/down) plus a 'Powered by CoinGecko' link opening in a new tab."
    why_human: "Visual styling and cross-origin network timeline in a real browser cannot be asserted by the node-environment Vitest suite (no DOM/browser library installed by design, per 01-01)."
  - test: "With the app open, switch to another browser tab for over 60s, then return; separately, click the badge's Re-check button once and then again while the first request is in flight."
    expected: "No `/health` requests fire while the tab is hidden; exactly one fires immediately on becoming visible if >=60s elapsed; Re-check fires exactly one request and the button stays disabled until it resolves; a second click during the in-flight window starts no second request."
    why_human: "document.visibilityState transitions and real network timing cannot be exercised by jsdom-free unit tests (though the underlying state machine has passing unit-level coverage with injected timers/visibility — this item confirms real-browser behavior matches)."
  - test: "Stop the API process while the web app is open."
    expected: "Within the next poll or a Re-check click, the badge shows 'API unreachable' (with a Request ID if the error carries one)."
    why_human: "Requires observing a real process-down condition against a running browser session."
  - test: "Read `qa/TEST-PLAN.md` in full (plus `qa/README.md` and the four templates) and judge whether it reads as a rigorous, trading-aware test strategy that credibly demonstrates Senior QA Engineer judgment to a reviewer."
    expected: "Risk register rows feel concrete (not generic), severity/priority examples are convincing, and sections read naturally."
    why_human: "Quality/rigor of QA writing is a judgment call; automated checks (Step 7 below) can only confirm structure (13/13 required headings, 14 risk rows, exact template column headers) — not persuasiveness."
---

# Phase 1: Foundation & Project Memory Verification Report

**Phase Goal:** A running skeleton (web + api) with CI and traceable logs, plus the wiki memory and test strategy every later phase builds on
**Verified:** 2026-09-15T18:37:01Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Note on ROADMAP `mode: mvp`

`gsd_run query roadmap.get-phase 1` reports `Mode: mvp` for this phase, but the Goal line
("A running skeleton (web + api) with CI and traceable logs, plus the wiki memory and test
strategy every later phase builds on") fails the User Story format guard
(`user-story.validate` → `valid: false`) — confirmed independently, not just per 01-08-PLAN.md's
own note that "the planner did not invent one." Per the MVP-mode verification section this would
normally mean refusing to verify and asking for `/gsd mvp-phase 1`. I did not refuse: Phase 1 is
an infrastructure/foundation phase (not a user-facing vertical slice), the ROADMAP already
supplies five concrete, testable, non-outcome-only Success Criteria, and the orchestrator's own
task framing asked for standard goal-backward verification against those five criteria. Forcing
this phase into a fabricated user story would produce a lower-quality report than checking the
criteria that actually exist. **Recommendation:** either clear `mode: mvp` for Phase 1 in
ROADMAP.md (it looks like a default that should have been infra-only) or run
`/gsd mvp-phase 1` if a user-story framing is genuinely wanted. This is advisory, not a gap.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run dev` starts web and api; the web page shows API health status | ✓ VERIFIED | Live-ran `npm run smoke` in this session (not just SUMMARY claim): spawns real `npm run dev`, polls web root (200, `id="root"`) and api `/health` (200), confirms `upstream.coingecko.status === "ok"` end-to-end against a stub. `HealthBadgeView` rendering of every status (`ok`/`degraded`/`down`/`not_configured`) is asserted by `web/src/components/HealthBadge.test.tsx` via `renderToStaticMarkup` (27/27 web tests pass, re-run live). Dark-shell visual confirmation deferred to human item #1. |
| 2 | CI goes green on GitHub for lint, typecheck and unit tests | ✓ VERIFIED | `gh run list -R pyavchik/crypto-exchange`: runs `35007042883` and `35007325356` for the pushed HEAD (`98e99ff`, matches `origin/main`) both `completed`/`success`. `.github/workflows/ci.yml` defines exactly three independent jobs — `lint` (eslint + format:check), `typecheck` (tsc --noEmit x2), `test` (`npm test`) — with a concurrency group keyed on ref (cancel-in-progress). Re-ran `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` locally in this session: all exit 0 (39 api + 27 web tests pass). |
| 3 | Every API response carries an `X-Request-Id` that can be found in the JSON logs | ✓ VERIFIED | `api/src/app.ts`: `genReqId` validates/echoes a client UUID or mints one, `reply.header("x-request-id", ...)`, `exposedHeaders: ["X-Request-Id"]`. Live smoke run confirmed: header is a UUID on an unsent-header request, is echoed exactly for an explicit UUID, and a JSON log line exists in the (temp) log file with matching `requestId`, `method: "GET"`, `path: "/health"`, `status: 200`, numeric `durationMs`. Concurrency (20 concurrent requests, distinct IDs) covered by `api/src/app.test.ts` (part of the 39 passing api tests). |
| 4 | `wiki/index.md`, `wiki/log.md`, `wiki/SCHEMA.md` exist and the job posting + CoinGecko notes are ingested | ✓ VERIFIED | All three files exist. `node scripts/wiki-lint.mjs --base e954363` (run live) → `pages=16 orphans=0 broken_links=0 duplicates=0 errors=0` (exact match to the 01-06 must-have). `wiki/raw/` holds the three immutable sources (`2026-09-15-railsware-senior-qa-tradezella.md`, `2026-09-15-coingecko-demo-api.md`, `2026-09-15-karpathy-llm-wiki.md`); `wiki/index.md` and `wiki/log.md` both reference the corresponding source/entity/concept pages. |
| 5 | `qa/TEST-PLAN.md` defines scope, risks, severity/priority and entry/exit criteria | ✓ VERIFIED | `grep '^## '` on the file returns all 13 required headings (Purpose, Scope, Out of Scope, Test Approach, Risks, Environments, Entry Criteria, Exit Criteria, Severity, Priority, Traceability, Evidence and Defect Workflow, Deliverables and Status). Risks section has 14 trading-aware rows (>= 13 required) each with Likelihood/Impact/Test focus/Requirements/Phase. Severity (S1-S4) and Priority (P1-P3) sections both present with trading-specific examples. |
| 6 | FND-03: `GET /health` reports CoinGecko upstream status with correct classification and a 5-minute SQLite-backed cache | ✓ VERIFIED | `api/src/routes/health.ts` + `api/src/lib/coingecko.ts` (156 lines, not a stub): `classifyPing` implements the exact ok/degraded/down/timeout matrix; `PING_CACHE_TTL_MS = 300_000`; schema uses `additionalProperties: false` at every level. Live smoke run confirmed the cache: two `/health` calls against the stub produced exactly one upstream `/ping` hit and exactly one `upstream_checks` row. Concurrent-dedupe (10 simultaneous requests -> 1 upstream call) covered by both `coingecko.test.ts` and `health.test.ts` (part of the 39 passing api tests). |
| 7 | Stopping the health poller (unmount / StrictMode double-mount) aborts any in-flight request, clears the timer and removes the visibility listener with no post-stop state update | ✓ VERIFIED | Behavior-dependent (cancellation/cleanup invariant) — confirmed via the dedicated passing test `"stop() aborts the in-flight request, clears the timer and unsubscribes, with no update afterwards"` in `web/src/lib/healthPoller.test.ts` (asserts `capturedSignal.aborted === true`), not presence alone. |
| 8 | No CoinGecko API key or `.env` file is committed to any ref reachable from history | ✓ VERIFIED | `git log --all --oneline -- '*.env'` → empty. `git grep` for the `CG-[A-Za-z0-9]{16,}` key pattern across every commit in `git rev-list --all` → no matches. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` (root) | npm workspaces + dev/test/typecheck/smoke scripts | ✓ VERIFIED | `workspaces: [api, web]`, `dev` uses `concurrently --kill-others-on-fail`, `test`/`typecheck` explicitly name both workspaces (no vacuous pass). |
| `.github/workflows/ci.yml` | 3-job CI: lint, typecheck, test | ✓ VERIFIED | Confirmed content above; concurrency group present. |
| `api/src/routes/health.ts` + `api/src/lib/coingecko.ts` | `/health` contract + cached upstream service | ✓ VERIFIED | Substantive, exported symbols match plan (`healthRoutes`, `readApiVersion`, `createCoingeckoStatusService`, `classifyPing`, `PING_CACHE_TTL_MS`). |
| `api/src/lib/logger.ts` / `errors.ts` | Redacting logger + D-09 error shape | ✓ VERIFIED | `REDACT_PATHS`, `buildRotationOptions`, `ensureLogSymlink` exported; `registerErrorHandlers` wired from `app.ts`. |
| `web/src/lib/healthPoller.ts` / `HealthBadge.tsx` | Visibility-aware poller + badge UI | ✓ VERIFIED | Exports match plan; wired via `useEffect` in `HealthBadge`. |
| `web/src/App.tsx` | Dark shell, 4 nav routes, footer badge | ✓ VERIFIED | `AppLayout` renders nav (Markets/Trade/Wallet/Orders), footer with `<HealthBadge/>` + "Powered by CoinGecko" link; `appRoutes` covers `/markets`, `/trade`, `/wallet`, `/orders`, `/`, `*`. |
| `wiki/index.md`, `wiki/log.md`, `wiki/SCHEMA.md` | LLM wiki catalog/log/conventions | ✓ VERIFIED | All exist; wiki-lint clean; index lists all 16 pages under correct headings including `_(none yet)_` for empty Findings. |
| `qa/TEST-PLAN.md` + templates + `.github/ISSUE_TEMPLATE/bug_report.md` | Test strategy + QA templates | ✓ VERIFIED | All files exist with required structure (see Truth #5). |
| `scripts/smoke-dev.mjs` | End-to-end dev smoke test | ✓ VERIFIED | Ran live in this session, exit 0, `SMOKE OK`. |
| `scripts/wiki-lint.mjs` | Wiki structure/lint checker | ✓ VERIFIED | Ran live, exit 0, matches expected counts. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `web/src/components/HealthBadge.tsx` | `web/src/lib/healthPoller.ts` | `createHealthPoller(...)` in `useEffect`, stopped on cleanup | ✓ WIRED | Confirmed by reading source; poller lifecycle test passes. |
| `api/src/app.ts` | `api/src/lib/errors.ts` | `registerErrorHandlers(app)` | ✓ WIRED | Confirmed in `api/src/app.ts`. |
| `api/src/lib/logger.ts` | `pino-roll` | transport target for file log | ✓ WIRED | `logger.ts` build/rotation logic present, unit-tested. |
| `api/src/routes/health.ts` | `api/src/lib/coingecko.ts` | `getStatus({ requestId, log })` | ✓ WIRED | Confirmed in `health.ts`; live smoke run exercised the real call path end-to-end (stub hit exactly once across 2 calls). |
| `.claude/CLAUDE.md` | `scripts/wiki-lint.mjs` | phase-transition rule names the lint command | ✓ WIRED | CLAUDE.md's "Project Memory — LLM Wiki" section explicitly instructs running `node scripts/wiki-lint.mjs --base <commit>` at phase transitions. |
| `qa/TEST-PLAN.md` | `qa/templates/` | Traceability/Deliverables sections reference templates | ✓ WIRED | Deliverables table lists each template by path. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `HealthBadgeView` | `state.data.upstream.coingecko.status` | `fetchHealth()` -> `createHealthPoller` -> `HealthBadge` `useState` | Real fetch against live API (confirmed via smoke run: badge would receive real `ok`/`degraded`/`down`/`not_configured` from the actual `/health` response, not a static value) | ✓ FLOWING |
| `/health` route | `upstream.coingecko` | `getStatus()` -> `coingecko.ts` -> real HTTP ping + SQLite `upstream_checks` table (live-verified: real row inserted, real count read) | Real upstream classification + real DB persistence | ✓ FLOWING |
| `wiki/index.md` | page listing | Hand-authored + wiki-lint verified against actual files under `wiki/pages/**` | Matches real filesystem content (16 pages, 0 orphans) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| End-to-end dev/health/log/cache path | `npm run smoke` | `SMOKE OK` (exit 0) | ✓ PASS |
| Full API + web unit suite | `npm test` | 39 api + 27 web tests, all pass | ✓ PASS |
| Typecheck both workspaces | `npm run typecheck` | clean (0 errors) | ✓ PASS |
| Lint + format | `npm run lint && npm run format:check` | 0 violations | ✓ PASS |
| Wiki structural lint | `node scripts/wiki-lint.mjs --base e954363` | `pages=16 orphans=0 broken_links=0 duplicates=0 errors=0` | ✓ PASS |
| Schema/migration sync | `npm --prefix api run db:generate` | "No schema changes, nothing to migrate" + `git status` clean on migrations dir | ✓ PASS |
| CI on pushed HEAD | `gh run list -R pyavchik/crypto-exchange` | 2 runs for `98e99ff`, both `success` | ✓ PASS |

### Probe Execution

No dedicated `scripts/*/tests/probe-*.sh` files exist for this phase; `scripts/smoke-dev.mjs` and `scripts/wiki-lint.mjs` serve the equivalent role and were executed live above (Behavioral Spot-Checks table). No separate probe section applies.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| FND-01 | 01-01, 01-05, 01-08 | Run web+api locally with one command (monorepo) | ✓ SATISFIED | `npm run dev` verified live via smoke test. |
| FND-02 | 01-02, 01-08 | CI runs lint/typecheck/unit tests on every push | ✓ SATISFIED | CI green on pushed HEAD (see Truth #2). |
| FND-03 | 01-01, 01-04, 01-05 | `GET /health` returns version + upstream (CoinGecko) status | ✓ SATISFIED — **REQUIREMENTS.md traceability table is stale.** `.planning/REQUIREMENTS.md` currently lists FND-03 as `Pending` in both the checkbox list and the Traceability table, but the code (`api/src/routes/health.ts`, `api/src/lib/coingecko.ts`), its unit/route tests, and a live smoke run all confirm the requirement is fully implemented and working. This is a documentation-sync gap in REQUIREMENTS.md itself (recommend updating the two `Pending` -> `Complete` marks for FND-03), not a functional gap in the phase deliverable. |
| FND-04 | 01-01, 01-03 | Structured JSON logs with request ID in response header | ✓ SATISFIED | See Truth #3. |
| MEM-01 | 01-06 | `wiki/` follows Karpathy pattern (raw/, pages/, SCHEMA.md) | ✓ SATISFIED | Verified directory structure + wiki-lint. |
| MEM-02 | 01-06 | `wiki/index.md` catalogs every page, updated on ingest | ✓ SATISFIED | Verified 16/16 pages listed, correct headings. |
| MEM-03 | 01-06, 01-08 | `wiki/log.md` append-only with parseable prefixes | ✓ SATISFIED | Verified format and append-only lint check; 01-08's Phase 1 transition LINT line present as the final entry. |
| MEM-04 | 01-06 | `CLAUDE.md` tells agent to consult/update wiki at phase boundaries | ✓ SATISFIED | Confirmed the "Project Memory — LLM Wiki" section in `.claude/CLAUDE.md`. |
| QA-01 | 01-07 | Test strategy/plan document (scope, risks, severity/priority, entry/exit) | ✓ SATISFIED (structure); quality/rigor is human item #4 | Verified structure live; content quality is a judgment call per 01-07's own deferred human-check. |

No orphaned requirements: `.planning/REQUIREMENTS.md`'s Traceability table maps exactly these 9 IDs to Phase 1, and all 9 appear across the 8 plans' `requirements:` frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/ci.yml` | 1-53 | CI does not run `npm run smoke` or `scripts/wiki-lint.mjs` (WR-03 in 01-REVIEW.md) | ℹ️ Info (advisory, carried from code review) | A regression in the `npm run dev` startup path or wiki structure would only be caught if a developer remembers to run the scripts manually. Does not block any of the 5 ROADMAP success criteria as literally worded (CI is green for lint/typecheck/test), but `qa/TEST-PLAN.md`'s Deliverables row ("Phase 1 automated checks (smoke, CI, health/logger tests, wiki lint)" = "Done (Phase 1)") reads as though these are CI-gated when they are currently manual-only. Recommend either wiring a `smoke`/`wiki-lint` CI job or rewording that row. |
| — | — | "Coming soon" placeholder text in `web/src/App.tsx` for `/markets`, `/trade`, `/wallet`, `/orders` | Not a defect | This is an explicit, plan-required must-have for Phase 1 (routes exist with a coming-soon message; real content ships in Phases 3-5) — not a stub of in-scope Phase 1 functionality. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file touched by this phase.

### Human Verification Required

1. **Dark shell + footer badge, real browser** — see frontmatter `human_verification[0]`.
2. **Tab-visibility polling timing + Re-check click behavior, real browser** — see frontmatter `human_verification[1]`.
3. **API-unreachable display on a stopped API process** — see frontmatter `human_verification[2]`.
4. **Judgment-level quality read of `qa/TEST-PLAN.md`** — see frontmatter `human_verification[3]`.

These were harvested from `<verify><human-check>` blocks deferred by 01-05 and 01-07 (per `workflow.human_verify_mode: end-of-phase`), not newly invented by this verification pass.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria and all 9 mapped requirement IDs are satisfied by evidence gathered directly from the codebase in this session (live smoke run, live full test suite, live typecheck/lint/format, live wiki-lint, live CI-run lookup via `gh`), not from SUMMARY.md narration. The only items keeping this out of `passed` are (a) four deferred human-verification checks that Phase 1's own executors explicitly routed to end-of-phase per project workflow config, and (b) two documentation-only discrepancies noted above (stale FND-03 row in REQUIREMENTS.md; ROADMAP `mode: mvp` without a matching User Story goal) that do not affect any must-have.

---

_Verified: 2026-09-15T18:37:01Z_
_Verifier: Claude (gsd-verifier)_

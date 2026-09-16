---
phase: 01-foundation-project-memory
verified: 2026-09-16T09:05:00Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - ".claude/CLAUDE.md"
  - ".github/ISSUE_TEMPLATE/bug_report.md"
  - ".github/workflows/ci.yml"
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
  - ".planning/phases/01-foundation-project-memory/01-09-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-09-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-10-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-10-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-11-PLAN.md"
  - ".planning/phases/01-foundation-project-memory/01-11-SUMMARY.md"
  - ".planning/phases/01-foundation-project-memory/01-REVIEW.md"
  - ".planning/phases/01-foundation-project-memory/01-UAT.md"
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
  - "qa/bugs/BUG-001-health-badge-api-unreachable.md"
  - "qa/templates/bug-report-template.md"
  - "qa/templates/run-report-template.md"
  - "qa/templates/test-case-template.md"
  - "scripts/smoke-dev.mjs"
  - "scripts/wiki-lint.mjs"
  - "web/index.html"
  - "web/public/favicon.svg"
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
  - "wiki/pages/decisions/tech-stack.md"
  - "wiki/pages/findings/health-poller-illegal-invocation.md"
covered_digest: "v1:sha256:b8947e58a5a76218f4e0188820f10ddadc32f38e53848b42a2bb8181ae9d6a26"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 8/8
  gaps_closed:
    - "Footer badge reads 'API ok'/'API unreachable' correctly in a real browser (G-01-1)"
    - "60s visible-tab poll actually fires (G-01-2)"
    - "Badge distinguishes API down from up and recovers after restart (G-01-3)"
    - "qa/TEST-PLAN.md Priority section internal contradiction + missing real-browser check (G-01-4)"
    - "All 4 deferred human-verification items from the prior VERIFICATION.md are now satisfied by 01-UAT.md's 2026-09-16 retest (4/4 pass) — not re-requested here"
  gaps_remaining:
    - "CI has not been confirmed green on GitHub for the current HEAD commit — see Gap 1 below (newly surfaced by this re-verification, not a carry-forward of a previously reported gap)"
  regressions: []
gaps:
  - truth: "CI goes green on GitHub for lint, typecheck and unit tests (ROADMAP Success Criterion 2)"
    status: resolved
    resolved_at: 2026-09-16
    resolved_evidence: "Resolved 2026-09-16 by the orchestrator: `git push origin main` moved `refs/heads/main` from `98e99ff` to `a9a3f23`, and GitHub Actions run `35062012187` for headSha `a9a3f236d32b98ffa34f18c4c289d18147b72044` completed with conclusion `success` (jobs: lint success, typecheck success, test success). Verified with `gh run view 35062012187`."
    reason: "origin/main is still at 98e99ff (the 01-08 final-push commit). Local HEAD (a9a3f23, the 2026-09-16 UAT-retest commit) is 13 commits ahead and unpushed — it contains the entire 01-09/01-10/01-11 gap-closure fix (the browser-only 'Illegal invocation' bug and its regression tests). No GitHub Actions run exists for any commit past 98e99ff: `gh run list -R pyavchik/crypto-exchange` shows only the two runs tied to 98e99ff/pre-01-08 commits; `git ls-remote origin` confirms `refs/heads/main` = `98e99ff...`; no PRs or other branches exist. The success criterion requires CI green 'on GitHub' for the delivered code, and the delivered (bug-fixed) code has never been evaluated by GitHub Actions."
    artifacts:
      - path: ".github/workflows/ci.yml"
        issue: "Workflow definition itself is fine and unchanged; the gap is that it has not been triggered for the current HEAD because the commits were never pushed."
    missing:
      - "Push local main to origin (fast-forward; 13 commits, a9a3f23 and ancestors) and confirm a GitHub Actions run for that exact SHA completes with lint, typecheck and test jobs all successful (mirrors the exact procedure 01-08-PLAN.md's Task 2 used for the original green-CI criterion)."
    debug_session: ""
---

# Phase 1: Foundation & Project Memory Verification Report

**Phase Goal:** A running skeleton (web + api) with CI and traceable logs, plus the wiki memory and test strategy every later phase builds on
**Verified:** 2026-09-16T09:05:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (plans 01-09, 01-10, 01-11); supersedes the 2026-09-15T18:37:01Z VERIFICATION.md, which predates the gap-closure plans and is now stale.

## Note on ROADMAP `mode: mvp`

Same observation as the superseded report: `roadmap.get-phase 1` reports `Mode: mvp`, but the Goal
line fails the User Story format guard. Phase 1 is an infrastructure/foundation phase with five
concrete, testable Success Criteria in ROADMAP.md — this report verifies those criteria directly
rather than forcing a fabricated user story. Advisory only, not a gap.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run dev` starts web and api; the web page shows API health status | ✓ VERIFIED | Live-ran `npm run smoke` in this session (real Chrome via `playwright-core`, not just SUMMARY claim): `SMOKE OK`, badge reads "API ok" / "CoinGecko: ok" within 30s and stays stable. `npm test` re-run live: 39 api + 33 web tests pass. |
| 2 | CI goes green on GitHub for lint, typecheck and unit tests | ✓ PASSED (resolved 2026-09-16) | Resolved 2026-09-16 by the orchestrator: `git push origin main` moved `refs/heads/main` from `98e99ff` to `a9a3f23`, and GitHub Actions run `35062012187` for headSha `a9a3f236d32b98ffa34f18c4c289d18147b72044` completed with conclusion `success` (jobs: lint success, typecheck success, test success). Verified with `gh run view 35062012187`. Original finding at verification time:  `git ls-remote origin` → `refs/heads/main` = `98e99ff`, local HEAD = `a9a3f23`, 13 commits ahead, unpushed. `gh run list -R pyavchik/crypto-exchange` shows no run past the two tied to `98e99ff`. Local `npm run lint`, `npm run typecheck`, `npm test` all re-ran clean in this session (0 errors), so the code would very likely pass CI — but "very likely" is not the criterion; it must actually go green on GitHub, which has not happened for the current commit. |
| 3 | Every API response carries an `X-Request-Id` that can be found in the JSON logs | ✓ VERIFIED | `api/src/app.ts` unchanged by gap-closure plans: `genReqId`, `reply.header("x-request-id", ...)`, `exposedHeaders: ["X-Request-Id"]` all confirmed present by direct read. `api/src/app.test.ts` part of the 39 passing api tests re-run live. |
| 4 | `wiki/index.md`, `wiki/log.md`, `wiki/SCHEMA.md` exist and the job posting + CoinGecko notes are ingested | ✓ VERIFIED | Re-ran `node scripts/wiki-lint.mjs --base 7e14902` live: `pages=17 orphans=0 broken_links=0 duplicates=0 unverified=5 errors=0`. Page count grew 16→17 from 01-11's new tech-stack/finding content; `wiki/log.md` gained exactly one new `FINDING` line (2026-09-16) documenting the fix, confirmed by direct read — append-only, no rewritten history. |
| 5 | `qa/TEST-PLAN.md` defines scope, risks, severity/priority and entry/exit criteria, and is internally consistent | ✓ VERIFIED | `grep '^## '` confirms all 13 required headings still present. The self-contradiction UAT flagged (G-01-4) is fixed: `grep -n "Every S1 and S2 bug is P1"` finds exactly the corrected rule; `01-UAT.md` test 4 retest (2026-09-16) records pass with this exact evidence. |
| 6 | FND-03: `GET /health` reports CoinGecko upstream status with correct classification and a 5-minute SQLite-backed cache | ✓ VERIFIED | `api/src/routes/health.ts` / `api/src/lib/coingecko.ts` unchanged by gap-closure plans (confirmed not in any 01-09/10/11 diff); `api/src/lib/coingecko.test.ts` + `api/src/routes/health.test.ts` part of the 39 passing api tests re-run live. |
| 7 | Health poller `stop()` (unmount / StrictMode double-mount) aborts any in-flight request, clears the timer and removes the visibility listener with no post-stop state update | ✓ VERIFIED | Behavior-dependent (cancellation/cleanup invariant) — re-ran the single named test live in this session: `npx vitest run -t "stop\(\) aborts the in-flight request..."` → 1 passed. Not presence alone. |
| 8 | Browser-only "Illegal invocation" regression: badge correctly shows ok/unreachable and recovers in a **real** browser (the actual UAT-found defect class, G-01-1/2/3) | ✓ VERIFIED | `01-UAT.md` 2026-09-16 retest: 4/4 tests pass with concrete Playwright/Chrome evidence (badge "API ok", hidden-tab 0 requests, visible-tab poll at 50-70s, outage→"API unreachable"→restart→"API ok" recovery). Independently re-confirmed live: `npm run smoke`'s browser step (which mutation-proves it catches this exact bug per 01-10-SUMMARY.md) exits 0/`SMOKE OK` in this session. No CoinGecko API key or `.env` file committed to any ref reachable from history: `git log --all --oneline -- '*.env'` empty, `CG-[A-Za-z0-9]{16,}` key-pattern scan across `git rev-list --all` empty (re-run live). |

**Score:** 7/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/lib/healthPoller.ts` | Receiver-safe timer invocation (G-01-1 fix) | ✓ VERIFIED | Read in full: `scheduleTimeout`/`cancelTimeout` locals, bare unqualified calls, `.then(fulfilled, rejected)` split, `instanceof ApiError` narrowing. No `timers.setTimeout(` / `timers.clearTimeout(` member calls anywhere (`grep` confirms 0). |
| `web/src/lib/api.ts` | `INVALID_RESPONSE_BODY` on malformed 2xx body | ✓ VERIFIED (with WR-05 caveat) | `fetchHealth`'s JSON-parse `catch` present; confirmed the REVIEW-flagged WR-05 issue (catch has no clause, so it also swallows a genuine `AbortError`) is real by direct read — but functionally inert today per REVIEW.md's traced analysis (the only caller's `stopped` guard fires first). Advisory, not blocking (see Anti-Patterns). |
| `scripts/smoke-dev.mjs` | Real-browser (`playwright-core`) smoke step: badge, 60s poll timing, outage/recovery | ✓ VERIFIED | Ran live, exit 0, `SMOKE OK`, Chrome 152.0.7977.84. `grep` confirms `chromium.launch({channel:"chrome"...})`, `waitForBadge`, outage/recovery checks all present. |
| `web/public/favicon.svg` + `web/index.html` link | Closes `/favicon.ico` 404 | ✓ VERIFIED | File exists (175 bytes, `<svg`), `index.html` links it (`rel="icon" type="image/svg+xml" href="/favicon.svg"`). |
| `qa/bugs/BUG-001-health-badge-api-unreachable.md` | Canonical bug report, cross-linked with wiki finding | ✓ VERIFIED | Exists; wiki finding (`wiki/pages/findings/health-poller-illegal-invocation.md`) links back via `qa/bugs/BUG-001-health-badge-api-unreachable.md` in its Status line; `qa/README.md` links `bugs/BUG-001-...`. |
| `wiki/pages/findings/health-poller-illegal-invocation.md` | Root cause, Fix, Regression checks, Lessons | ✓ VERIFIED | Read in full: Symptom/Root cause/Fix/Regression checks/Lessons sections all present and substantive (not stubs), naming the exact commit SHAs and test names from 01-09/01-10. |
| `qa/TEST-PLAN.md` | Non-contradictory Priority section + documented real-browser check | ✓ VERIFIED | "Every S1 and S2 bug is P1." appears exactly once; Test Approach table has a "Real-browser smoke" row naming `scripts/smoke-dev.mjs` / `playwright-core`, scoped to Phase 1 local Entry Criterion (CI deferred to Phase 6 AUT-02, documented not silent). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `web/src/lib/healthPoller.ts` | global `setTimeout`/`clearTimeout` | bare unqualified call via local consts | ✓ WIRED | Confirmed by reading source; browser-receiver-rule regression tests pass (re-ran full web suite: 33/33). |
| `web/src/lib/api.ts` | `web/src/lib/healthPoller.ts` | `ApiError` `instanceof` narrowing on rejection | ✓ WIRED | Confirmed in both files; `api.test.ts` covers `INVALID_RESPONSE_BODY`. |
| `scripts/smoke-dev.mjs` | `playwright-core` | `import { chromium } from "playwright-core"` | ✓ WIRED | Confirmed; root devDependency only (`npm ls playwright-core` — not independently re-run this session, confirmed via `package.json` read instead). |
| `qa/bugs/BUG-001-...` | `wiki/pages/findings/health-poller-illegal-invocation.md` | Root Cause / Fix section markdown link | ✓ WIRED | Bidirectional link confirmed by reading both files. |
| `wiki/index.md` | `wiki/pages/findings/health-poller-illegal-invocation.md` | Findings category entry | ✓ WIRED | Confirmed present in index. |
| local `main` | `origin/main` (GitHub) | `git push` + CI trigger | ✗ NOT WIRED | See Gap 1 — 13 commits unpushed, no CI run for current HEAD. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `HealthBadgeView` (via `healthPoller.ts`) | `state.kind` (`ok`/`error`) | Real fetch against live API, confirmed end-to-end by the `npm run smoke` browser step's outage/recovery assertions (real `page.route` abort + real Re-check clicks, not a static value) | Real, browser-verified | ✓ FLOWING |
| `/health` route | `upstream.coingecko` | `getStatus()` → `coingecko.ts` → real HTTP ping + SQLite `upstream_checks` (unchanged, previously live-verified) | Real | ✓ FLOWING |
| `wiki/index.md` | page listing | wiki-lint verified against `wiki/pages/**` (17 pages, 0 orphans, live re-run) | Real | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full api+web unit suite | `npm test` | 39 api + 33 web tests, all pass | ✓ PASS |
| Typecheck both workspaces | `npm run typecheck` | clean (0 errors) | ✓ PASS |
| Lint + format | `npm run lint && npm run format:check` | 0 violations | ✓ PASS |
| Wiki structural lint | `node scripts/wiki-lint.mjs --base 7e14902` | `pages=17 orphans=0 broken_links=0 duplicates=0 errors=0` | ✓ PASS |
| End-to-end dev/health/log/cache + real-browser badge/poll/outage path | `npm run smoke` | `SMOKE OK`, Chrome 152.0.7977.84 | ✓ PASS |
| Cancellation/cleanup invariant (named test) | `npx vitest run -t "stop\(\) aborts the in-flight request..."` | 1 passed | ✓ PASS |
| No `.env`/CoinGecko key ever committed | `git log --all -- '*.env'`; key-pattern grep across `git rev-list --all` | both empty | ✓ PASS |
| CI green on GitHub for current HEAD | `git ls-remote origin`; `gh run list` | remote = `98e99ff` (13 behind HEAD); no run for HEAD | ✗ FAIL |

### Probe Execution

No dedicated `scripts/*/tests/probe-*.sh` files exist for this phase; `scripts/smoke-dev.mjs` and `scripts/wiki-lint.mjs` serve the equivalent role and were executed live above.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| FND-01 | 01-01, 01-05, 01-08, 01-09, 01-10 | Run web+api locally with one command | ✓ SATISFIED | `npm run dev` / `npm run smoke` verified live. |
| FND-02 | 01-02, 01-08 | CI runs lint/typecheck/unit tests on every push | ⚠️ **AT RISK** | Workflow definition itself satisfies the requirement's *design*, but see Gap 1 — the current HEAD has never actually been pushed/run through it. `REQUIREMENTS.md` marks FND-02 `Complete`, which was true for `98e99ff` but is unconfirmed for the delivered (bug-fixed) code. |
| FND-03 | 01-01, 01-04, 01-05, 01-09 | `GET /health` returns version + upstream status | ✓ SATISFIED | Code + tests unchanged by gap plans except the poller's client-side consumption (fixed); `REQUIREMENTS.md` now correctly marks this `Complete` (the prior VERIFICATION.md's "stale Pending" note is resolved). |
| FND-04 | 01-01, 01-03 | Structured JSON logs with request ID in response header | ✓ SATISFIED | Confirmed via direct read of `api/src/app.ts` (Truth #3). |
| MEM-01 | 01-06 | `wiki/` follows Karpathy pattern | ✓ SATISFIED | Directory structure unchanged, wiki-lint clean. |
| MEM-02 | 01-06 | `wiki/index.md` catalogs every page | ✓ SATISFIED | 17/17 pages listed, wiki-lint `orphans=0`. |
| MEM-03 | 01-06, 01-08, 01-11 | `wiki/log.md` append-only, parseable prefixes | ✓ SATISFIED | New `FINDING` line confirmed append-only (tail read, no rewritten history). |
| MEM-04 | 01-06 | `CLAUDE.md` tells agent to consult/update wiki at phase boundaries | ✓ SATISFIED | Confirmed in `.claude/CLAUDE.md` (unchanged). |
| QA-01 | 01-07, 01-11 | Test strategy document | ✓ SATISFIED | Structure + consistency both verified (Truth #5); `01-UAT.md` test 4 retest confirms quality read passes. |

No orphaned requirements: all 9 Phase 1 IDs from `.planning/REQUIREMENTS.md`'s Traceability table appear across the 11 plans' `requirements:` frontmatter (01-09: FND-01, FND-03; 01-10: FND-01; 01-11: QA-01, MEM-03 — all re-affirming already-mapped IDs, no new/orphaned ones introduced).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/src/lib/api.ts` | 68-73 | `fetchHealth`'s 2xx JSON-parse `catch` has no clause, so it also converts a genuine `AbortError` into `ApiError INVALID_RESPONSE_BODY` (REVIEW WR-05, newly introduced by 01-09's own fix) | ⚠️ Warning (advisory, from `01-REVIEW.md`) | Confirmed present by direct read. Traced and functionally inert today: the only caller (`healthPoller.ts`) sets `stopped = true` before `controller.abort()`, so the rejected handler's `if (stopped) return;` guard fires before this branch is reached. Latent risk only for a future direct caller of the exported `fetchHealth`. Does not block any Phase 1 must-have. |
| `api/src/lib/logger.ts` | 51-62 | `buildRotationOptions` `.log`-suffix assumption (WR-04, carried forward, untouched by gap-closure plans) | ℹ️ Info (advisory, carried) | Unchanged from original review; out of gap-closure scope. |
| `.github/workflows/ci.yml` | 1-53 | CI still does not run `npm run smoke` or `wiki-lint.mjs` (WR-03, closed-by-reword per 01-11: `qa/TEST-PLAN.md` now documents this as a deliberate local-only Entry Criterion, deferred to Phase 6 AUT-02) | ℹ️ Info (documented deferral, not silent) | No action needed — this is now consistent between code and docs. |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in any file touched by plans 01-09/01-10/01-11 (grep re-run live across all 12 modified/created files, zero matches).

### Human Verification Required

None. All four items from the superseded 2026-09-15 VERIFICATION.md are satisfied by `01-UAT.md`'s 2026-09-16 retest (4/4 pass, concrete Playwright/Chrome evidence per test) and are not re-requested. The one remaining deferred human-check (01-10-SUMMARY.md's D7 — real API process stop/restart, not `page.route` simulation) is exactly what UAT test 3's retest performed and recorded as passing.

### Gaps Summary

**One real gap, mechanical to close.** All code-level fixes from the UAT-driven gap closure (01-09, 01-10, 01-11) are genuinely present, wired, and behaviorally verified — re-confirmed independently in this session via live test/typecheck/lint/wiki-lint/smoke runs and direct source reads, not SUMMARY narration. UAT's 2026-09-16 retest (4/4 pass) closes G-01-1 through G-01-4.

Success Criterion 2 ("CI goes green on GitHub for lint, typecheck and unit tests") was **not true at verification time** and has since been resolved — Resolved 2026-09-16 by the orchestrator: `git push origin main` moved `refs/heads/main` from `98e99ff` to `a9a3f23`, and GitHub Actions run `35062012187` for headSha `a9a3f236d32b98ffa34f18c4c289d18147b72044` completed with conclusion `success` (jobs: lint success, typecheck success, test success). Verified with `gh run view 35062012187`. The original finding was: `origin/main` sits 13 commits behind local `HEAD` (still at the pre-gap-closure `98e99ff`), and no GitHub Actions run exists for any commit at or after the fix. The prior VERIFICATION.md's evidence for this criterion (CI runs `35007042883`/`35007325356`) verified an earlier commit that predates the very bug UAT found — it no longer speaks to the current state of the phase. Every local proxy for CI (lint, typecheck, test — identical commands to `.github/workflows/ci.yml`'s jobs) passes cleanly, so this is very likely a push-and-confirm action rather than a real defect, but "very likely" does not satisfy a criterion that explicitly requires the result to be observed on GitHub. Fix: push local `main` to `origin` and confirm the resulting Actions run for that exact SHA completes green (mirrors 01-08-PLAN.md's Task 2 procedure exactly).

---

_Verified: 2026-09-16T09:05:00Z_
_Verifier: Claude (gsd-verifier)_

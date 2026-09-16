---
phase: 01-foundation-project-memory
plan: 10
subsystem: testing
tags: [playwright-core, real-browser-smoke, favicon, health-poller, gap-closure]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: >-
      Receiver-safe healthPoller.ts / api.ts from plan 01-09 (the G-01-1/2/3
      root-cause fix this plan confirms in a real browser), scripts/smoke-dev.mjs
      and its free-port/CoinGecko-stub infrastructure from earlier Phase 1 plans
provides:
  - "Real-browser smoke step (playwright-core against installed Chrome) added to npm run smoke"
  - "Mutation-tested proof that the new step catches BUG-001's pre-fix healthPoller.ts"
  - "web/public/favicon.svg + index.html icon link, closing the /favicon.ico 404"
affects: ["01-11 (BUG-001 / wiki finding closure copies these SHAs and outputs)"]

actuals:
  tokens: 2889
  tasks: 3
  commits: 3

plan_head_before: b60e487f73448585c3d1290d0786b52d636935ac

tech-stack:
  added: ["playwright-core@1.63.0 (root devDependency only)"]
  patterns:
    - "Real-browser smoke check as a library step inside an existing Node smoke script (chromium.launch({channel:\"chrome\"}), not a Playwright test runner) — proves browser-only behavior that Vitest's fake DOM and Node-only fetch checks cannot"
    - "waitForBadge(page, predicate, timeoutMs, description) polls locator.textContent() on an interval instead of using a substring text locator, because the badge nests multiple <span> elements and a text locator can match more than one"
    - "Mutation check pattern: temporarily restore a known-buggy file from its pre-fix commit SHA, prove the new check fails, restore with git checkout --, assert git diff --exit-code is clean before committing"

key-files:
  created:
    - web/public/favicon.svg
  modified:
    - package.json
    - package-lock.json
    - scripts/smoke-dev.mjs
    - web/index.html

key-decisions:
  - "Task 1 package-legitimacy checkpoint approved by the user (see Task 1 Approval below); the plan's own <what-built> text had a publish-date error (2026-09-15) corrected to 2026-09-15 -> actually 2026-09-04 per orchestrator's registry check — 1.63.0 is 11 days old, not fresh, so the too-new heuristic does not apply"
  - "playwright-core installed as a root devDependency only (never web/ or api/), matching Phase 6's eventual Playwright TS e2e suite so nothing here gets thrown away"
  - "Used chromium.launch({channel: \"chrome\", headless: true}) against the developer's installed Google Chrome, never Playwright's bundled Chromium — this macOS 13 (mac13) machine is unsupported by `playwright install`"
  - "Real time (not Playwright's fake clock) for the 60s poll wait — a faked clock replaces native timer functions with receiver-agnostic JS functions, which would hide the exact WebIDL receiver-rule bug (BUG-001) this plan exists to catch"
  - "Task 2 committed favicon and the browser-step/install as two separate atomic commits per the plan's explicit instruction; Task 3's poll/outage expansion is a third, separate commit"

requirements-completed: [FND-01]

coverage:
  - id: D1
    description: "playwright-core@1.63.0 installed as a root devDependency only, after a blocking-human legitimacy checkpoint; no playwright package in web/ or api/ manifests"
    requirement: "FND-01"
    verification:
      - kind: other
        ref: "node -e manifest check (Task 2 <verify>, second command)"
        status: pass
    human_judgment: false
  - id: D2
    description: "web/public/favicon.svg served with HTTP 200 and svg content-type, and copied into web/dist on build"
    requirement: "FND-01"
    verification:
      - kind: e2e
        ref: "scripts/smoke-dev.mjs check (h0); npm run build --workspace=web + test -f web/dist/favicon.svg"
        status: pass
    human_judgment: false
  - id: D3
    description: "npm run smoke drives real installed Chrome and proves the footer badge reads 'API ok' + 'CoinGecko: ok' within 30s and stays stable 2s later, with zero page/console errors"
    requirement: "FND-01"
    verification:
      - kind: automated_ui
        ref: "scripts/smoke-dev.mjs check (h); npm run smoke -> SMOKE OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "Mutation check proves the new browser step detects BUG-001: the pre-fix 7e14902 healthPoller.ts makes npm run smoke fail at the badge assertion; the restored file leaves git diff --exit-code clean"
    requirement: "FND-01"
    verification:
      - kind: other
        ref: "Mutation check transcript below (SUMMARY evidence)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Browser-level check proves the second GET /health fires 50-70s after the badge first shows ok, while the tab stays visible, with exactly one extra request (G-01-2)"
    requirement: "FND-01"
    verification:
      - kind: automated_ui
        ref: "scripts/smoke-dev.mjs check (i); npm run smoke -> SMOKE OK"
        status: pass
    human_judgment: false
  - id: D6
    description: "Browser-level check proves the badge shows 'API unreachable' during a simulated outage (page.route abort) and recovers to 'API ok' after unroute, via exactly one Re-check request each way (G-01-3)"
    requirement: "FND-01"
    verification:
      - kind: automated_ui
        ref: "scripts/smoke-dev.mjs check (j); npm run smoke -> SMOKE OK"
        status: pass
    human_judgment: false
  - id: D7
    description: "A real API process stop/restart (not page.route simulation) also shows the badge going 'API unreachable' then recovering to 'API ok' via Re-check, with no console 'Illegal invocation' and no /favicon.ico 404"
    verification: []
    human_judgment: true
    rationale: "Task 3's <verify> explicitly scopes this as a <human-check> (why_human: the smoke simulates the outage with page.route; a real API process stop/restart is not automated). Not run during this executor session — deferred to /gsd-verify-work 1 per workflow.human_verify_mode: end-of-phase."

duration: ~25min (approximate — start time not captured via record_start_time at session start)
completed: 2026-09-16
status: complete
---

# Phase 1 Plan 10: Real-Browser Smoke Check + Favicon Summary

**Added a `playwright-core`-driven real-Chrome step to `npm run smoke` that mutation-proves it catches BUG-001 (60s poll timing + outage/recovery through Re-check), plus a static SVG favicon that closes the `/favicon.ico` 404 — closing UAT gaps G-01-2, G-01-3 and G-01-4.**

## Performance

- **Duration:** ~25 min (approximate)
- **Started:** not precisely instrumented
- **Completed:** 2026-09-16T05:37:00Z
- **Tasks:** 3 (1 checkpoint + 2 execution)
- **Files modified:** 5 (package.json, package-lock.json, scripts/smoke-dev.mjs, web/index.html, web/public/favicon.svg created)

## Task 1 Approval (checkpoint:human-verify, gate=blocking-human)

Cleared by the orchestrator before this executor was dispatched. User response: **"approved"** — install `playwright-core@1.63.0` as a root devDependency.

Registry verification (re-confirmed independently in this session):
- `npm view playwright-core@1.63.0 repository.url` → `git+https://github.com/microsoft/playwright.git`
- `npm view playwright-core@1.63.0 dist-tags.latest` → `1.63.0`
- Maintainers: `microsoft1es`, `microsoft-oss-releases`, `dgozman-ms`, plus core Playwright team accounts (`pavelfeldman`, `yurys`)
- `npm view playwright-core@1.63.0 scripts` → no output (no preinstall/install/postinstall lifecycle scripts)

**Correction to the plan's `<what-built>` text:** the plan stated 1.63.0 was published 2026-09-15 (triggering the "too new" heuristic). The orchestrator's registry check found the actual publish date is **2026-09-04** — 11 days old at execution time, not fresh — so the too-new heuristic does not apply. This correction is recorded here per the dispatch instruction.

## Accomplishments

- `scripts/smoke-dev.mjs` now launches the developer's installed Google Chrome (`chromium.launch({channel: "chrome", headless: true})`, fresh temporary profile, never a persistent context) and drives the running app through Playwright's page API — the first point in Phase 1 where anything loads the app in a real browser.
- The new step proves the footer badge reads "API ok" + "CoinGecko: ok" within 30s, stays stable 2s later, and that zero uncaught page errors or console errors occurred before a simulated outage.
- A mutation check (temporarily restoring `web/src/lib/healthPoller.ts` from pre-fix commit `7e14902`) proves the new check actually catches BUG-001: it fails with `SMOKE FAIL: browser: badge did not show "API ok" and "CoinGecko: ok" within 30000ms (last text: "API unreachableRe-check")`, and the file was cleanly restored (`git diff --exit-code` clean) before any commit.
- G-01-2: the browser step waits in real time (not Playwright's fake clock, which would hide this exact bug class) for the next `GET /health` and asserts it arrives 50-70s after the badge first showed "API ok", with exactly one extra request.
- G-01-3: the browser step simulates an outage via `page.route(...).abort("connectionrefused")`, clicks "Re-check API health", asserts "API unreachable" with exactly one request, then `unroute`s and clicks Re-check again, asserting recovery to "API ok" / "CoinGecko: ok" with exactly one more request.
- G-01-4: `web/public/favicon.svg` (hand-authored, no script/event handlers/external refs) is served at `/favicon.svg` with the correct content-type and copied into `web/dist` on build; `web/index.html` links it.
- `playwright-core@1.63.0` is a root devDependency only — confirmed via `npm ls playwright-core` (single copy) and a manifest check that neither `web/package.json` nor `api/package.json` depends on any `playwright*` package.

## Task Commits

1. **Task 1: Package legitimacy check for playwright-core before install** — checkpoint, no code commit (approved by user via orchestrator, evidence above)
2. **Task 2a: Add SVG favicon** — `3da79b8` (feat)
3. **Task 2b: Add real-browser smoke check via playwright-core** — `75795ac` (feat)
4. **Task 3: Expand browser step — 60s poll + outage/recovery** — `add040a` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `web/public/favicon.svg` (created) - Static SVG icon, viewBox 0 0 32 32, shell-bg rounded square + accent-colour coin circle, no script/handlers/external refs/raster data
- `web/index.html` - Adds `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` after the viewport meta
- `package.json` / `package-lock.json` - `playwright-core@1.63.0` root devDependency
- `scripts/smoke-dev.mjs` - Header comment updated; `waitForBadge()` helper; checks (h0) favicon, (h) launch/page-setup/badge-ok assertions, (i) periodic-poll timing, (j) outage/recovery through Re-check; browser closed in the existing `finally` block before killing the dev process group

## Decisions Made

See `key-decisions` in frontmatter — covers the Task 1 publish-date correction, root-devDependency-only placement, `channel: "chrome"` vs bundled Chromium, real time vs fake clock, and the two-commit split for Task 2.

## Deviations from Plan

None - plan executed exactly as written. The Task 1 checkpoint publish-date correction was pre-resolved by the orchestrator before dispatch (not a deviation made by this executor) and is recorded above per the dispatch instruction.

## Mutation Check Evidence (required by plan `<output>`)

**Run 1 — mutated tree (pre-fix `healthPoller.ts` from `7e14902`):**
```
browser: Chrome 152.0.7977.84
SMOKE FAIL: browser: badge did not show "API ok" and "CoinGecko: ok" within 30000ms (last text: "API unreachableRe-check")
```
Exit code: 1

**Restore:** `git checkout -- web/src/lib/healthPoller.ts` → `git diff --exit-code web/src/lib/healthPoller.ts` exited 0 (clean).

**Run 2 — restored (fixed) tree, after both Task 2 and Task 3 code landed:**
```
browser: Chrome 152.0.7977.84
SMOKE OK
```
Total duration: `1:08.74` (68.74s) — includes the ~60s real-time poll wait added by Task 3.
Exit code: 0

**Chrome version used throughout:** `152.0.7977.84` (reported by `browser.version()`)

**Commit SHAs** (for plan 01-11 to copy into `BUG-001` and `qa/TEST-PLAN.md`):
- `3da79b8` - feat(01-10): add SVG favicon to close the /favicon.ico 404 (G-01-4)
- `75795ac` - feat(01-10): add real-browser smoke check via playwright-core (G-01-2/3 tracer)
- `add040a` - feat(01-10): expand browser smoke check with poll timing and outage recovery

## Issues Encountered

- ESLint's `no-unused-vars` flagged `badgeOkAt` as unused between committing Task 2 (which stores it) and Task 3 (which consumes it in the 50-70s elapsed check) — an expected, transient mid-plan state since Task 2's own `<verify>` block does not run `npm run lint` (only the plan-level `<verification>`, run after Task 3, does). `npm run lint` and `npm run format:check` both pass on the final tree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-01-2, G-01-3 and G-01-4 are closed: a real-browser check now exists in Phase 1 and mutation-proves it would have caught BUG-001.
- D7 (real API process stop/restart human-check, UAT test 3 parity) is deferred to `/gsd-verify-work 1` per `workflow.human_verify_mode: end-of-phase` — the steps are in Task 3's `<verify><human-check>` block: run api+web dev servers, stop/restart the API terminal, click Re-check each time, confirm badge transitions and no console "Illegal invocation" / no `/favicon.ico` 404.
- Plan 01-11 can now copy the mutation-check transcript, Chrome version and the three commit SHAs above directly into `BUG-001` and `qa/TEST-PLAN.md`.
- Scope stayed within this plan's guard: no Playwright test runner, page objects, mocking layer or CI job was added — `npm run smoke` remains a local Entry Criterion; Phase 6 (AUT-02/AUT-03) is untouched.

## Self-Check: PASSED

- `web/public/favicon.svg` exists and contains `<svg` — FOUND
- `web/index.html` contains `favicon.svg` — FOUND
- `package.json` contains `playwright-core` in devDependencies — FOUND
- `scripts/smoke-dev.mjs` contains `playwright-core` (import) — FOUND
- Commits `3da79b8`, `75795ac`, `add040a` all present in `git log --oneline --all` — FOUND
- `npm run smoke` exits 0 and prints `SMOKE OK` on the final tree — CONFIRMED
- `git diff --exit-code web/src/lib/healthPoller.ts` exits 0 (mutation file restored) — CONFIRMED
- `npm run build --workspace=web` produces `web/dist/favicon.svg` — CONFIRMED
- `npm run lint` and `npm run format:check` both exit 0 — CONFIRMED
- `npm ls playwright-core` lists exactly one copy at the repo root — CONFIRMED
- Manifest check (`node -e ...` from Task 2 `<verify>`) exits 0 — CONFIRMED

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-16*

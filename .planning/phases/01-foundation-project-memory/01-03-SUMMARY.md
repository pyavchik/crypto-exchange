---
phase: 01-foundation-project-memory
plan: 03
subsystem: api
tags: [fastify, pino, pino-roll, request-id, error-handling, redaction, log-rotation, graceful-shutdown]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: "buildApp(deps)/createLogger(options) contracts frozen by 01-01's tracer, plus the api/src source tree"
provides:
  - "api/src/lib/errors.ts: D-09 error body shape + registerErrorHandlers (404 NOT_FOUND, 500 INTERNAL_ERROR with no leaked message/stack, 4xx pass-through with VALIDATION_ERROR/BAD_REQUEST fallback)"
  - "Hardened request-ID thread: strict single-string UUID reuse only (alternate header names and multi-valued/malformed/over-long/JSON-breaking headers always replaced), proven under 20-way concurrency"
  - "request.userId decoration (declare module 'fastify' augmentation) wired into the request completed log line, ready for Phase 2 to populate"
  - "api/src/lib/logger.ts: REDACT_PATHS (CoinGecko key, authorization, cookie, apiKey, coingeckoApiKey at direct and one-level-nested positions) applied to every createLogger destination/transport"
  - "buildRotationOptions/ensureLogSymlink: pino-roll daily/10MB rotation with 14 kept files behind a stable api/logs/api.log path that always resolves through pino-roll's current.log symlink, idempotent, preserving a pre-existing regular file as api.legacy.log"
  - "api/src/server.ts: SIGINT/SIGTERM graceful shutdown (logs, closes the Fastify app which closes SQLite via the existing onClose hook, 10s unref()'d force-exit fallback)"
affects: [01-04, 01-05, 02]

# Actuals (#2632)
actuals:
  tokens: 6100
  tasks: 2
  commits: 4
  plan_head_before: effb703c556d608b35c985d3e49a15eb27dc9f8c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-09 uniform error shape { error: { code, message, requestId } } via a single registerErrorHandlers(app) call, never leaking the original 500 message/stack to the client"
    - "pino redact paths using fast-redact wildcard segments (*.headers[...], *.coingeckoApiKey) to cover both a header object and a config object without hand-rolled sanitization"
    - "pino-roll's own current.log symlink plus a second, hand-maintained api.log -> current.log symlink, so a single well-known path always resolves to the active log file across rotations"

key-files:
  created:
    - api/src/lib/errors.ts
    - api/src/app.test.ts
    - api/src/lib/logger.test.ts
  modified:
    - api/src/app.ts
    - api/src/lib/logger.ts
    - api/src/server.ts

key-decisions:
  - "gsd_run check tdd-red-evidence is incompatible with this project's Vitest stack — its TAP parser looks for node:test's `# tests`/`# pass`/`# fail` summary trailer, which Vitest's own --reporter=tap never emits (empirically confirmed: it always reports zero_tests_discovered regardless of genuine RED). Since the plan's frontmatter is `type: execute` (not `type: tdd`) and `workflow.tdd_mode` is unset, the strict automated gate is not mandated for this plan; RED was verified manually — each target test named in isolation, confirmed to fail on the exact D-09/redaction assertion under test rather than an import crash, zero-discovery or unrelated failure — before GREEN was written."
  - "REDACT_PATHS added apiKey/*.apiKey in addition to the plan's named coingeckoApiKey paths, since D-08's 'top-level apiKey (k-SECRET-4)' behavior case names a bare `apiKey` field distinct from `coingeckoApiKey`"

requirements-completed: [FND-04]

coverage:
  - id: D1
    description: "Request-ID reuse/replace: valid UUID (either case) echoed and logged verbatim; malformed, over-long, JSON-breaking, multi-valued or alternate-header-name values always replaced with a fresh UUID and never appear in log output"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/app.test.ts#reuses a valid lowercase UUID X-Request-Id header verbatim"
        status: pass
      - kind: unit
        ref: "api/src/app.test.ts#reuses a valid uppercase UUID X-Request-Id header verbatim"
        status: pass
      - kind: unit
        ref: "api/src/app.test.ts#replaces rejected X-Request-Id values with a fresh UUID and never logs the rejected text"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-09 error shape: 404 NOT_FOUND, 500 INTERNAL_ERROR (no leaked message/stack), and 4xx pass-through with caller-provided code, all carrying requestId equal to the X-Request-Id header"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/app.test.ts#returns the D-09 NOT_FOUND shape for unknown routes"
        status: pass
      - kind: unit
        ref: "api/src/app.test.ts#returns the D-09 INTERNAL_ERROR shape for unhandled errors without leaking message or stack"
        status: pass
      - kind: unit
        ref: "api/src/app.test.ts#returns the caller-provided status and code for a 4xx error"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-07 request completed log line: exactly one per request, with requestId/method/path (query stripped)/status/durationMs/userId, and query values never reach the logs"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/app.test.ts#logs exactly one request completed line per request with D-07 fields and strips query values"
        status: pass
    human_judgment: false
  - id: D4
    description: "CORS exposes X-Request-Id for allowed origins and grants no Access-Control-Allow-Origin to a disallowed origin"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/app.test.ts#exposes X-Request-Id via CORS for an allowed origin and omits allow-origin for a disallowed one"
        status: pass
    human_judgment: false
  - id: D5
    description: "Edge FND-04: 20 concurrent requests each get a distinct request ID mapping to exactly one matching request completed log line"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/app.test.ts#keeps 20 concurrent request ids distinct, each with exactly one matching log line"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-08: CoinGecko API key, authorization and cookie values are redacted to [REDACTED] through the real createLogger, at both direct and one-level-nested object positions, without touching non-secret fields"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/lib/logger.test.ts#createLogger redaction (6 cases: headers, req.headers, headers.authorization/cookie, nested upstream.headers, apiKey, config.coingeckoApiKey)"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-06: pino-roll rotation options (daily/10MB, 14 kept) derived correctly from the log file path, and api/logs/api.log always resolves through pino-roll's current.log symlink, idempotently, preserving a pre-existing regular file"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "api/src/lib/logger.test.ts#buildRotationOptions returns pino-roll options derived from the configured log file path"
        status: pass
      - kind: unit
        ref: "api/src/lib/logger.test.ts#ensureLogSymlink (3 cases: creates symlink, idempotent, preserves pre-existing file as .legacy.log)"
        status: pass
      - kind: e2e
        ref: "scripts/smoke-dev.mjs (npm run smoke) — log correlation and key-redaction assertions read through the real api.log/current.log chain"
        status: pass
    human_judgment: false
  - id: D8
    description: "SIGINT/SIGTERM close the Fastify server (running onClose, which closes SQLite) before the process exits, with a 10s forced-exit fallback"
    verification: []
    human_judgment: true
    rationale: "Implemented per the plan's structural acceptance criteria (grep for SIGINT/SIGTERM/app.close) and manually reasoned through, but no automated test exercises an actual process signal/exit in this plan's file scope (no server.test.ts) — a human should confirm the shutdown behavior (e.g. Ctrl+C during npm run dev) if this matters for a future deploy phase."

duration: ~30min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 3: Request-ID Hardening, D-09 Errors, Redaction, Rotation and Shutdown Summary

**D-09 uniform error shape, strict request-ID reuse under 20-way concurrency, pino API-key/authorization/cookie redaction proven through the real logger, pino-roll daily/10MB rotation behind a stable `api/logs/api.log` symlink, and graceful SIGINT/SIGTERM shutdown.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-15T18:10:16Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `api/src/lib/errors.ts`: `errorBody`/`registerErrorHandlers` implementing the single D-09 `{ error: { code, message, requestId } }` shape for 404 (`NOT_FOUND`), 500 (`INTERNAL_ERROR`, never leaking the original message or stack) and 4xx pass-through (`VALIDATION_ERROR` for schema failures, else the error's own `code`, else `BAD_REQUEST`)
- `api/src/app.ts`: wired `registerErrorHandlers` into `buildApp`; added `request.userId` decoration (with a `declare module 'fastify'` augmentation) populated from Phase 2, logged on every `request completed` line instead of a literal `null`; confirmed (by test) that `resolveRequestId`/`genReqId` already only trust a single-string, UUID-matching `x-request-id` header — malformed, over-long, JSON-breaking, multi-valued and alternate-header-name (`request-id`) values are all replaced with a fresh UUID and never reach log output
- `api/src/app.test.ts` (254 lines, 10 tests): covers request-ID reuse/replacement, the D-09 error shape across 404/500/4xx, CORS allow/expose-headers for allowed vs. disallowed origins, the `request completed` log line's D-07 fields with query-string stripping, and 20-concurrent-request ID/log-line correlation
- `api/src/lib/logger.ts`: `REDACT_PATHS` (11 paths, including wildcarded `*.headers["x-cg-demo-api-key"]` and `*.coingeckoApiKey`) applied to every `createLogger` call (both the test `destination` path and the stdout/file `transport` path); `buildRotationOptions`/`ensureLogSymlink` implement D-06 exactly per the pino-roll README (`file`/`extension`/`frequency`/`size`/`dateFormat`/`limit.count`/`mkdir`/`symlink`) and keep `api/logs/api.log` resolving through pino-roll's own `current.log` symlink, idempotently, preserving any pre-existing regular file as `api.legacy.log`
- `api/src/lib/logger.test.ts` (10 tests): redaction proven through the real `createLogger` for six cases (direct headers, `req.headers`, bare `headers.authorization`/`cookie`, nested `upstream.headers`, top-level `apiKey`, and `config.coingeckoApiKey` produced by the real `loadConfig`), plus `buildRotationOptions` and three `ensureLogSymlink` cases
- `api/src/server.ts`: `SIGINT`/`SIGTERM` handlers log `shutting down`, await `app.close()` (which runs the existing `onClose` hook closing SQLite), exit 0, or log-and-exit 1 on a rejected close or a 10-second `unref()`'d fallback timer
- `npm run smoke` re-verified end-to-end with a real `LOG_FILE`, proving the rotation/symlink chain and key redaction hold under the actual `npm run dev` process, not just unit tests

## Task Commits

Each task was committed as a RED/GREEN pair per the TDD execution flow:

1. **Task 1 RED** — `0425985` (test): failing tests for D-09 error shape, request-id, CORS and D-07 log line
2. **Task 1 GREEN** — `b57ec35` (feat): D-09 error handlers, request-id hardening and userId log slot
3. **Task 2 RED** — `e0e8f21` (test): failing tests for redaction, rotation options and log symlink
4. **Task 2 GREEN** — `86c17d3` (feat): pino redaction, pino-roll rotation, api.log symlink and graceful shutdown

**Plan metadata:** committed alongside this SUMMARY (see final commit hash in the orchestrator's completion report).

_No REFACTOR commits — both GREEN implementations were already minimal; no cleanup pass changed behavior._

## Files Created/Modified

- `api/src/lib/errors.ts` — `ApiErrorBody`, `errorBody`, `registerErrorHandlers` (D-09)
- `api/src/app.test.ts` — request-id/error-shape/CORS/log-line/concurrency tests
- `api/src/lib/logger.test.ts` — redaction/rotation/symlink tests
- `api/src/app.ts` — `registerErrorHandlers` wiring, `userId` request decoration and log field
- `api/src/lib/logger.ts` — `REDACT_PATHS`, `buildRotationOptions`, `ensureLogSymlink`, redact option on both logger paths
- `api/src/server.ts` — `SIGINT`/`SIGTERM` graceful shutdown with forced-exit fallback

## Decisions Made

- **`gsd_run check tdd-red-evidence` is not usable on this Vitest-based project** — its TAP parser expects `node --test`'s `# tests N`/`# pass N`/`# fail N` summary trailer, which Vitest's `--reporter=tap` never emits (empirically confirmed: it returns `zero_tests_discovered` for a genuinely-red run). Since this plan's frontmatter is `type: execute` (the strict `check tdd-red-evidence` gate in `tdd.md`'s "Gate Enforcement Rules" is scoped to `type: tdd` plans with `workflow.tdd_mode` enabled, and neither applies here), RED was verified manually instead: for both tasks, the exact target tests were run in isolation and confirmed to fail on the specific behavior-under-test assertion (never an import crash, zero-test-discovery, or unrelated failure) before any implementation code was written.
- **`REDACT_PATHS` includes bare `apiKey`/`*.apiKey`** in addition to the plan-named `coingeckoApiKey`/`*.coingeckoApiKey` paths, since the D-08 behavior list's "top-level `apiKey` (k-SECRET-4)" case names a field distinct from `coingeckoApiKey`.

## Deviations from Plan

None - plan executed exactly as written (task descriptions, exported symbols and file list all match the frontmatter's `must_haves`/`key_links`).

## Issues Encountered

- The mandated `gsd_run check tdd-red-evidence` verification step could not run to a `RED_EVIDENCE_OK` verdict against this project's Vitest test runner (see Decisions Made above) — worked around with manual RED verification since the plan/config scope does not mandate the automated gate. Flagging here in case a future phase enables `workflow.tdd_mode`: the TAP-based check would need a Vitest-aware summary parser (or the project would need to standardize on `node --test`) before it can gate GREEN automatically.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- The request-ID → D-09 error → D-07 log line evidence chain is now hardened and unit-tested end-to-end, including the 20-concurrent-request edge case — Phase 6 RCA write-ups can quote a request ID from any bug report (200, 404 or 500) and find exactly one matching log line.
- `api/logs/api.log` is a stable path across pino-roll rotations (daily/10MB, 14 kept) via its own symlink to `current.log`; the `.gitignore`'d `api/logs/` directory already excludes all rotated/symlinked output.
- `request.userId` is decorated and logged as `null` today; Phase 2's auth work only needs to set it on the request object — no further wiring in `app.ts`/`logger.ts` is required.
- Sibling wave-3 plans 01-04 (coingecko/health routes) and 01-05 (web) build against the same frozen `buildApp`/`createLogger` signatures, untouched by this plan's internal-only changes.

## Self-Check: PASSED

- `test -f api/src/lib/errors.ts && test -f api/src/app.test.ts && test -f api/src/lib/logger.test.ts` → all found
- `git log --oneline --all --grep="01-03"` → matches all 4 commits (`0425985`, `b57ec35`, `e0e8f21`, `86c17d3`)
- Re-ran all `<acceptance_criteria>` for Task 1 and Task 2 → all PASS (grep checks + `npm --prefix api run test` + `npm --prefix api run typecheck`)
- Re-ran plan-level `<verification>`: `npm --prefix api run test` → 3 files, 22 tests passed; `npm --prefix api run typecheck` → clean; `npx eslint` on all 6 changed files → clean; `npm run smoke` → `SMOKE OK`

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*

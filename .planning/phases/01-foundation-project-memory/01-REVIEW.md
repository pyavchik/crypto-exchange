---
phase: 01-foundation-project-memory
reviewed: 2026-09-15T00:00:00Z
depth: standard
files_reviewed: 61
files_reviewed_list:
  - .claude/CLAUDE.md
  - .github/ISSUE_TEMPLATE/bug_report.md
  - .github/workflows/ci.yml
  - .gitignore
  - .prettierignore
  - .prettierrc.json
  - api/.env.example
  - api/drizzle.config.ts
  - api/package.json
  - api/src/app.test.ts
  - api/src/app.ts
  - api/src/config.ts
  - api/src/db/client.ts
  - api/src/db/migrations/0000_upstream_checks.sql
  - api/src/db/migrations/meta/0000_snapshot.json
  - api/src/db/migrations/meta/_journal.json
  - api/src/db/schema.ts
  - api/src/lib/coingecko.test.ts
  - api/src/lib/coingecko.ts
  - api/src/lib/errors.ts
  - api/src/lib/logger.test.ts
  - api/src/lib/logger.ts
  - api/src/routes/health.test.ts
  - api/src/routes/health.ts
  - api/src/server.ts
  - api/tsconfig.json
  - eslint.config.js
  - package.json
  - qa/README.md
  - qa/TEST-PLAN.md
  - qa/templates/bug-report-template.md
  - qa/templates/run-report-template.md
  - qa/templates/test-case-template.md
  - scripts/smoke-dev.mjs
  - scripts/wiki-lint.mjs
  - web/.env.example
  - web/index.html
  - web/package.json
  - web/src/App.test.tsx
  - web/src/App.tsx
  - web/src/components/HealthBadge.test.tsx
  - web/src/components/HealthBadge.tsx
  - web/src/lib/api.test.ts
  - web/src/lib/api.ts
  - web/src/lib/healthPoller.test.ts
  - web/src/lib/healthPoller.ts
  - web/src/main.tsx
  - web/src/pages/ComingSoon.tsx
  - web/src/styles/theme.css
  - web/tsconfig.json
  - web/vite.config.ts
  - wiki/index.md
  - wiki/log.md
  - wiki/pages/decisions/coingecko-proxy.md
  - wiki/pages/decisions/foundation-skeleton-conventions.md
  - wiki/pages/decisions/free-hosting-public-repo.md
  - wiki/pages/decisions/limit-order-fill-model.md
  - wiki/pages/decisions/llm-wiki-memory.md
  - wiki/pages/decisions/paper-trading-scope.md
  - wiki/pages/decisions/qa-first-class.md
  - wiki/pages/decisions/tech-stack.md
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 61
**Status:** issues_found

## Summary

Reviewed the Phase 1 foundation skeleton: Fastify API (`/health`, CoinGecko upstream-status
service, structured logging, error handling), the React/Vite web shell (health badge, health
poller), the smoke-test and wiki-lint scripts, CI config, and the QA/wiki documentation. All 66
Vitest tests (39 api + 27 web) pass, `tsc --noEmit` is clean in both workspaces, and `eslint .`
reports no violations.

Verified the two explicit security constraints for this phase:

- **CoinGecko key never reaches logs/responses/bundle:** confirmed. `coingecko.ts` only ever
  logs five scalar fields (`upstream`, `url`, `status`, `durationMs`, `result`) and never the
  headers object or the key itself; `logger.ts` additionally redacts `apiKey`/`coingeckoApiKey`
  and header paths as defense in depth; the `/health` response schema uses
  `additionalProperties: false` at every level; the web workspace never references
  `COINGECKO_API_KEY` anywhere (only `VITE_API_URL`/`VITE_PORT`).
- **Request IDs only reused when a valid UUID:** confirmed. `resolveRequestId` in `app.ts` only
  accepts a `string` (not `string[]`) that matches `UUID_RE`, otherwise a fresh `randomUUID()` is
  generated; well covered by `app.test.ts` (rejected/malformed/array/long/injection-shaped
  values never reach the response header or the log line).

No critical/blocker-level defects were found. The findings below are edge-case error-handling
gaps, a CI coverage gap relative to what the QA docs describe as "automated," and minor dead-code
items.

## Warnings

### WR-01: `fetchHealth` does not catch a malformed-JSON body on a 2xx response

**File:** `web/src/lib/api.ts:59-65`
**Issue:** The `try/catch` around the network call only wraps `fetchImpl(...)`. Once
`response.ok` is true, `await response.json()` is called unguarded:
```ts
const data = (await response.json()) as HealthResponse;
return { data, requestId: headerRequestId };
```
If the API ever returns a 200 with a non-JSON or truncated body (proxy hiccup, partial write,
future contract change), this throws a raw `SyntaxError` out of `fetchHealth`, not an `ApiError`.
Contrast with the non-ok path (`parseErrorResponse`), which already wraps a JSON-parse failure in
a `try/catch` and falls back to a synthetic `HTTP_<status>` `ApiError`. The 2xx path has no
equivalent fallback, so the "every non-2xx uses `ApiError`" contract implicitly also gets violated
for malformed 2xx bodies.
**Fix:** Wrap the `response.json()` call in the same try/catch pattern used in
`parseErrorResponse`, e.g.:
```ts
let data: HealthResponse;
try {
  data = (await response.json()) as HealthResponse;
} catch {
  throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
}
return { data, requestId: headerRequestId };
```

### WR-02: Unsafe `error as ApiError` cast lets a non-`ApiError` masquerade as one

**File:** `web/src/lib/healthPoller.ts:98-104`
**Issue:**
```ts
.catch((error: unknown) => {
  ...
  if (isAbortError(error)) return;
  onUpdate({ kind: "error", error: error as ApiError });
  afterSettled();
});
```
`HealthState`'s `error` branch is typed `{ kind: "error"; error: ApiError }`, but this cast
accepts *any* thrown value (e.g. the `SyntaxError` from WR-01, or any other exception a future
`fetchHealth` implementation might throw) without narrowing. `HealthBadgeView` then reads
`state.error.requestId` and `state.error.message` on the assumption those exist — for a
non-`ApiError` (`SyntaxError`, etc.) `requestId` is `undefined`, which happens to render
gracefully today (falsy check suppresses the "Request ID" line) but is only accidentally safe;
any future code path that reads `.code` or `.status` off `state.error` would silently produce
`undefined` instead of a type error.
**Fix:** Narrow explicitly instead of casting, e.g.:
```ts
const apiError = error instanceof ApiError ? error : new ApiError(null, "UNKNOWN_ERROR", null);
onUpdate({ kind: "error", error: apiError });
```

### WR-03: CI does not run `npm run smoke` or `wiki-lint.mjs`

**File:** `.github/workflows/ci.yml:1-53`
**Issue:** `ci.yml` only defines `lint`, `typecheck`, and `test` jobs. `scripts/smoke-dev.mjs`
(the only test that exercises the real `npm run dev` end-to-end path: web → API → SQLite →
upstream stub → log file → request-ID correlation) and `scripts/wiki-lint.mjs` (which enforces
the MEM-01..04 wiki conventions) are never invoked by CI — they only run when a developer
remembers to run them locally. `qa/TEST-PLAN.md`'s Deliverables table lists "Phase 1 automated
checks (smoke, CI, health/logger tests, wiki lint)" as a single "Done (Phase 1)" row, which reads
as though smoke and wiki-lint are part of the CI gate; they are not. A regression in the
`npm run dev` startup path or an accidental edit that breaks wiki structure would not be caught
until someone runs the script by hand.
**Fix:** Either add a `smoke` job (and a `wiki-lint` step, run with `--pages-only` or without
`--base` since CI checks out a single commit) to `ci.yml`, or reword the TEST-PLAN/qa README rows
to make clear these two checks are manual/phase-transition gates rather than CI-enforced.

### WR-04: `buildRotationOptions` silently mis-derives the rotated filename for a non-`.log` `LOG_FILE`

**File:** `api/src/lib/logger.ts:51-62`
**Issue:** `file: filePath.replace(/\.log$/, "")` assumes `filePath` always ends in `.log`. The
`.env.example` default (`logs/api.log`) does, and this is covered by a unit test, but
`config.ts`'s `logFile` accepts *any* non-empty, non-`"off"` string from `LOG_FILE` (e.g.
`logs/api` or `logs/api.jsonl`). In that case the regex is a no-op, so pino-roll would append its
own `.<date>.<count>.log` suffix onto a filename that still ends in the wrong (or no) extension,
and `ensureLogSymlink`'s `extname(filePath)`-based legacy-rename logic (`logger.ts:86-88`) would
compute an empty or wrong extension for the same reason.
**Fix:** Either validate/document that `LOG_FILE` must end in `.log` (fail fast in `loadConfig`
if not), or make `buildRotationOptions`/`ensureLogSymlink` derive the base name and extension
independently of a hardcoded `.log` assumption.

## Info

### IN-01: Dead fallback branch — `request.url` is never falsy after `.split("?")[0]`

**File:** `api/src/lib/errors.ts:21`, also `api/src/app.ts:59`
**Issue:** `const path = request.url.split("?")[0] ?? request.url;` — `String.prototype.split`
always returns an array with at least one element, so `[0]` is a string (possibly empty), never
`undefined`. The `?? request.url` fallback is unreachable. Duplicated verbatim in two files.
**Fix:** Simplify to `const path = request.url.split("?")[0];` in both places, or factor into a
shared helper since the logic is duplicated.

### IN-02: `wiki-lint.mjs`'s ad hoc frontmatter parser doesn't handle quoted/multi-value YAML

**File:** `scripts/wiki-lint.mjs:117-134`
**Issue:** `parseFrontmatter` matches `^key:\s*(.*)$` per line and trims the remainder verbatim.
This works for the current single-line, unquoted frontmatter values used across `wiki/pages/**`,
but it is not a real YAML parser: a value containing a literal `#`, a trailing inline comment, or
a value that legitimately spans multiple lines would be mis-parsed without any error surfaced
(the mis-parsed value would just fail the `DATE_RE`/`TYPE_SINGULAR` checks with a confusing
message, or silently pass if it happens to still match). Low risk today since all current pages
use simple scalar frontmatter, but worth a comment noting the limitation so a future page author
doesn't hit a cryptic lint failure.
**Fix:** No change required now; consider a one-line comment above `parseFrontmatter` documenting
that only simple `key: scalar` lines are supported, or swap in a minimal YAML parser if frontmatter
grows more complex.

### IN-03: `ensureLogSymlink` has a non-atomic check-then-act sequence under concurrent startup

**File:** `api/src/lib/logger.ts:71-92`
**Issue:** `lstatSync` → (optional `renameSync`) → `symlinkSync` is three separate syscalls with
no locking. If two API processes started against the same `LOG_FILE` path at the same instant
(e.g. a supervisor restart race, or two `npm run dev` invocations pointed at the same `api/`
checkout), both could pass the `stat?.isSymbolicLink()` check as false and both attempt
`renameSync`/`symlinkSync`, with the loser throwing (`EEXIST`) unhandled at startup. Low
likelihood in this project's single-instance dev/CI usage, but worth noting since it's an
unhandled exception path.
**Fix:** Not urgent for Phase 1's single-process usage; if multi-process startup ever becomes
relevant, wrap the final `symlinkSync` in a try/catch that tolerates `EEXIST`.

---

_Reviewed: 2026-09-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

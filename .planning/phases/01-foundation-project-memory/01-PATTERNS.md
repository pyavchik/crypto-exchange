# Phase 1: Foundation & Project Memory - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** 34 (28 new app/CI/QA files + 6 wiki ADR backfills + 2 wiki catalog updates)
**Analogs found:** 8 / 34 (all 8 are wiki-plan files; app/CI/QA code is greenfield — 0 in-repo code analogs exist)

**Greenfield notice:** This repo contains only `.planning/`, `wiki/`, `.claude/CLAUDE.md` — no `web/`, `api/`, `qa/`, or CI code exists yet (confirmed via `find . -maxdepth 4` excluding `.git`/`node_modules`). Every app/CI/QA file below has **no in-repo analog**; the planner must build these from `01-RESEARCH.md`'s Code Examples / Architecture Patterns sections (cited inline per file). The wiki-plan files (plan 01-02, MEM-01..04) DO have real analogs — the wiki was scaffolded at project init and its existing pages are the concrete patterns to copy frontmatter/structure/tone from.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `package.json` (root) | config | batch | none in-repo | no-analog — RESEARCH.md "Root `package.json`" Code Example |
| `.gitignore` | config | — | none in-repo | no-analog — RESEARCH.md Security Domain V14 |
| `.env.example` (`api/`) | config | — | none in-repo | no-analog — RESEARCH.md Environment Availability |
| `.github/workflows/ci.yml` | config | batch | none in-repo | no-analog — RESEARCH.md "GitHub Actions CI workflow" Code Example |
| `eslint.config.js` (root) | config | — | none in-repo | no-analog — RESEARCH.md Common Pitfall 3 (flat config only) |
| `tsconfig.base.json` + per-workspace `tsconfig.json` | config | — | none in-repo | no-analog |
| `vitest.config.ts` (root/web/api) | config | — | none in-repo | no-analog — RESEARCH.md "Vitest config using `test.projects`" Code Example |
| `web/package.json` | config | — | none in-repo | no-analog |
| `web/vite.config.ts` | config | — | none in-repo | no-analog |
| `web/src/App.tsx` | component | request-response | none in-repo | no-analog — RESEARCH.md Architecture Patterns (nav shell, 4 placeholder routes) |
| `web/src/components/HealthBadge.tsx` | component | request-response | none in-repo | no-analog — RESEARCH.md D-02/Pattern 4 shape; poll only while tab visible |
| `web/src/lib/api.ts` | utility | request-response | none in-repo | no-analog — thin `fetch` wrapper reading `X-Request-Id` header |
| `api/package.json` | config | — | none in-repo | no-analog |
| `api/src/server.ts` | provider | request-response | none in-repo | no-analog — RESEARCH.md Pattern 1 (Fastify instance + `genReqId` + pino logger wiring) |
| `api/src/plugins/request-id.ts` | middleware | request-response | none in-repo | no-analog — RESEARCH.md Pattern 1 (verbatim genReqId/onSend code) |
| `api/src/plugins/cors.ts` | middleware | request-response | none in-repo | no-analog — RESEARCH.md Pattern 2 (verbatim `@fastify/cors` config) |
| `api/src/routes/health.ts` | route | request-response | none in-repo | no-analog — RESEARCH.md Pattern 4 (verbatim lazy-cache logic) + D-03 response shape |
| `api/src/routes/health.test.ts` | test | request-response | none in-repo | no-analog — RESEARCH.md Pattern 5 (`.inject()`) |
| `api/src/lib/coingecko.ts` | service | request-response | none in-repo | no-analog — RESEARCH.md Pattern 4 + D-08 (own log line, key never logged) |
| `api/src/lib/logger.ts` | utility | event-driven | none in-repo | no-analog — RESEARCH.md Pattern 3 (verbatim pino `redact` config) |
| `api/src/lib/logger.test.ts` | test | event-driven | none in-repo | no-analog — RESEARCH.md Pattern 3 (verbatim redaction unit-test pattern, required by D-08) |
| `api/src/plugins/request-id.test.ts` | test | request-response | none in-repo | no-analog — asserts UUID reuse/replace + header echo (D-07) |
| `api/src/db/schema.ts` | model | CRUD | none in-repo | no-analog — Drizzle schema, minimal/empty this phase |
| `api/src/db/client.ts` | service | CRUD | none in-repo | no-analog — `better-sqlite3` + `drizzle()` wiring |
| `api/src/db/migrations/` | migration | batch | none in-repo | no-analog — `drizzle-kit generate`/`migrate` output |
| `qa/TEST-PLAN.md` | config (doc) | — | none in-repo | no-analog — D-10/D-11 structure; use `wiki/SCHEMA.md` only for Markdown-doc tone, not content |
| `qa/templates/test-case-template.md` | config (doc) | — | none in-repo | no-analog — D-10 column spec |
| `qa/templates/run-report-template.md` | config (doc) | — | none in-repo | no-analog — D-10 |
| `qa/templates/bug-report-template.md` | config (doc) | — | none in-repo | no-analog — D-10 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | config (doc) | — | (mirrors `qa/templates/bug-report-template.md` once it exists) | no-analog until bug template is written first |
| `wiki/pages/decisions/<slug>.md` × 7 (ADR backfill) | model (doc) | CRUD (append-only doc) | `wiki/pages/decisions/foundation-skeleton-conventions.md` | exact |
| `wiki/index.md` (update, add 7 new Decisions rows) | model (doc) | CRUD | `wiki/index.md` (self, existing content) | exact |
| `wiki/log.md` (append `DECISION`/`LINT` lines) | model (doc) | event-driven (append-only) | `wiki/log.md` (self, existing lines) | exact |

## Pattern Assignments

### App/CI/QA files (no in-repo analog — greenfield)

None of `web/`, `api/`, `qa/`, `.github/workflows/`, or root config files exist yet. Do not invent an analog. For every file in that group above, the planner should cite the matching section of `.planning/phases/01-foundation-project-memory/01-RESEARCH.md` directly:

- **Fastify server + request-ID plumbing** (`api/src/server.ts`, `api/src/plugins/request-id.ts`): RESEARCH.md "Pattern 1: Request ID generation, reuse, and echo (Fastify)" — verbatim `genReqId` + `onSend` code block, with the explicit warning not to rely on `requestIdHeader` alone (no validation).
- **CORS header exposure** (`api/src/plugins/cors.ts`): RESEARCH.md "Pattern 2: Exposing the request-ID header through CORS" — verbatim `@fastify/cors` `exposedHeaders: ['X-Request-Id']` config.
- **pino logger + redaction** (`api/src/lib/logger.ts`, `api/src/lib/logger.test.ts`): RESEARCH.md "Pattern 3: pino redaction for the CoinGecko API key" — verbatim `redact.paths` config AND the verbatim unit-test pattern (capture stream, assert key absent) — this satisfies D-08's explicit test requirement.
- **CoinGecko client + lazy 5-min cache** (`api/src/lib/coingecko.ts`, `api/src/routes/health.ts`): RESEARCH.md "Pattern 4: Lazy, cached upstream health check (D-04/D-05)" — verbatim TTL-cache function; note the verified live response shape (`{"gecko_says":"(V3) To the Moon!"}`) and the `AbortSignal.timeout(5000)` requirement (Common Pitfall 4).
- **Route testing** (`api/src/routes/health.test.ts`, `api/src/plugins/request-id.test.ts`): RESEARCH.md "Pattern 5: Testing Fastify routes without a live server" — `app.inject()` pattern.
- **Root workspaces + one-command dev** (`package.json`): RESEARCH.md "Root `package.json` workspaces + one-command dev" Code Example — verbatim `workspaces` array + `concurrently` dev script.
- **CI workflow** (`.github/workflows/ci.yml`): RESEARCH.md "GitHub Actions CI workflow" Code Example — verbatim `actions/checkout` → `actions/setup-node` (node 24, `cache: npm`) → `npm ci` → lint/typecheck/test steps. Heed Common Pitfall 2 (single root lockfile only — never `npm install` inside a workspace subfolder).
- **Vitest config** (`vitest.config.ts` files): RESEARCH.md "Vitest config using `test.projects`" — use `test.projects`, NOT the deprecated `workspace` file (State of the Art table).
- **ESLint** (`eslint.config.js`): flat config only (Common Pitfall 3) — no cited code example in RESEARCH.md beyond the standard `@eslint/js` + `typescript-eslint` flat preset mention; planner/executor should pull the current flat-config quickstart from ESLint's own docs at execution time.
- **QA docs** (`qa/TEST-PLAN.md`, `qa/templates/*.md`): no existing QA doc in this repo. Follow CONTEXT.md D-10/D-11 structure directly (scope/risks/environments/entry-exit criteria, severity S1-S4/priority P1-P3 with trading examples like "wrong balance after fill = S1"). `.github/ISSUE_TEMPLATE/bug_report.md` should mirror `qa/templates/bug-report-template.md` field-for-field once that template is written — write the `qa/templates/` version first, then copy its field list into the issue template.

---

### `wiki/pages/decisions/<slug>.md` × 7 (role: model/doc, flow: CRUD/append-only)

**Analog:** `wiki/pages/decisions/foundation-skeleton-conventions.md` (exact — same page type, same phase, already follows `wiki/SCHEMA.md`'s ADR format)

**Frontmatter pattern** (`wiki/pages/decisions/foundation-skeleton-conventions.md` lines 1-7):
```markdown
---
title: Foundation skeleton conventions (health, logs, QA docs, repo)
type: decision
updated: 2026-09-15
sources: []
related: [[market-data-caching]], [[coingecko-api]], [[qa-portfolio-alignment]]
---
```

**Body structure pattern** (lines 9-28): `# <Title>` → `**Status:** Accepted (<context>, <date>). Full detail: <planning doc path>.` → `## Context` (1-2 sentences on why this decision matters to later phases) → `## Decision` (bulleted, one bullet per sub-decision, cross-linking related concept/entity pages with `[[slug]]`) → `## Consequences` (bulleted, concrete downstream effects).

**Schema contract to honor** (`wiki/SCHEMA.md` lines 30-46): page type must be one of `source | entity | concept | decision | finding`; link other pages with `[[slug]]` (filename minus `.md`); mark unverified claims `(unverified)`; prefer updating an existing page over creating a near-duplicate — since 6 of the 7 PROJECT.md Key Decisions have no wiki page yet, this is 6 new files, not updates (the 7th, "Request-ID JSON logs...", already IS `foundation-skeleton-conventions.md` — do not duplicate it).

**Source rows to backfill** (`.planning/PROJECT.md` lines 58-67, Key Decisions table — 8 rows total, 1 already has a wiki page):
1. Simulated paper-trading exchange, Binance-style UI → e.g. `wiki/pages/decisions/paper-trading-scope.md`
2. Limit orders fill on reference-price cross (no matching engine) → e.g. `wiki/pages/decisions/limit-order-fill-model.md`
3. React+TS / Node+TS / SQLite → e.g. `wiki/pages/decisions/tech-stack.md`
4. Backend proxy + cache for CoinGecko → e.g. `wiki/pages/decisions/coingecko-proxy.md`
5. QA artifacts are first-class deliverables with their own phase(s) → e.g. `wiki/pages/decisions/qa-first-class.md`
6. LLM Wiki (Karpathy) for project memory in `wiki/` → e.g. `wiki/pages/decisions/llm-wiki-memory.md`
7. Deploy on free hosting + public repo → e.g. `wiki/pages/decisions/free-hosting-public-repo.md`
8. Request-ID JSON logs, lazy 5-min-cached `/health`, Markdown QA docs, public repo from day one → **already exists**, `foundation-skeleton-conventions.md` — skip, just verify it's linked from `index.md` (it already is).

Each new page's `## Decision` / `## Consequences` prose should be lifted from the matching PROJECT.md "Rationale" cell plus the surrounding CONTEXT — e.g. for #6, PROJECT.md line 65 gives `Rationale: "User preference; persistent compounding knowledge"`, and `wiki/SCHEMA.md`'s own existence/Operations section (lines 48-73) is the primary source material to cite (`sources: [wiki/SCHEMA.md]` or `sources: []` if purely a PROJECT.md-derived record, matching the existing page's `sources: []`).

---

### `wiki/index.md` update (role: model/doc, flow: CRUD)

**Analog:** self (`wiki/index.md`, current content)

**Pattern to extend** (lines 21-23, `## Decisions` section):
```markdown
## Decisions
- [Foundation skeleton conventions](pages/decisions/foundation-skeleton-conventions.md) — request-ID logging, /health, QA doc format, public repo
```
Add one new bullet per backfilled ADR page in the same `- [<Title>](pages/decisions/<slug>.md) — <one-line summary>` format, directly below the existing line. Keep every other section (`## Overview`, `## Sources`, `## Entities`, `## Concepts`, `## Findings`) untouched unless a LINT pass finds something to fix.

---

### `wiki/log.md` append (role: model/doc, flow: event-driven/append-only)

**Analog:** self (`wiki/log.md`, current 6 lines)

**Line format** (`wiki/SCHEMA.md` lines 69-73, and existing lines 5-10 of `wiki/log.md`):
```
YYYY-MM-DD | INGEST|QUERY|LINT|DECISION|FINDING | <short summary> | <pages touched>
```
Concrete existing example to copy (line 10):
```
2026-09-15 | DECISION | Phase 1 discuss: request-ID logging, /health with 5-min cached /ping, dark shell, Markdown QA docs, public repo | decisions/foundation-skeleton-conventions, index
```
For plan 01-02: append one `DECISION` line per backfilled ADR batch (or one line listing all 6-7 new pages, matching existing granularity) plus one final `LINT` line with counts, mirroring line 9's format:
```
2026-09-15 | LINT | Initial lint: 8 pages, 0 orphans, 0 broken links, 4 unverified claims flagged | all
```
**Never rewrite past lines** — this file is append-only (`wiki/SCHEMA.md` line 15, and the Log layer table's "Rule" column).

---

## Shared Patterns

### Request-ID evidence chain (D-07)
**Source:** RESEARCH.md Pattern 1 + Pattern 2 (no in-repo source yet)
**Apply to:** `api/src/server.ts`, `api/src/plugins/request-id.ts`, `api/src/plugins/cors.ts`, `api/src/routes/health.ts`, and by extension every future route (Phase 2+)
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const app = Fastify({
  genReqId: (req) => {
    const incoming = req.headers['x-request-id']
    if (typeof incoming === 'string' && UUID_RE.test(incoming)) return incoming
    return randomUUID()
  },
  logger: pinoInstance,
})
app.addHook('onSend', async (request, reply, payload) => {
  reply.header('x-request-id', request.id)
  return payload
})
```
Must pair with `@fastify/cors` `exposedHeaders: ['X-Request-Id']` or the browser cannot read the header on cross-origin `fetch()`.

### Error response shape (D-09)
**Source:** CONTEXT.md D-09 (no in-repo source yet)
**Apply to:** every route handler's error path, `api/src/routes/health.ts` included
```typescript
{ error: { code, message, requestId } }
```
Should be a shared helper (e.g. `api/src/lib/errors.ts` — not explicitly listed in RESEARCH.md's structure but implied by "one JSON shape"; planner may add it as a Wave 0 file) so every route formats errors identically.

### pino redaction of the CoinGecko key (D-08)
**Source:** RESEARCH.md Pattern 3
**Apply to:** `api/src/lib/logger.ts` (config) and `api/src/lib/coingecko.ts` (usage site) — every outbound-call log line must go through the redacting logger instance, never `console.log`.

### Wiki ADR page format (MEM-01..04, D-14)
**Source:** `wiki/SCHEMA.md` lines 28-46 + `wiki/pages/decisions/foundation-skeleton-conventions.md` (concrete existing example)
**Apply to:** all 6-7 new `wiki/pages/decisions/*.md` files — identical frontmatter keys, `## Context` / `## Decision` / `## Consequences` section order, `[[slug]]` cross-links, `(unverified)` tagging for unconfirmed claims.

## No Analog Found

All 28 app/CI/QA files (plan 01-01 scope) have no analog — this is a greenfield repo. See "App/CI/QA files (no in-repo analog — greenfield)" under Pattern Assignments above for the RESEARCH.md section to use instead of an analog, per file group.

| File group | Role | Data Flow | Reason |
|---|---|---|---|
| `web/**`, `api/**`, root config, `.github/workflows/ci.yml` | various | various | No `web/`, `api/`, or `.github/` directories exist in the repo yet (confirmed via directory listing) — use RESEARCH.md Code Examples/Patterns 1-5 instead |
| `qa/TEST-PLAN.md`, `qa/templates/*.md`, `.github/ISSUE_TEMPLATE/bug_report.md` | config (doc) | — | No `qa/` directory exists yet — use CONTEXT.md D-10/D-11 structure directly |

## Metadata

**Analog search scope:** entire repo (`.`, excluding `.git`, no `node_modules` present); confirmed via `find . -maxdepth 4` and `git ls-files` spot-checks on all cited wiki/planning paths (all tracked, none gitignored mirrors).
**Files scanned:** 15 (`.planning/*.md`, `wiki/**/*.md`, `.claude/CLAUDE.md`)
**Pattern extraction date:** 2026-09-15

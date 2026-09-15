# Phase 1: Foundation & Project Memory - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A running skeleton — `web/` (Vite + React + TS) and `api/` (Node + TS) in an npm-workspaces monorepo with `qa/` — started by one `npm run dev`, with CI (lint, typecheck, unit tests) on GitHub, a `GET /health` endpoint, request-ID structured JSON logs, the LLM Wiki project memory, and `qa/TEST-PLAN.md` plus test case / bug report templates.

Requirements: FND-01..04, MEM-01..04, QA-01. No auth, market data, wallet or trading features — those are Phases 2–5.

</domain>

<decisions>
## Implementation Decisions

### Web shell (FE)
- **D-01:** Build a dark, Binance-style app shell now: top nav with placeholder routes Markets / Trade / Wallet / Orders (empty "coming soon" pages), footer containing an API health badge and "Powered by CoinGecko" attribution. Later phases fill routes in rather than restyling.
- **D-02:** The health badge reads `GET /health` on load and re-polls only while the tab is visible (≈60 s interval). It shows API status and the upstream CoinGecko status (`ok | degraded | down | not_configured`).

### Health endpoint (FND-03)
- **D-03:** `GET /health` returns `{ status, version, commit, upstream: { coingecko: { status, checkedAt, latencyMs } } }`. `version` from `api/package.json`; `commit` = git SHA injected via env at build/CI time (fallback `"dev"`).
- **D-04:** Upstream status comes from CoinGecko `/ping`, called lazily (only when `/health` is requested and the cached result is expired). Missing `COINGECKO_API_KEY` → `not_configured`, no upstream call. Timeout/5xx → `down`; 429 or slow → `degraded`.
- **D-05:** Cache the `/ping` result for **5 minutes** (not 60 s as first proposed). Reason: a tab left open polling a 60 s cache could spend ≈43k calls/month against the ≈10k Demo cap (see `wiki/pages/concepts/market-data-caching.md`). Health checks must never threaten the market-data call budget.

### Logging (FND-04)
- **D-06:** pino JSON logs to stdout **and** an append log file (`api/logs/api.log`, git-ignored, simple size/daily rotation). File logs are evidence for later RCA write-ups (RCA-01).
- **D-07:** Request ID: reuse incoming `X-Request-Id` if it is a valid UUID, otherwise generate a UUID v4; always echo it in the `X-Request-Id` response header (CORS must expose it). Every request log line carries `requestId`, `method`, `path`, `status`, `durationMs`. Leave a slot for `userId` (populated from Phase 2).
- **D-08:** Outbound CoinGecko calls get their own log lines (`requestId`, upstream `url` without the API key, `status`, `durationMs`). The API key must never appear in logs — add a pino redaction rule and a unit test for it.
- **D-09:** Error responses use one JSON shape `{ error: { code, message, requestId } }` so bug reports can quote the request ID from the UI/network tab.

### QA artifacts format (QA-01 + templates)
- **D-10:** All QA docs are Markdown in the repo, readable on GitHub without login:
  - `qa/TEST-PLAN.md` — scope, out of scope, risks (trading-aware: precision, stale price, rate limits, isolation, concurrency), environments, entry/exit criteria, severity & priority definitions, traceability approach.
  - `qa/test-cases/<feature>.md` — one table per feature; IDs `TC-<AREA>-NNN` (e.g. `TC-AUTH-001`); columns: ID, Title, Req (e.g. AUTH-01), Preconditions, Steps, Expected, Priority, Type (positive / negative / boundary / security / UX).
  - `qa/runs/<date>-<scope>.md` — execution reports (build/commit, environment, pass/fail/blocked per TC, linked bugs).
  - `qa/bugs/BUG-NNN-<slug>.md` — steps, expected/actual, severity, priority, environment, request ID, evidence (screenshot, network/log excerpt), linked TC and REQ.
  - `qa/templates/` holds the test-case, run-report and bug-report templates; `.github/ISSUE_TEMPLATE/bug_report.md` mirrors the bug template.
- **D-11:** Severity S1 Critical / S2 Major / S3 Minor / S4 Trivial; Priority P1 / P2 / P3. Definitions live in TEST-PLAN.md with trading-specific examples (e.g. wrong balance after fill = S1).

### Repository & CI (FND-02)
- **D-12:** Public GitHub repo `pyavchik/crypto-exchange` from day one (commit history + GSD/wiki planning visible to reviewers). Create it and push during execution of plan 01-01. — **Reversibility:** one-way — once public, history (incl. `.planning/` and `wiki/`) may be cloned/indexed; never commit secrets (`.env` git-ignored, `.env.example` committed).
- **D-13:** GitHub Actions workflow on push and PR: install, lint, typecheck, unit tests for all workspaces, Node 24.

### Project memory (MEM-01..04)
- **D-14:** The wiki was scaffolded at project init (SCHEMA, index, log, 3 ingests, CLAUDE.md rules), so plan 01-02 becomes: verify MEM-01..04 against the files, backfill the 7 PROJECT.md Key Decisions as ADR pages in `wiki/pages/decisions/`, run a LINT, and append log lines. Don't rebuild what exists.

### Claude's Discretion
- Tooling: npm workspaces, Fastify (API), `better-sqlite3` + Drizzle (SQLite; Phase 1 only needs the connection/migration setup), Vitest (unit tests in web and api), ESLint + Prettier, `concurrently` (or equivalent) for `npm run dev`.
- Styling approach for the dark shell (CSS modules / Tailwind / etc.), log rotation mechanism, exact folder layout inside `web/` and `api/`.
- Whether `qa/` is an npm workspace in Phase 1 (it will host Playwright in Phase 6) or just a docs folder for now.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria, 3 planned plans
- `.planning/REQUIREMENTS.md` — FND-01..04, MEM-01..04, QA-01 (and later QA-* / RCA-01 that the templates must serve)
- `.planning/PROJECT.md` — constraints ($0 budget, stack, decimal math, reviewer audience)

### Project memory
- `wiki/SCHEMA.md` — wiki layers, page format, INGEST/QUERY/LINT/DECISION operations, log line format
- `wiki/index.md`, `wiki/log.md` — current catalog and log
- `.claude/CLAUDE.md` §Project Memory — agent rules for consulting/updating the wiki

### Domain notes
- `wiki/pages/entities/coingecko-api.md` — Demo key header, limits (unverified), `/ping`
- `wiki/pages/concepts/market-data-caching.md` — monthly call budget concern (drives D-05)
- `wiki/pages/concepts/qa-portfolio-alignment.md` — job requirement → artifact mapping (informs TEST-PLAN.md)
- `wiki/pages/concepts/order-rules.md` — trading risks to list in TEST-PLAN.md risk section
- `wiki/raw/2026-09-15-railsware-senior-qa-tradezella.md` — target job posting

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield. Repo contains only `.planning/`, `wiki/`, `.claude/CLAUDE.md`.

### Established Patterns
- Wiki conventions in `wiki/SCHEMA.md` are the only established pattern; new decision pages must follow its frontmatter format.

### Integration Points
- `.claude/CLAUDE.md` stack/conventions sections are GSD-generated placeholders; they will populate after this phase.
- No git remote yet; `gh` is authenticated as `pyavchik`. Node v24.14.0, npm 11.11.1 locally.

</code_context>

<specifics>
## Specific Ideas

- Look and feel reference: Binance spot web UI (dark theme, top nav).
- Request ID is the thread that ties UI error → network tab → log file → bug report → RCA write-up; design every layer to surface it.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Stale-price trading rule and market-data refresh strategy remain open for Phase 3/4, already tracked in the wiki.)

</deferred>

---

*Phase: 01-foundation-project-memory*
*Context gathered: 2026-09-15*

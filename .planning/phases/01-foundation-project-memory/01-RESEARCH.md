# Phase 1: Foundation & Project Memory - Research

**Researched:** 2026-09-15
**Domain:** Node/TS monorepo scaffolding (Fastify API + Vite/React web + SQLite), structured logging with request-ID tracing, LLM Wiki project memory, QA documentation conventions
**Confidence:** MEDIUM (stack choices are well-established; several specific package versions are very recent releases — see Package Legitimacy Audit)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Web shell (FE)**
- **D-01:** Build a dark, Binance-style app shell now: top nav with placeholder routes Markets / Trade / Wallet / Orders (empty "coming soon" pages), footer containing an API health badge and "Powered by CoinGecko" attribution. Later phases fill routes in rather than restyling.
- **D-02:** The health badge reads `GET /health` on load and re-polls only while the tab is visible (≈60 s interval). It shows API status and the upstream CoinGecko status (`ok | degraded | down | not_configured`).

**Health endpoint (FND-03)**
- **D-03:** `GET /health` returns `{ status, version, commit, upstream: { coingecko: { status, checkedAt, latencyMs } } }`. `version` from `api/package.json`; `commit` = git SHA injected via env at build/CI time (fallback `"dev"`).
- **D-04:** Upstream status comes from CoinGecko `/ping`, called lazily (only when `/health` is requested and the cached result is expired). Missing `COINGECKO_API_KEY` → `not_configured`, no upstream call. Timeout/5xx → `down`; 429 or slow → `degraded`.
- **D-05:** Cache the `/ping` result for **5 minutes** (not 60 s as first proposed). Reason: a tab left open polling a 60 s cache could spend ≈43k calls/month against the ≈10k Demo cap (see `wiki/pages/concepts/market-data-caching.md`). Health checks must never threaten the market-data call budget.

**Logging (FND-04)**
- **D-06:** pino JSON logs to stdout **and** an append log file (`api/logs/api.log`, git-ignored, simple size/daily rotation). File logs are evidence for later RCA write-ups (RCA-01).
- **D-07:** Request ID: reuse incoming `X-Request-Id` if it is a valid UUID, otherwise generate a UUID v4; always echo it in the `X-Request-Id` response header (CORS must expose it). Every request log line carries `requestId`, `method`, `path`, `status`, `durationMs`. Leave a slot for `userId` (populated from Phase 2).
- **D-08:** Outbound CoinGecko calls get their own log lines (`requestId`, upstream `url` without the API key, `status`, `durationMs`). The API key must never appear in logs — add a pino redaction rule and a unit test for it.
- **D-09:** Error responses use one JSON shape `{ error: { code, message, requestId } }` so bug reports can quote the request ID from the UI/network tab.

**QA artifacts format (QA-01 + templates)**
- **D-10:** All QA docs are Markdown in the repo, readable on GitHub without login:
  - `qa/TEST-PLAN.md` — scope, out of scope, risks (trading-aware: precision, stale price, rate limits, isolation, concurrency), environments, entry/exit criteria, severity & priority definitions, traceability approach.
  - `qa/test-cases/<feature>.md` — one table per feature; IDs `TC-<AREA>-NNN` (e.g. `TC-AUTH-001`); columns: ID, Title, Req (e.g. AUTH-01), Preconditions, Steps, Expected, Priority, Type (positive / negative / boundary / security / UX).
  - `qa/runs/<date>-<scope>.md` — execution reports (build/commit, environment, pass/fail/blocked per TC, linked bugs).
  - `qa/bugs/BUG-NNN-<slug>.md` — steps, expected/actual, severity, priority, environment, request ID, evidence (screenshot, network/log excerpt), linked TC and REQ.
  - `qa/templates/` holds the test-case, run-report and bug-report templates; `.github/ISSUE_TEMPLATE/bug_report.md` mirrors the bug template.
- **D-11:** Severity S1 Critical / S2 Major / S3 Minor / S4 Trivial; Priority P1 / P2 / P3. Definitions live in TEST-PLAN.md with trading-specific examples (e.g. wrong balance after fill = S1).

**Repository & CI (FND-02)**
- **D-12:** Public GitHub repo `pyavchik/crypto-exchange` from day one (commit history + GSD/wiki planning visible to reviewers). Create it and push during execution of plan 01-01. Reversibility: one-way — never commit secrets (`.env` git-ignored, `.env.example` committed).
- **D-13:** GitHub Actions workflow on push and PR: install, lint, typecheck, unit tests for all workspaces, Node 24.

**Project memory (MEM-01..04)**
- **D-14:** The wiki was scaffolded at project init (SCHEMA, index, log, 3 ingests, CLAUDE.md rules), so plan 01-02 becomes: verify MEM-01..04 against the files, backfill the 7 PROJECT.md Key Decisions as ADR pages in `wiki/pages/decisions/`, run a LINT, and append log lines. Don't rebuild what exists.

### Claude's Discretion
- Tooling: npm workspaces, Fastify (API), `better-sqlite3` + Drizzle (SQLite; Phase 1 only needs the connection/migration setup), Vitest (unit tests in web and api), ESLint + Prettier, `concurrently` (or equivalent) for `npm run dev`.
- Styling approach for the dark shell (CSS modules / Tailwind / etc.), log rotation mechanism, exact folder layout inside `web/` and `api/`.
- Whether `qa/` is an npm workspace in Phase 1 (it will host Playwright in Phase 6) or just a docs folder for now.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Stale-price trading rule and market-data refresh strategy remain open for Phase 3/4, already tracked in the wiki.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Developer can run web + api locally with one command (monorepo: `web/`, `api/`, `qa/`) | npm workspaces root scripts + `concurrently`; see Architecture Patterns and Code Examples |
| FND-02 | CI runs lint, typecheck and unit tests on every push to GitHub | GitHub Actions workflow pattern with `actions/setup-node` npm cache; see Code Examples and Common Pitfalls |
| FND-03 | API exposes `GET /health` returning version and upstream (CoinGecko) status | Fastify route handler + lazy 5-min cache pattern; CoinGecko `/ping` verified live this session; see Code Examples |
| FND-04 | API writes structured JSON logs with a request ID that is also returned in a response header (enables log-based RCA) | Fastify `genReqId`/`requestIdHeader` + pino, `@fastify/cors` `exposedHeaders`, pino `redact`; see Code Examples, Common Pitfalls, Security Domain |
| MEM-01 | `wiki/` follows Karpathy's LLM Wiki pattern: `raw/`, wiki pages, `SCHEMA.md` | Already scaffolded — verified by reading `wiki/SCHEMA.md`, `wiki/index.md` this session (see Runtime/Existing-State notes below) |
| MEM-02 | `wiki/index.md` catalogs every wiki page by category, updated on every ingest | Existing `wiki/index.md` read this session; catalogs 8 pages across Sources/Entities/Concepts/Decisions/Findings |
| MEM-03 | `wiki/log.md` is an append-only log with parseable prefixes (`INGEST`, `QUERY`, `LINT`, `DECISION`) | Existing `wiki/log.md` read this session; 6 entries, correct format, `FINDING` prefix also in use (schema allows it) |
| MEM-04 | `CLAUDE.md` tells the agent to consult/update the wiki at phase boundaries | `.claude/CLAUDE.md` §"Project Memory — LLM Wiki" already present and read this session |
| QA-01 | Test strategy / test plan document (scope, risks, environments, entry/exit criteria, severity & priority) | `qa/TEST-PLAN.md` structure per D-10/D-11; see Architecture Patterns |
</phase_requirements>

## Summary

Phase 1 is a greenfield scaffold: an npm-workspaces monorepo (`web/`, `api/`, `qa/`) with a Vite+React+TS frontend, a Fastify+TS backend backed by SQLite (via `better-sqlite3` + Drizzle ORM), GitHub Actions CI, and request-ID-traced pino logging — plus the LLM Wiki (already scaffolded at project init, this phase just verifies/backfills it) and the QA test-plan/templates. The user's CONTEXT.md already locks nearly every architectural decision (health endpoint shape, cache TTL, logging shape, error shape, QA doc format, repo/CI setup); this research therefore focuses on **how to implement those decisions correctly** with current (2026-09-15) library APIs, not on re-litigating the decisions.

The stack recommended here (Fastify 5, pino 10, Drizzle 0.45 + better-sqlite3, Vite 8 + React 19, Vitest 5, TypeScript 7) is current as of today, but several packages returned a `SUS` "too-new" verdict from the legitimacy gate purely because they had a point release within the last ~2 weeks — every one of them has tens to hundreds of millions of weekly downloads and a matching official GitHub org, so this is normal release cadence for actively-maintained infrastructure packages, not a slopsquat signal. TypeScript 7 (the Go-ported native compiler) is confirmed real and current via `npm view typescript dist-tags` — do not assume this is a hallucinated version number.

The two riskiest implementation details are (1) Fastify's request-ID machinery (`genReqId`, `requestIdHeader`, and echoing the ID back via an `onSend` hook plus `@fastify/cors` `exposedHeaders`) and (2) making sure the pino API-key redaction is unit-tested, since D-08 explicitly requires it. Both are covered with verified/cited patterns below. The CoinGecko `/ping` response shape was verified live this session (`{"gecko_says":"(V3) To the Moon!"}`, HTTP 200, no rate-limit headers present) — exact rate-limit numbers remain unverified (already flagged `(unverified)` in the wiki) and are out of scope for Phase 1 since D-05's 5-minute cache is deliberately conservative regardless of the exact cap.

**Primary recommendation:** Scaffold with npm workspaces (`web`, `api`, `qa` as workspace packages or `qa` as a plain docs folder — Claude's discretion), Fastify 5 + pino 10 + `@fastify/cors` for the API, Vite 8 + React 19 for the web shell, `better-sqlite3` + Drizzle ORM 0.45 for persistence (migration setup only — no schema tables needed until Phase 2), Vitest 5 (`test.projects`, not the deprecated `workspace` config) for unit tests in both packages, and a single GitHub Actions workflow job matrix (or 3 parallel jobs) for lint/typecheck/test gated by Node 24 + `actions/setup-node`'s built-in npm cache (works automatically with a single root `package-lock.json`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dev orchestration (`npm run dev`) | Root (monorepo) | — | `concurrently` at repo root starts both `web` and `api` dev servers; neither package owns the other |
| Web app shell, routing, health badge | Browser / Client (React SPA) | Frontend build (Vite) | Client-side routing (placeholder routes) and polling logic live in the browser; Vite only builds/serves |
| `GET /health` | API / Backend | — | Backend owns process identity (version/commit) and orchestrates the upstream check; browser only reads the result |
| CoinGecko `/ping` proxy + cache | API / Backend | — | API key must never reach the browser (constraint from PROJECT.md); 5-min cache lives server-side in memory |
| Request-ID generation & propagation | API / Backend | Browser (echoes ID on error toasts) | Fastify generates/reuses the ID; browser only displays it from response headers/error body |
| Structured JSON logs (stdout + file) | API / Backend | — | pino runs in the Node process; no client-side logging system in this phase |
| SQLite database + migrations | Database / Storage | API / Backend | `better-sqlite3` is an in-process synchronous dri//er — the "database tier" and the API process are the same OS process for this project's deployment model |
| CI (lint/typecheck/test) | Build/CI (GitHub Actions) | — | Runs outside both app tiers; gates merges |
| LLM Wiki (`wiki/`) | Project memory (non-runtime) | — | Not part of the running app; consumed by the agent at planning time only |
| QA docs (`qa/`) | Project memory (non-runtime) | — | Markdown artifacts, no runtime tier |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vite` | 8.3.0 `[VERIFIED: npm registry — npm view vite version, 2026-09-15]` | Web dev server + build | De facto standard for React+TS SPAs; fast HMR, zero-config TS |
| `react` / `react-dom` | 19.3.0 `[VERIFIED: npm registry]` | UI library for the app shell | Locked by PROJECT.md constraint ("React + TypeScript") |
| `typescript` | 7.0.2 `[VERIFIED: npm registry — dist-tags confirm 7.0.2 is `latest` as of 2026-09-15; native Go-ported compiler]` | Type checking across web/api/qa | Locked stack constraint; v7 is the current native-speed compiler line, confirmed via `npm view typescript dist-tags` |
| `fastify` | 5.12.4 `[VERIFIED: npm registry]` | API framework | Built-in structured (pino) logging, fast schema-based validation, first-class TS support — a better fit than Express for a logging/tracing-heavy phase |
| `pino` | 10.3.1 `[VERIFIED: npm registry]` | Structured JSON logger (Fastify's default logger) | Fastify uses pino internally by default; redaction, child loggers and low overhead make it the standard choice |
| `pino-pretty` | 13.1.3 `[VERIFIED: npm registry]` | Human-readable dev console formatting (dev-only, not in prod/file logs) | Standard companion to pino for local dev ergonomics |
| `better-sqlite3` | 13.0.3 `[VERIFIED: npm registry]` | Synchronous SQLite driver | Locked stack constraint (SQLite); synchronous API is simpler to reason about than async drivers for a single-process paper exchange |
| `drizzle-orm` | 0.45.2 `[VERIFIED: npm registry]` | Type-safe SQL layer over `better-sqlite3` | Lightweight, TS-first, matches "Claude's Discretion" note in CONTEXT.md; only connection/migration scaffolding needed this phase |
| `drizzle-kit` | 0.31.10 `[VERIFIED: npm registry]` | Migration generation/apply CLI for Drizzle | Companion tool to `drizzle-orm`; official pairing |
| `vitest` | 5.0.1 `[VERIFIED: npm registry]` | Unit test runner for both `web` and `api` | Vite-native, shares config/transform pipeline with the web build, works standalone in `api` too — avoids running two different test runners |
| `concurrently` | 10.0.5 `[VERIFIED: npm registry]` | Runs `web` and `api` dev servers from one `npm run dev` | Satisfies FND-01 ("one command") without custom shell scripting |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/cors` | 11.3.0 `[VERIFIED: npm registry]` | CORS + exposing `X-Request-Id` to the browser | Required so the web shell's `fetch` can read the response header (D-07) — must set `exposedHeaders` |
| `tsx` | 4.23.13 `[VERIFIED: npm registry]` | Run/watch TS files directly in Node dev mode (`api` dev server) | Simplest way to run the Fastify TS server without a separate build step in dev |
| `@vitejs/plugin-react` | 6.1.1 `[VERIFIED: npm registry]` | Vite's official React plugin (JSX/Fast Refresh) | Required by any Vite+React project |
| `eslint` | 10.10.0 `[VERIFIED: npm registry]` | Linting (FND-02 CI gate) | Flat config (`eslint.config.js`) is the only supported format in this ESLint line |
| `prettier` | 3.9.6 `[VERIFIED: npm registry]` | Formatting | Pairs with ESLint via `eslint-config-prettier` to avoid rule conflicts |
| `pino-roll` | 4.0.0 `[VERIFIED: npm registry]` | Size/daily log file rotation for `api/logs/api.log` | Satisfies D-06's "simple size/daily rotation" without hand-rolling a rotation scheme |
| `uuid` | 14.0.2 `[VERIFIED: npm registry]` | UUID v4 generation for request IDs, IF `crypto.randomUUID()` is not used | Node's built-in `crypto.randomUUID()` (global since Node 19+) covers this without a dependency — prefer the built-in; only pull `uuid` if extra features (validation helpers) are wanted |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fastify | Express | Express has no built-in structured logger or request-ID plumbing — would require `express-pino-logger` + manual middleware, more hand-rolling for a phase whose entire point is traceable logs |
| Drizzle + better-sqlite3 | Prisma | Prisma's SQLite support is solid but adds a heavier codegen step and a separate query engine binary; Drizzle's SQL-close API and zero-codegen model fit a single-process paper exchange better and match "Claude's Discretion" wording |
| Vitest | Jest | Jest works but needs extra config (`ts-jest`/Babel) for TS+ESM in a Vite project; Vitest shares Vite's transform pipeline for free |
| `tsx` (dev) | `ts-node` | `ts-node` is slower and has historically rockier ESM support; `tsx` (esbuild-based) is the more common current choice for TS dev servers |
| `uuid` package | `crypto.randomUUID()` | Built-in avoids a dependency entirely; only add `uuid` if the app needs UUID validation/parsing helpers beyond generation |

**Installation:**
```bash
# from repo root, after creating web/api/qa package.json files and root workspaces config
npm install

# api workspace
npm install fastify pino pino-pretty pino-roll better-sqlite3 drizzle-orm --workspace=api
npm install -D drizzle-kit tsx @types/better-sqlite3 vitest typescript --workspace=api
npm install @fastify/cors --workspace=api

# web workspace
npm install react react-dom --workspace=web
npm install -D vite @vitejs/plugin-react typescript vitest --workspace=web

# root dev tooling
npm install -D concurrently eslint prettier eslint-config-prettier typescript
```

**Version verification:** All versions above were confirmed via `npm view <pkg> version` against the live npm registry on 2026-09-15 (see Package Legitimacy Audit for age/downloads/repo cross-checks). TypeScript's jump to major version 7 was specifically double-checked against `npm view typescript dist-tags` since it is a large version jump versus commonly-cached training knowledge — confirmed genuine (native Go-ported compiler line, `latest` tag = 7.0.2).

## Package Legitimacy Audit

| Package | Registry | Age (last publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|--------------|--------------|---------|-------------|
| `typescript` | npm | 2026-07-08 | 203M | github.com/microsoft/TypeScript | OK | Approved |
| `better-sqlite3` | npm | 2026-08-05 | 7.7M | github.com/WiseLibs/better-sqlite3 | OK | Approved |
| `drizzle-orm` | npm | 2026-03-27 | 16.5M | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `drizzle-kit` | npm | 2026-03-17 | 13.6M | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `pino` | npm | 2026-02-09 | 36.3M | github.com/pinojs/pino | OK | Approved |
| `pino-pretty` | npm | 2025-12-01 | 16.1M | github.com/pinojs/pino-pretty | OK | Approved |
| `concurrently` | npm | 2026-08-15 | 15.1M | github.com/open-cli-tools/concurrently | OK | Approved |
| `prettier` | npm | 2026-07-21 | 93.3M | github.com/prettier/prettier | OK | Approved |
| `@fastify/cors` | npm | 2026-07-08 | 4.7M | github.com/fastify/fastify-cors | OK | Approved |
| `pino-roll` | npm | 2025-10-06 | 189K | github.com/mcollina/pino-roll | OK | Approved |
| `vite` | npm | 2026-09-10 (5 days ago) | 132.5M | github.com/vitejs/vite | SUS ("too-new") | Approved — see note below |
| `react` / `react-dom` | npm | 2026-09-09 (6 days ago) | 128M / 120.6M | github.com/react/react | SUS ("too-new") | Approved — see note below |
| `fastify` | npm | 2026-09-11 (4 days ago) | 9.5M | github.com/fastify/fastify | SUS ("too-new") | Approved — see note below |
| `vitest` | npm | 2026-09-15 (today) | 77M | github.com/vitest-dev/vitest | SUS ("too-new") | Approved — see note below |
| `eslint` | npm | 2026-09-04 (11 days ago) | 113.7M | github.com/eslint/eslint | SUS ("too-new") | Approved — see note below |
| `tsx` | npm | 2026-08-30 (16 days ago) | 64.5M | github.com/privatenumber/tsx | SUS ("too-new") | Approved — see note below |
| `@vitejs/plugin-react` | npm | 2026-08-28 (18 days ago) | 65.1M | github.com/vitejs/vite-plugin-react | SUS ("too-new") | Approved — see note below |

**Packages removed due to `[SLOP]` verdict:** none.

**Packages flagged as suspicious `[SUS]`:** `vite`, `react`, `react-dom`, `fastify`, `vitest`, `eslint`, `tsx`, `@vitejs/plugin-react` — all flagged solely on the "too-new" heuristic (a point-release published within the last ~2 weeks). Every one of these has 4.7M–203M weekly downloads and a GitHub repo URL matching the well-known official org/maintainer (vitejs, facebook-lineage `react/react`, fastify, vitest-dev, eslint, privatenumber). This is the normal release cadence of actively-maintained infrastructure packages, not a slopsquat/hallucination pattern (a newly-squatted package would show near-zero downloads, which none of these do). **The planner should still insert one `checkpoint:human-verify` task before the first `npm install` in plan 01-01**, per the gate's own instruction for `[SUS]` verdicts — use it as a quick sanity check (`npm view <pkg>` + confirm repo) rather than a blocker, since the underlying signal here is release freshness, not identity.

Note: `react`'s registry `repository.url` resolves to `github.com/react/react.git` rather than the historically-known `facebook/react` — confirmed via two independent `npm view` calls this session; combined with 128M weekly downloads this is treated as the legitimate package (React's canonical repo appears to have moved to its own org), not a hijack signal, but flag this specific fact for the human-verify checkpoint since it is the one departure from prior knowledge worth a human glance.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐        GET /health (poll ~60s, tab visible)
│   Browser (React SPA)    │ ─────────────────────────────────────────┐
│  web/  (Vite dev/build)  │                                          │
│  - Nav shell + 4 routes  │ <────────────────────────────────────────┤
│  - Footer health badge   │   200 { status, version, commit,         │
└─────────────────────────┘         upstream.coingecko }              │
                                                                       │
                                   X-Request-Id echoed in resp header │
                                                                       ▼
                              ┌────────────────────────────────────────────┐
                              │  Fastify API (api/, Node+TS)                │
                              │  ┌──────────────────────────────────────┐  │
                              │  │ onRequest hook: reuse/gen requestId   │  │
                              │  └──────────────────────────────────────┘  │
                              │  ┌──────────────────────────────────────┐  │
                              │  │ GET /health handler                   │  │
                              │  │  - reads api/package.json version     │  │
                              │  │  - reads GIT_COMMIT env (fallback dev)│  │
                              │  │  - checks 5-min in-memory /ping cache │  │
                              │  └───────────────┬──────────────────────┘  │
                              │                  │ cache expired            │
                              │                  ▼                         │
                              │  ┌──────────────────────────────────────┐  │
                              │  │ CoinGecko client: GET /ping            │  │
                              │  │  (x-cg-demo-api-key header; own log   │  │
                              │  │   line; key redacted from logs)       │  │
                              │  └──────────────────────────────────────┘  │
                              │  ┌──────────────────────────────────────┐  │
                              │  │ pino logger → stdout + api/logs/api.log│ │
                              │  │  (JSON, requestId/method/path/status/ │  │
                              │  │   durationMs; redact rule for API key)│  │
                              │  └──────────────────────────────────────┘  │
                              │  ┌──────────────────────────────────────┐  │
                              │  │ better-sqlite3 + Drizzle              │  │
                              │  │  (connection + migration scaffold     │  │
                              │  │   only — no domain tables yet)        │  │
                              │  └──────────────────────────────────────┘  │
                              └────────────────────────────────────────────┘
                                                   ▲
                                                   │ upstream, outside this phase's control
                              ┌────────────────────┴───────────────┐
                              │  CoinGecko Demo API                 │
                              │  https://api.coingecko.com/api/v3/  │
                              └──────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ GitHub Actions CI (on push/PR)                                    │
│  actions/checkout → actions/setup-node (node 24, cache: npm)      │
│  → npm ci → npm run lint -ws → npm run typecheck -ws → npm test -ws│
└──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
crypto-exchange/
├── package.json              # root: "workspaces": ["web", "api", "qa"], npm run dev via concurrently
├── .github/workflows/ci.yml
├── web/
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx            # nav shell, route placeholders
│   │   ├── components/HealthBadge.tsx
│   │   └── lib/api.ts         # fetch wrapper for GET /health
│   └── vite.config.ts
├── api/
│   ├── package.json
│   ├── src/
│   │   ├── server.ts           # Fastify instance, plugin registration
│   │   ├── plugins/
│   │   │   ├── request-id.ts   # genReqId + onSend header echo
│   │   │   └── cors.ts
│   │   ├── routes/health.ts
│   │   ├── lib/coingecko.ts    # /ping client, own log lines, 5-min cache
│   │   ├── lib/logger.ts       # pino instance, redact config, file transport
│   │   └── db/
│   │       ├── schema.ts       # Drizzle schema (empty/minimal this phase)
│   │       ├── client.ts       # better-sqlite3 + drizzle() wiring
│   │       └── migrations/
│   ├── logs/                   # git-ignored, pino-roll output
│   └── vitest.config.ts
├── qa/
│   ├── TEST-PLAN.md
│   ├── templates/
│   ├── test-cases/
│   ├── runs/
│   └── bugs/
└── wiki/                        # already scaffolded — Phase 1 verifies/backfills
```

### Pattern 1: Request ID generation, reuse, and echo (Fastify)
**What:** Reuse a valid incoming `X-Request-Id`, else generate one; always echo it back; log it on every line.
**When to use:** Every request, via a Fastify `genReqId` option (controls `request.id`) plus an `onSend` hook to set the response header.
**Example:**
```typescript
// Source: fastify.dev/docs/latest/Reference/Logging (CITED) +
// fastify.dev/docs/latest/Reference/Hooks (onSend pattern, CITED)
import { randomUUID } from 'node:crypto'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const app = Fastify({
  genReqId: (req) => {
    const incoming = req.headers['x-request-id']
    if (typeof incoming === 'string' && UUID_RE.test(incoming)) return incoming
    return randomUUID()
  },
  logger: pinoInstance, // pre-built pino logger, not fastify's default, so it can share the file transport
})

app.addHook('onSend', async (request, reply, payload) => {
  reply.header('x-request-id', request.id)
  return payload
})
```
**Note:** Do NOT rely solely on Fastify's built-in `requestIdHeader` option for this — its docs explicitly warn it performs *no validation* on the header value, so a caller could inject arbitrary strings into logs. D-07 requires *validating* the incoming ID is a UUID before reuse, which means implementing this in `genReqId` (custom function) rather than `requestIdHeader` alone `[CITED: fastify.dev/docs/latest/Reference/Logging]`.

### Pattern 2: Exposing the request-ID header through CORS
**What:** By default, browsers cannot read custom response headers via `fetch()` cross-origin unless the server lists them in `Access-Control-Expose-Headers`.
**When to use:** Always, when `web/` and `api/` run on different ports in dev (Vite dev server + Fastify).
**Example:**
```typescript
// Source: github.com/fastify/fastify-cors README (CITED)
import cors from '@fastify/cors'

await app.register(cors, {
  origin: true, // or explicit dev/prod origin list
  exposedHeaders: ['X-Request-Id'],
})
```

### Pattern 3: pino redaction for the CoinGecko API key
**What:** Prevent `COINGECKO_API_KEY` / the `x-cg-demo-api-key` header from ever reaching stdout or the log file.
**When to use:** Configured once at logger construction; verified with a dedicated unit test (required by D-08).
**Example:**
```typescript
// Source: github.com/pinojs/pino/blob/main/docs/redaction.md (CITED)
import pino from 'pino'

const logger = pino({
  redact: {
    paths: [
      'req.headers["x-cg-demo-api-key"]',
      'headers["x-cg-demo-api-key"]',
      'upstream.headers["x-cg-demo-api-key"]',
    ],
    censor: '[REDACTED]',
  },
})
```
```typescript
// Unit test pattern — capture logger output to a stream and assert the key never appears
// Source: pino redaction docs (CITED) + standard pino test-stream pattern
import { test } from 'vitest'
import pino from 'pino'

test('redacts the CoinGecko API key from logs', () => {
  const lines: string[] = []
  const stream = { write: (msg: string) => { lines.push(msg) } }
  const logger = pino({ redact: ['headers["x-cg-demo-api-key"]'] }, stream)
  logger.info({ headers: { 'x-cg-demo-api-key': 'super-secret-key' } }, 'outbound call')
  expect(lines.join('')).not.toContain('super-secret-key')
})
```

### Pattern 4: Lazy, cached upstream health check (D-04/D-05)
**What:** `/health` calls CoinGecko `/ping` only when the in-memory cache (5 min TTL) is expired — never on a timer.
**When to use:** Inside the `/health` route handler, not a background poller.
**Example:**
```typescript
// Pattern synthesized from CONTEXT.md D-04/D-05 + verified /ping response shape (VERIFIED live curl, this session)
let cached: { status: 'ok' | 'degraded' | 'down'; checkedAt: string; latencyMs: number } | null = null
let cachedAt = 0
const TTL_MS = 5 * 60 * 1000

async function getCoingeckoStatus(): Promise<UpstreamStatus> {
  if (!process.env.COINGECKO_API_KEY) return { status: 'not_configured', checkedAt: new Date().toISOString(), latencyMs: 0 }
  if (cached && Date.now() - cachedAt < TTL_MS) return cached
  const start = Date.now()
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/ping', {
      headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY },
      signal: AbortSignal.timeout(5000),
    })
    const latencyMs = Date.now() - start
    const status = res.status === 429 || latencyMs > 3000 ? 'degraded' : res.ok ? 'ok' : 'down'
    cached = { status, checkedAt: new Date().toISOString(), latencyMs }
    cachedAt = Date.now()
    return cached
  } catch {
    cached = { status: 'down', checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }
    cachedAt = Date.now()
    return cached
  }
}
```
Verified live response for `/ping` this session (no key required for this specific endpoint, HTTP 200): `{"gecko_says":"(V3) To the Moon!"}` `[VERIFIED: live curl to api.coingecko.com/api/v3/ping, 2026-09-15]`. No `X-RateLimit-*` response headers were observed on this call `[VERIFIED: curl -D- against api.coingecko.com/api/v3/ping, 2026-09-15 — no ratelimit/retry-after headers in response]`, so rate-limit awareness must come from tracking call counts server-side, not from parsing response headers.

### Pattern 5: Testing Fastify routes without a live server
**What:** Fastify's `.inject()` lets tests hit routes in-process.
**When to use:** All `api` unit/integration tests for `/health` and error-shape behavior.
**Example:**
```typescript
// Source: fastify.dev/docs/latest/Guides/Testing (CITED)
const response = await app.inject({ method: 'GET', url: '/health' })
expect(response.statusCode).toBe(200)
expect(response.headers['x-request-id']).toBeDefined()
expect(JSON.parse(response.body)).toMatchObject({ status: expect.any(String) })
```

### Anti-Patterns to Avoid
- **Polling `/ping` on a timer independent of `/health` requests:** Violates D-04 ("called lazily"); a background interval would burn the call budget even when nobody is looking at the page.
- **Trusting `requestIdHeader` alone for ID reuse:** Fastify's own docs flag it performs no validation — an attacker could set `X-Request-Id: <script>...` and have it echoed/logged verbatim. Validate as UUID in `genReqId` instead (Pattern 1).
- **Using the deprecated Vitest `workspace` config file:** As of Vitest 3.2+ (current is 5.0.1) `workspace` is deprecated in favor of `test.projects` `[CITED: vitest.dev/guide/projects]`.
- **Logging the raw CoinGecko request/response object without redaction:** Even with a `redact` list, forgetting to add every header alias (`req.headers`, `headers`, custom client wrapper objects) leaks the key — hence D-08's explicit unit-test requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| JSON structured logging + file output | A custom `console.log` wrapper | `pino` + `pino-roll` (file transport) | Pino is what Fastify already uses internally; hand-rolled JSON logging misses redaction, child-logger context propagation, and performance work already done upstream |
| Request ID correlation | A custom middleware storing IDs in a global/AsyncLocalStorage by hand | Fastify's built-in `request.id` (via `genReqId`) + `onSend` hook | Fastify already threads `request.id` through its logger child-logger per request; reinventing this risks losing the ID across async boundaries |
| SQL migrations | Hand-written `ALTER TABLE` scripts run manually | `drizzle-kit generate` / `migrate` | Tracks applied migrations in a `__drizzle_migrations` table automatically `[CITED: orm.drizzle.team/docs/sqlite/migrations]`; hand-rolled tracking is a common source of "works on my machine" schema drift |
| CORS header exposure | Manually setting `Access-Control-Expose-Headers` in each route | `@fastify/cors` plugin's `exposedHeaders` option | One central config point; avoids missing the header on error responses or new routes |
| Log rotation | A custom cron/size-check script that renames `api.log` | `pino-roll` | Handles size AND daily rotation with a maintained library rather than a bespoke script that can lose log lines mid-write |

**Key insight:** Every "don't hand-roll" item above touches the exact evidence chain (request ID → log line → RCA write-up) that is this project's core QA value proposition. A subtly-buggy hand-rolled version of any of these (e.g., a redaction regex that misses one header alias, or a rotation script that truncates a file being written to) would quietly corrupt the RCA story in Phase 6 — better to lean on maintained libraries with their own test suites here.

## Common Pitfalls

### Pitfall 1: `npm run dev` racing before the API's DB file exists
**What goes wrong:** If `better-sqlite3` creates `api/dev.db` lazily on first query and Vite's dev server starts in parallel via `concurrently`, a request that races the DB file creation could error confusingly.
**Why it happens:** `concurrently` starts both processes at once with no readiness ordering.
**How to avoid:** Run migrations (`drizzle-kit migrate` or an idempotent `CREATE TABLE IF NOT EXISTS` at boot) synchronously at Fastify server startup, before `app.listen()` — `better-sqlite3` is synchronous, so this is a simple ordering fix, not a race to engineer around.
**Warning signs:** Intermittent "no such table" errors only on cold start.

### Pitfall 2: `actions/setup-node`'s `cache: npm` silently not caching in a monorepo
**What goes wrong:** If `web/`, `api/`, `qa/` each end up with their own `package-lock.json` (e.g., someone runs `npm install` inside a subfolder instead of at the root), the default cache lookup (root `package-lock.json` only) misses per-package lockfiles and CI runs uncached installs every time.
**Why it happens:** npm workspaces are designed around a single root lockfile; deviating from that breaks the assumption `actions/setup-node` makes by default `[CITED: github.com/actions/setup-node README]`.
**How to avoid:** Never run `npm install` inside `web/`/`api/`/`qa/` directly — always run from the repo root (`npm install`, or `npm install <pkg> --workspace=<name>`), keeping exactly one `package-lock.json` at the root.
**Warning signs:** CI install step takes the same amount of time every run (no cache hit); a stray `package-lock.json` appears inside a workspace folder.

### Pitfall 3: ESLint flat config vs. legacy `.eslintrc` confusion
**What goes wrong:** ESLint 10.x only supports flat config (`eslint.config.js`) — copy-pasting an older `.eslintrc.json` tutorial silently does nothing (ESLint ignores it, or errors depending on setup).
**Why it happens:** A huge amount of cached tutorial/training content still shows `.eslintrc.*`.
**How to avoid:** Use `eslint.config.js` (or `.mjs`/`.ts`) with the flat-config array format from day one; use `@eslint/js` + `typescript-eslint`'s flat presets.
**Warning signs:** `npx eslint .` reports "no files linted" or ignores obviously-bad code.

### Pitfall 4: Forgetting `AbortSignal.timeout()` on the CoinGecko fetch
**What goes wrong:** Without an explicit timeout, a slow/hanging CoinGecko response can hold the `/health` request open indefinitely, which then also blocks the reviewer's health badge and pollutes response-time logs.
**Why it happens:** Native `fetch()` has no default timeout.
**How to avoid:** Always pass `signal: AbortSignal.timeout(Nms)` (Node 18+ built-in) on the outbound `/ping` call, and classify the resulting `AbortError`/timeout as `down` per D-04.
**Warning signs:** `/health` requests occasionally take multiple seconds with no upper bound in logs.

### Pitfall 5: Logging the full outbound URL including the API key as a query param
**What goes wrong:** D-08 requires logging the outbound URL "without the API key" — if a future endpoint change passes the key as a query string instead of a header, the `redact` rules configured for `headers[...]` paths won't catch it.
**Why it happens:** Redaction paths are structural (object key paths), not content-pattern-based; a key embedded in a URL string is invisible to `redact.paths`.
**How to avoid:** Keep the CoinGecko key in the header only (already the plan — `x-cg-demo-api-key`), and when logging the outbound `url`, log a parsed/sanitized URL object (path + query keys, not raw query values) rather than the raw request URL string, as defense in depth.
**Warning signs:** A log line containing `?x-cg-demo-api-key=...` or similar — search logs for the literal key value in CI as a regression check (D-08 already mandates a unit test for this).

## Code Examples

### Root `package.json` workspaces + one-command dev
```jsonc
// Source: npm workspaces is an official npm CLI feature; pattern is standard practice, ASSUMED-shape (not fetched from docs.npmjs.com this session)
{
  "name": "crypto-exchange",
  "private": true,
  "workspaces": ["web", "api", "qa"],
  "scripts": {
    "dev": "concurrently -n api,web \"npm run dev --workspace=api\" \"npm run dev --workspace=web\"",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm test --workspaces --if-present"
  }
}
```

### GitHub Actions CI workflow
```yaml
# Source: pattern synthesized from actions/setup-node official README (CITED) + standard Node CI structure
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'  # keys off the single root package-lock.json — see Pitfall 2
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

### Vitest config using `test.projects` (not deprecated `workspace`)
```typescript
// Source: vitest.dev/guide/projects (CITED, fetched 2026-09-15)
// root vitest.config.ts
export default defineConfig({
  test: {
    projects: ['web', 'api'],
  },
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Vitest `workspace` config file | `test.projects` array in root config | Deprecated since Vitest 3.2 `[CITED: vitest.dev/guide/projects]` | Any tutorial referencing `vitest.workspace.ts` is stale for this project's Vitest 5.0.1 |
| ESLint `.eslintrc.*` | ESLint flat config (`eslint.config.js`) | ESLint 9+ made flat config the default/only format | Copy-pasted legacy config snippets will not work |
| TypeScript classic (JS-implemented) compiler | TypeScript 7 native (Go-ported) compiler | TS 7.0 general release `[VERIFIED: npm view typescript dist-tags, 2026-09-15]` | Compile/typecheck performance improves; watch for any tooling (editor plugins, ts-node-style tools) that hasn't caught up to the native compiler line — `tsx` (esbuild-based) is unaffected since it doesn't use `tsc` for transpilation |

**Deprecated/outdated:**
- Vitest `workspace` file: superseded by `projects`, still works via alias in some versions but flagged deprecated — don't introduce it new.
- `ts-node`: increasingly superseded by `tsx` for dev-mode TS execution due to ESM friction; not used in this stack.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | CoinGecko Demo plan's exact rate limit (calls/min) and monthly cap (~10k) — already flagged `(unverified)` in `wiki/pages/entities/coingecko-api.md` | Summary, Pattern 4 | Low for Phase 1 — D-05's 5-min cache is deliberately conservative and does not depend on the exact number; matters more for Phase 3 (DATA-02) |
| A2 | Root `package.json` workspaces script shape (`npm run <script> --workspaces --if-present`) — synthesized from general npm workspaces knowledge, not fetched from docs.npmjs.com this session | Code Examples | Low — this is standard, well-documented npm CLI behavior; if wrong, `npm run lint --workspaces` simply needs the `--if-present` flag adjusted |
| A3 | `qa/` as an npm workspace vs. a plain docs folder — left to Claude's discretion per CONTEXT.md; this research assumes it starts as a plain Markdown folder (no `package.json`) since Phase 1 has no test automation, and becomes a workspace in Phase 6 when Playwright arrives | Recommended Project Structure | Low — reversible; adding a `package.json` to `qa/` later is a small, isolated change |
| A4 | Exact folder layout inside `web/src/` and `api/src/` (routes/, plugins/, lib/, db/) — a reasonable Fastify/Vite convention, not dictated by any locked decision | Recommended Project Structure | Low — purely organizational, explicitly Claude's discretion |

**If this table is empty:** N/A — see entries above; all are low-risk / already flagged in the existing wiki.

## Open Questions

1. **Does the CoinGecko `/ping` endpoint require `x-cg-demo-api-key` for a Demo-tier key, given it succeeded without any key in this session's live test?**
   - What we know: An unauthenticated call to `https://api.coingecko.com/api/v3/ping` returned HTTP 200 with `{"gecko_says":"(V3) To the Moon!"}` today, no key sent `[VERIFIED: live curl, 2026-09-15]`.
   - What's unclear: Whether a configured Demo key changes the response (e.g., different rate-limit tier) or whether `/ping` is simply always public regardless of plan — CoinGecko's own docs don't spell this out `[per WebFetch of docs.coingecko.com/demo/reference/authentication this session]`.
   - Recommendation: Implement D-04 as specified (send the key when configured, treat missing key as `not_configured` per the locked decision) — this open question doesn't change the implementation, since the decision already handles both cases; just don't assume a 200-without-key result proves the key is unnecessary for other endpoints (`/coins/markets` etc. in Phase 3 are known to require it).

2. **Exact shape of `pino-roll`'s options for "simple size/daily rotation" (D-06) wasn't pinned down to specific option names this session.**
   - What we know: `pino-roll` is a maintained, current (2025-10-06 publish) transport for pino that supports both size- and time-based rotation.
   - What's unclear: The precise config keys (`size`, `interval`, `frequency`) for the exact "daily + size cap" combination D-06 describes — this session's research budget went to the higher-risk request-ID/redaction patterns instead.
   - Recommendation: Planner should have the 01-01 plan's implementation task read `pino-roll`'s README directly (via `npm view pino-roll readme` or the GitHub repo) as a first step before wiring the transport, rather than guessing option names.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All of `web`/`api`/`qa`, CI | ✓ | 24.14.0 `[VERIFIED: node -v, this session]` | — |
| npm | Workspaces, CI installs | ✓ | 11.11.1 `[VERIFIED: npm -v, this session]` | — |
| git | Repo, CI commit SHA injection (D-03) | ✓ | repo present, `main` branch, clean tree `[VERIFIED: git status, this session]` | — |
| GitHub remote / `gh` CLI | D-12 (create public repo `pyavchik/crypto-exchange`) | No remote configured yet `[VERIFIED: git remote -v, this session — empty]`; `gh` reported authenticated as `pyavchik` per CONTEXT.md | — | Plan 01-01 must create the repo (`gh repo create`) and add the remote before CI can run |
| Network access to `api.coingecko.com` | `/health` upstream check, local dev | ✓ | Live `/ping` call succeeded this session, HTTP 200 | — |
| `COINGECKO_API_KEY` env var | D-04 (`not_configured` fallback path) | Not verified — no `.env` file exists yet in this greenfield repo | — | D-04 already defines the `not_configured` fallback; no blocker, just needs a `.env.example` entry |

**Missing dependencies with no fallback:** None — the one missing piece (GitHub remote) is explicitly a plan 01-01 task per D-12, not a blocker to plan.

**Missing dependencies with fallback:** `COINGECKO_API_KEY` — handled by the already-locked `not_configured` status path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1 (both `web` and `api` workspaces) `[VERIFIED: npm registry]` |
| Config file | none yet — Wave 0 gap, create `web/vitest.config.ts`, `api/vitest.config.ts`, optionally a root `vitest.config.ts` with `test.projects: ['web', 'api']` `[CITED: vitest.dev/guide/projects]` |
| Quick run command | `npm test --workspace=api` / `npm test --workspace=web` (single file: `npx vitest run path/to/file.test.ts`) |
| Full suite command | `npm test --workspaces --if-present` (root script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| FND-01 | `npm run dev` boots both servers; web shows health status | manual/smoke (no automated test — process orchestration) | `npm run dev` then manual browser check | ❌ Wave 0 (no automated coverage planned; document manual verification step in plan) |
| FND-02 | CI runs lint/typecheck/unit on push | meta — verified by CI itself passing | `npm run lint && npm run typecheck && npm test` (run locally first) | ❌ Wave 0 — needs `eslint.config.js`, `tsconfig.json`(s), and at least one test file per workspace so `npm test` isn't a no-op |
| FND-03 | `GET /health` returns correct shape, correct upstream classification | unit/integration (Fastify `.inject()`) | `npx vitest run api/src/routes/health.test.ts -t health` | ❌ Wave 0 — `api/src/routes/health.test.ts` |
| FND-04 | `X-Request-Id` echoed in response header; request log line has requestId/method/path/status/durationMs; API key redacted | unit (Fastify `.inject()` + captured pino stream) | `npx vitest run api/src/plugins/request-id.test.ts`, `npx vitest run api/src/lib/logger.test.ts` | ❌ Wave 0 — both files, including the redaction test explicitly required by D-08 |
| MEM-01..04 | Wiki structure/index/log/CLAUDE.md rules present and correctly formatted | manual/doc check (already verified this research session by reading the files) | n/a — file-existence + format review, not unit-testable | n/a |
| QA-01 | `qa/TEST-PLAN.md` defines scope/risks/severity-priority/entry-exit criteria | manual/doc check | n/a — document review against D-10/D-11 checklist | n/a |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <changed-file>.test.ts`
- **Per wave merge:** `npm test --workspaces --if-present` (full suite)
- **Phase gate:** Full suite green (plus `npm run lint`, `npm run typecheck`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `web/vitest.config.ts` + `api/vitest.config.ts` (or root config with `test.projects`) — framework install/config
- [ ] `api/src/routes/health.test.ts` — covers FND-03 (status shape, upstream classification branches: ok/degraded/down/not_configured)
- [ ] `api/src/plugins/request-id.test.ts` — covers FND-04 (reuse valid UUID, reject/replace invalid header value, header echoed)
- [ ] `api/src/lib/logger.test.ts` — covers FND-04/D-08 (redaction unit test — API key never appears in captured log output)
- [ ] `eslint.config.js` (root, flat config) — covers FND-02 lint gate
- [ ] `tsconfig.json` per workspace + a root `tsconfig.base.json` if shared — covers FND-02 typecheck gate
- [ ] Framework install: `npm install -D vitest --workspace=web --workspace=api` (or root, if shared devDependency)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | No | Not in scope — no accounts until Phase 2 |
| V3 Session Management | No | Not in scope until Phase 2 |
| V4 Access Control | No | Not in scope until Phase 2 |
| V5 Input Validation | Yes (minimal) | Validate incoming `X-Request-Id` as a UUID before reuse (Pattern 1) — the only user-controlled input this phase accepts |
| V6 Cryptography | No | No crypto operations this phase (UUID generation via `node:crypto.randomUUID()`, not a security-sensitive crypto op) |
| V7/V16 Error Handling & Logging `[CITED: github.com/OWASP/ASVS — V7 in 4.0.3, renamed V16 in 5.0.0]` | Yes | pino `redact` for the CoinGecko API key (D-08); uniform `{ error: { code, message, requestId } }` shape (D-09) avoids leaking stack traces/internals to clients; request ID enables correlation without logging sensitive data `[CITED: cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html]` |
| V14 Configuration | Yes | `.env` git-ignored, `.env.example` committed (D-12); `COINGECKO_API_KEY` never sent to the browser (already a PROJECT.md constraint, enforced structurally by keeping the CoinGecko client server-side only) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Log injection via unvalidated `X-Request-Id` header (attacker sets a header containing newlines/control chars or fake log-format text to forge log entries) | Tampering / Repudiation | Validate as strict UUID v4 format before reuse (Pattern 1); reject anything non-matching and generate a fresh UUID instead of echoing attacker input |
| Sensitive data (API key) leaking into logs or error responses | Information Disclosure | pino `redact` (Pattern 3) + unit test (D-08); uniform error shape never includes raw upstream error bodies |
| CORS misconfiguration exposing more than intended (e.g., `origin: true` reflecting any origin in production) | Information Disclosure / Spoofing | Scope `@fastify/cors` `origin` to explicit allow-list per environment (dev: Vite dev server origin; prod: the deployed web origin) rather than `origin: true` everywhere — flag this as a follow-up for Phase 7 deploy config, since Phase 1 dev-only usage of `origin: true` is a reasonable interim default |
| Secrets committed to a public repo (D-12 makes the repo public from day one) | Information Disclosure | `.env` git-ignored from the very first commit, `.env.example` with placeholder values only, pre-commit awareness (no secret-scanning tool mandated by CONTEXT.md, but the plan should ensure `.gitignore` includes `.env` and `api/logs/` before the first push) |

## Sources

### Primary (HIGH confidence)
- Live `npm view` calls against the npm registry for all package versions/publish dates/downloads/repo URLs (this session, 2026-09-15)
- Live `curl` to `https://api.coingecko.com/api/v3/ping` (this session, 2026-09-15) — response body and headers observed directly

### Secondary (MEDIUM confidence — official docs, fetched this session)
- [fastify.dev/docs/latest/Reference/Logging](https://fastify.dev/docs/latest/Reference/Logging/) — `genReqId`, `requestIdHeader` behavior and validation warning
- [fastify.dev/docs/latest/Guides/Testing](https://fastify.dev/docs/v5.8.x/Guides/Testing/) — `.inject()` pattern
- [github.com/fastify/fastify-cors README](https://github.com/fastify/fastify-cors/blob/main/README.md) — `exposedHeaders` config
- [github.com/pinojs/pino/blob/main/docs/redaction.md](https://github.com/pinojs/pino/blob/main/docs/redaction.md) — `redact` option, `paths`/`censor`/`remove`
- [orm.drizzle.team/docs/sqlite/migrations](https://orm.drizzle.team/docs/sqlite/migrations) — Drizzle SQLite migration workflow, `__drizzle_migrations` tracking table
- [vitest.dev/guide/projects](https://vitest.dev/guide/projects) — `test.projects` replacing deprecated `workspace` config (confirmed since Vitest 3.2)
- [github.com/actions/setup-node](https://github.com/actions/setup-node) — `cache: 'npm'` keys off root lockfile by default, `cache-dependency-path` for non-default layouts
- [docs.coingecko.com/demo/reference/authentication](https://docs.coingecko.com/demo/reference/authentication) — `x-cg-demo-api-key` header name
- [github.com/OWASP/ASVS](https://github.com/OWASP/ASVS) — V7 (4.0.3) / V16 (5.0.0) logging requirements: no sensitive data in logs, correlation-friendly format
- [cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — logging best practices

### Tertiary (LOW confidence — WebSearch synthesis only, not independently fetched from an official source)
- General npm workspaces monorepo folder-structure conventions (various blog posts) — used only for the `apps/`-vs-flat-folder judgment call, low-stakes since it's explicitly Claude's discretion in CONTEXT.md
- Exact `pino-roll` config option names — not resolved this session, flagged as Open Question 2

## Metadata

**Confidence breakdown:**
- Standard stack (versions/existence): HIGH — every package version verified live against the npm registry this session
- Architecture/request-ID/logging patterns: MEDIUM — verified against official Fastify/pino/Vitest/GitHub docs fetched this session, but not tested against a running instance of this exact codebase (doesn't exist yet)
- CoinGecko `/ping` shape: HIGH for the response body (live-verified); LOW/unverified for exact rate limits (already flagged as such in the existing wiki, not re-resolved here since out of scope for Phase 1's conservative 5-min cache)
- QA docs / wiki structure: HIGH — these already exist in the repo and were read directly this session; Phase 1's job is to verify/backfill, not invent

**Research date:** 2026-09-15
**Valid until:** ~2026-10-15 (30 days) for architecture patterns; package *versions* should be re-verified at execution time regardless, since several are on a fast release cadence (weekly/biweekly point releases observed for vite/react/fastify/vitest/eslint/tsx)

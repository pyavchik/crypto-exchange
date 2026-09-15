---
title: Foundation skeleton conventions (health, logs, QA docs, repo)
type: decision
updated: 2026-09-15
sources: []
related: [[market-data-caching]], [[coingecko-api]], [[qa-portfolio-alignment]]
---

# Foundation skeleton conventions

**Status:** Accepted (Phase 1 discuss, 2026-09-15). Full detail: `.planning/phases/01-foundation-project-memory/01-CONTEXT.md`.

## Context

Phase 1 sets conventions every later phase and every QA artifact depends on: how failures are traced (RCA-01), how test docs look, and where the code lives.

## Decision

- **Request ID is the evidence thread:** valid incoming `X-Request-Id` reused, else UUID v4; echoed in the response header and in errors `{ error: { code, message, requestId } }`; pino JSON logs to stdout + `api/logs/api.log`. API key redacted from logs.
- **`/health`** reports version, commit and CoinGecko status (`ok|degraded|down|not_configured`) from `/ping`, cached **5 min**, called lazily — health checks must not eat the Demo call budget ([[market-data-caching]]).
- **Web shell:** dark Binance-style layout with placeholder routes and a footer health badge + CoinGecko attribution.
- **QA docs:** Markdown in `qa/` — `test-cases/<feature>.md` (`TC-<AREA>-NNN`), `runs/`, `bugs/BUG-NNN-*.md`; severity S1–S4, priority P1–P3.
- **Repo:** public `pyavchik/crypto-exchange` from day one; GitHub Actions (lint, typecheck, unit) on Node 24.

## Consequences

- Reviewers can follow a bug from UI error → network tab → log line → bug report → RCA via one ID.
- Public history means secrets must never be committed (`.env` ignored, `.env.example` tracked).

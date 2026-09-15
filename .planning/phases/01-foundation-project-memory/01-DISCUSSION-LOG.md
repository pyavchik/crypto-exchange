# Phase 1: Foundation & Project Memory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 1-Foundation & Project Memory
**Areas discussed:** Web shell, Health & logs, QA doc format, GitHub repo

Questions were asked as one plain-text batch with recommended defaults (user preference); user replied "ok" accepting all defaults.

---

## Web shell

| Option | Description | Selected |
|--------|-------------|----------|
| Binance-style dark shell | Top nav with placeholder Markets/Trade/Wallet/Orders, footer with API health badge + "Powered by CoinGecko" | ✓ |
| Bare health status page | Styling deferred to Phase 3 | |

**User's choice:** Binance-style dark shell

---

## Health & logs

| Option | Description | Selected |
|--------|-------------|----------|
| Full health + file logs | `/health` with version, git SHA, CoinGecko `/ping` status (cached), `not_configured` without key; pino JSON to stdout + file; honour valid incoming `X-Request-Id`; separate upstream call logs | ✓ |
| Minimal | No upstream check until Phase 3; stdout-only logs | |

**User's choice:** Full health + file logs
**Notes:** Proposed 60 s `/ping` cache was raised to 5 min while writing context — 60 s polling could consume ≈43k calls/month vs ≈10k Demo cap (wiki market-data-caching).

---

## QA doc format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown in repo | `qa/test-cases/<feature>.md` tables with `TC-AUTH-001` IDs, `qa/runs/`, `qa/bugs/BUG-NNN-*.md`, GitHub Issue template, S1–S4 / P1–P3 | ✓ |
| Spreadsheet + Issues | CSV/spreadsheet test cases (TMS-like), bugs only as GitHub Issues | |

**User's choice:** Markdown in repo

---

## GitHub repo

| Option | Description | Selected |
|--------|-------------|----------|
| Public from day one | `crypto-exchange`, history and AI-assisted planning visible | ✓ |
| Private until Phase 7 | Flip to public at ship | |

**User's choice:** Public from day one

---

## Claude's Discretion

- npm workspaces, Fastify, better-sqlite3 + Drizzle, Vitest, ESLint + Prettier, GitHub Actions on Node 24
- Styling approach, log rotation mechanism, internal folder layout, whether `qa/` is a workspace yet

## Deferred Ideas

None.

---
title: Project overview
type: concept
updated: 2026-09-15
sources: [raw/2026-09-15-railsware-senior-qa-tradezella.md, raw/2026-09-15-karpathy-llm-wiki.md]
related: [[qa-portfolio-alignment]], [[coingecko-api]], [[order-rules]]
---

# Project overview

Binance-style **paper-trading** exchange on CoinGecko market data, built as a QA portfolio for a
Railsware Senior QA (TradeZella) application.

- Stack: React+TS (Vite) · Node+TS API · SQLite · Playwright TS
- Repo layout (planned): `web/`, `api/`, `qa/` (test plan, cases, bugs, RCA, Playwright, API collection), `wiki/`, `.planning/`
- Roadmap: 7 phases — Foundation & Memory → Accounts → Live Markets → Wallet & Market Orders → Limit Orders & History → QA Hardening → Ship
- Source of truth for scope: `.planning/REQUIREMENTS.md`; for progress: `.planning/STATE.md`

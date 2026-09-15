<!-- GSD:project-start source:PROJECT.md -->

## Project

**CoinGecko Paper Exchange**

A Binance-style **simulated (paper-trading) crypto exchange**: users sign up, get a virtual USDT balance, browse live markets, and place market and limit orders priced from the free CoinGecko Demo API. It is a portfolio project for a **Senior QA Engineer (TradeZella) application at Railsware**. The app is the system under test; the **QA artifacts** (manual test plan, test cases, bug reports, API tests, Playwright e2e, root-cause write-ups) are the headline deliverable.

**Core Value:** A reviewer can open the live demo, place a trade, and then open the QA docs and see a rigorous, trading-aware test effort against that exact flow — balances, orders and P&L must be correct and demonstrably tested.

### Constraints

- **Budget**: $0 — CoinGecko Demo key, free-tier hosting and database
- **Tech stack**: React + TypeScript (Vite) frontend; Node + TypeScript backend; SQLite; Playwright TS — one language across app and automation, matches the job's nice-to-have
- **Rate limits**: All CoinGecko calls go through a backend cache — the UI must never call CoinGecko directly, and polling must stay within Demo limits
- **Money math**: Balances and quantities use decimal-safe arithmetic (no floating-point) — correctness is what the QA story is about
- **Audience**: Reviewers spend minutes, not hours — demo account, seeded data and a README that links straight to QA artifacts

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

## Project Memory — LLM Wiki

Durable knowledge lives in `wiki/` (Karpathy LLM Wiki pattern); conventions in `wiki/SCHEMA.md`.
`.planning/` = execution state (GSD). `wiki/` = what we learned and why. Link, don't duplicate.

- **Session start / before planning a phase:** read `wiki/index.md`, then the pages relevant to the phase (e.g. `order-rules`, `coingecko-api`).
- **New external source** (docs page, article, job info): INGEST per SCHEMA.md — save to `wiki/raw/` (immutable), write source page, update entity/concept pages, `index.md`, append to `log.md`.
- **Key decision made in discuss/plan:** write `wiki/pages/decisions/<slug>.md` and mirror one line in `.planning/PROJECT.md` Key Decisions.
- **Bug, gotcha or RCA found during execution/testing:** write `wiki/pages/findings/<slug>.md` and link it from the matching artifact in `qa/`.
- **Phase transition:** LINT the wiki (contradictions, stale/unverified facts, orphans, broken `[[links]]`) and append a `LINT` line to `wiki/log.md`.
- Never edit files in `wiki/raw/`. Never rewrite past lines in `wiki/log.md`.

# Wiki Index

Conventions: [SCHEMA.md](SCHEMA.md) · Log: [log.md](log.md)

## Overview
- [Project overview](pages/concepts/project-overview.md) — what we're building, stack, roadmap shape

## Sources
- [Railsware Senior QA (TradeZella) job posting](pages/sources/railsware-senior-qa-tradezella.md) — why the project exists
- [CoinGecko Demo API docs](pages/sources/coingecko-demo-api-docs.md) — base URL, key header, endpoints
- [Karpathy LLM Wiki gist](pages/sources/karpathy-llm-wiki.md) — the memory pattern used here

## Entities
- [CoinGecko API (Demo plan)](pages/entities/coingecko-api.md) — market data source, limits, implications

## Concepts
- [QA portfolio ↔ job alignment](pages/concepts/qa-portfolio-alignment.md) — job requirement → artifact → REQ-ID
- [Order & balance rules](pages/concepts/order-rules.md) — test oracle for trading; open questions
- [Market data caching & stale handling](pages/concepts/market-data-caching.md) — cache TTL, 429 fallback, call budget

## Decisions
- [Foundation skeleton conventions](pages/decisions/foundation-skeleton-conventions.md) — request-ID logging, /health, QA doc format, public repo
- [Paper-trading exchange scope](pages/decisions/paper-trading-scope.md) — simulated Binance-style exchange, spot only, no real money
- [Limit order fill model](pages/decisions/limit-order-fill-model.md) — fills on reference-price cross, no matching engine
- [Tech stack](pages/decisions/tech-stack.md) — React+TS / Node+TS / SQLite, concrete Phase 1 versions
- [Backend proxy + cache for CoinGecko](pages/decisions/coingecko-proxy.md) — key server-side only, rate limits respected
- [QA artifacts are first-class deliverables](pages/decisions/qa-first-class.md) — every phase ships QA alongside FE+BE
- [LLM Wiki (Karpathy) for project memory](pages/decisions/llm-wiki-memory.md) — durable knowledge lives in wiki/
- [Free hosting + public repository](pages/decisions/free-hosting-public-repo.md) — public repo from day one, hosting choice open
- [Session authentication model](pages/decisions/session-auth-model.md) — scrypt passwords, opaque session cookies, cookie-only identity, atomic balance grant

## Findings
- [Health badge always shows "API unreachable"](pages/findings/health-poller-illegal-invocation.md) — unbound `timers.setTimeout` throws Illegal invocation in browsers; Node tests miss it

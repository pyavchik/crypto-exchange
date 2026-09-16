# Wiki Log

Append-only. Format: `YYYY-MM-DD | TYPE | summary | pages touched`

2026-09-15 | INGEST | Karpathy LLM Wiki gist — adopted as memory pattern, wrote SCHEMA.md | sources/karpathy-llm-wiki, concepts/project-overview
2026-09-15 | INGEST | Railsware Senior QA (TradeZella) posting | sources/railsware-senior-qa-tradezella, concepts/qa-portfolio-alignment, concepts/project-overview
2026-09-15 | INGEST | CoinGecko Demo API docs (auth + endpoint index) | sources/coingecko-demo-api-docs, entities/coingecko-api, concepts/market-data-caching
2026-09-15 | FINDING | Refreshing 20 pairs/min would exceed the ≈10k/month Demo cap (unverified) — needs refresh strategy decision in Phase 3 | concepts/market-data-caching
2026-09-15 | LINT | Initial lint: 8 pages, 0 orphans, 0 broken links, 4 unverified claims flagged | all
2026-09-15 | DECISION | Phase 1 discuss: request-ID logging, /health with 5-min cached /ping, dark shell, Markdown QA docs, public repo | decisions/foundation-skeleton-conventions, index
2026-09-15 | DECISION | Backfilled 7 PROJECT.md Key Decisions as ADR pages | decisions/paper-trading-scope, decisions/limit-order-fill-model, decisions/tech-stack, decisions/coingecko-proxy, decisions/qa-first-class, decisions/llm-wiki-memory, decisions/free-hosting-public-repo, index
2026-09-15 | LINT | Phase 1 memory backfill lint: 16 pages, 0 orphans, 0 broken links, 5 unverified mentions flagged | all
2026-09-15 | LINT | Phase 1 transition lint: 16 pages, 0 orphans, 0 broken links, 5 unverified mentions, 0 contradictions found | all
2026-09-15 | FINDING | Phase 1 UAT: health poller calls timers.setTimeout unbound -> Illegal invocation in browsers, badge always "API unreachable" | findings/health-poller-illegal-invocation, index
2026-09-16 | FINDING | Health poller Illegal invocation fixed (01-09), real-browser step added to npm run smoke (01-10), BUG-001 filed | findings/health-poller-illegal-invocation, decisions/tech-stack
2026-09-16 | DECISION | Phase 2 close: scrypt password hashing, opaque session cookies, cookie-only identity, atomic 10k USDT grant, login/signup error asymmetry, no rate limiting deferred to Phase 6 | decisions/session-auth-model, index
2026-09-16 | LINT | Phase 2 transition lint (base afc60aa): pages=18 orphans=0 broken_links=0 duplicates=0 unverified=5 errors=0; read foundation-skeleton-conventions, tech-stack and health-poller-illegal-invocation for contradictions against the new ADR, none found | all

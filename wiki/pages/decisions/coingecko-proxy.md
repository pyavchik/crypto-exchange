---
title: Backend proxy + cache for CoinGecko
type: decision
updated: 2026-09-15
sources: [raw/2026-09-15-coingecko-demo-api.md]
related: [[coingecko-api]], [[market-data-caching]], [[foundation-skeleton-conventions]]
---

# Backend proxy + cache for CoinGecko

**Status:** Accepted (project init, 2026-09-15). Recorded in `.planning/PROJECT.md` Key Decisions row
4.

## Context

The CoinGecko Demo API key must never reach the browser, and its rate limits — about 30
calls/min and 10k calls/month (unverified) ([[coingecko-api]]) — must be respected regardless
of how many clients are viewing the app.

## Decision

- Every CoinGecko call goes through the backend; the `x-cg-demo-api-key` header is attached
  server-side only and is never sent to, or logged from, the client.
- The upstream base URL is overridable (`COINGECKO_BASE_URL`) so tests and stubs can point at a
  local fake instead of the live API.
- Phase 1 applies this to `/health`'s `/ping` check: a lazy, 5-minute SQLite-backed cache,
  called only when a client hits `/health` ([[foundation-skeleton-conventions]]).
- The Phase 3 market-data TTL and refresh strategy (how often `/coins/markets` and
  `/simple/price` are refreshed) is still open — see [[market-data-caching]] for the options
  under consideration.

## Consequences

- Any number of concurrent browser clients shares one upstream call budget, so the Demo rate
  limits are respected no matter how many reviewers are looking at the demo simultaneously.
- Upstream 429s and timeouts become deliberate, reproducible test scenarios (DATA-03, AUT-03)
  instead of production incidents, since the backend controls exactly when and how often it
  calls out.

---
title: Market data caching & stale handling
type: concept
updated: 2026-09-16
sources: [raw/2026-09-15-coingecko-demo-api.md]
related: [[coingecko-api]], [[order-rules]], [[market-data-cache-and-stale]]
---

# Market data caching & stale handling

**As built (Phase 3, DATA-01..04, MKT-04)** — see [[market-data-cache-and-stale]] for the full
decision record (context/decision/consequences); this page stays the quick-reference summary.

- One keyed in-memory `Map` cache (`api/src/lib/keyedCache.ts`) backs both `GET /api/markets` and
  `GET /api/markets/:id/chart`, with in-flight-request dedupe so concurrent callers for the same
  resource collapse into one upstream call. TTLs: 45s markets, 2min chart-1D, 10min chart-7D/30D.
- **Verified Demo plan limits (resolves this page's prior "unverified" marker):** **100 calls/min,
  10,000 call credits/month**, cross-checked directly against
  `docs.coingecko.com/docs/errors-and-rate-limits` and `coingecko.com/en/api/pricing` (both
  fetched 2026-09-16) — supersedes an older "30 calls/min" figure still circulating in
  search-indexed support content.
- **Monthly budget arithmetic, corrected against the verified limits:** continuous, unattended
  polling at the TTLs above sums to roughly 5.7-9x the 10,000/month cap if driven nonstop 24/7
  (the markets endpoint alone is `86400s/day ÷ 45s × 30 days ≈ 57,600 calls/month`). Realistic
  reviewer-only traffic (minutes, not hours, per session) sits far inside the cap. **This is an
  accepted, documented risk** (`qa/TEST-PLAN.md` R-05), not an unmitigated gap — the decision and
  its reversal condition (a daily call counter, if warranted) are recorded in
  [[market-data-cache-and-stale]].
- On 429/timeout/5xx: serve the last-good cached value with `stale: true` + its original
  `fetchedAt` (never a fresh timestamp); the UI shows a dated "Prices delayed" banner; the server
  logs exactly one `"serving stale market data"` line per real failure with the request id and
  reason.
- **Still open:** the trading rule for stale prices (block market orders when data is stale, or
  trade anyway with a warning?) is unresolved — deferred to the phase that implements market
  orders (Phase 4) → [[order-rules]].

---
title: Market data caching & stale handling
type: concept
updated: 2026-09-15
sources: [raw/2026-09-15-coingecko-demo-api.md]
related: [[coingecko-api]], [[order-rules]]
---

# Market data caching & stale handling

Planned design (Phase 3, DATA-01..04):

- Backend holds a TTL cache (≈30–60 s) per endpoint+params; one upstream refresh serves all clients.
- Monthly budget sanity check (unverified limits): refreshing `/coins/markets` for 20 pairs once a minute
  ≈ 43k calls/month — **exceeds ≈10k**. Options to decide in Phase 3 planning: refresh every ~5 min when idle,
  refresh only while a client is active, or batch `/simple/price` calls. Record the decision in `pages/decisions/`.
- On 429/timeout: serve last good value with `stale: true` + `fetchedAt`; UI shows "prices delayed".
- Trading against stale prices: rule to be decided (block market orders when data older than N minutes?) → [[order-rules]].

---
title: Limit order fill model (reference-price cross, no matching engine)
type: decision
updated: 2026-09-15
sources: []
related: [[order-rules]], [[coingecko-api]], [[market-data-caching]]
---

# Limit order fill model

**Status:** Accepted (project init, 2026-09-15). Recorded in `.planning/PROJECT.md` Key Decisions row
2.

## Context

CoinGecko provides no order book, so limit orders cannot fill against real counterparties. A
deterministic, testable fill rule is needed instead ([[order-rules]]).

## Decision

- A limit order fills when the CoinGecko reference price crosses the limit: a buy fills when
  price is at or below the limit, a sell fills when price is at or above the limit.
- Crossing is checked on each price refresh, not continuously — there is no tick-by-tick
  matching and no user-to-user order book ([[coingecko-api]]).

## Consequences

- Fill logic is deterministic and unit-testable: given a price series and a limit, the fill
  outcome is fully predictable.
- Fills happen only as often as prices refresh — roughly once a minute, since the upstream
  cache interval is (unverified) ([[market-data-caching]]) — so a crossed limit order can sit
  unfilled for up to one refresh interval.
- The open questions already tracked on [[order-rules]] — exact fill price (limit vs. reference
  price at check time), which asset the fee is taken from, and behaviour on stale price data —
  stay open here; this decision only fixes the crossing rule, not those details. They are
  resolved during Phase 4-5 planning.

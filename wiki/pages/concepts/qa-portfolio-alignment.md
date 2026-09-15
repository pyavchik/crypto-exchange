---
title: QA portfolio ↔ job requirement alignment
type: concept
updated: 2026-09-15
sources: [raw/2026-09-15-railsware-senior-qa-tradezella.md]
related: [[railsware-senior-qa-tradezella]], [[order-rules]]
---

# QA portfolio ↔ job requirement alignment

| Job asks for | Where the portfolio shows it | Req IDs |
|--------------|------------------------------|---------|
| Manual & end-to-end testing | Per-feature test cases + execution reports | QA-02..05 |
| UX / usability validation | UX review of trading flow, exploratory charters | QA-06 |
| Analyze requirements, find defects/confusions/edge cases | Open questions in [[order-rules]], bug reports | QA-07 |
| L3 RCA, log analysis | Request-ID JSON logs + RCA write-ups | FND-04, RCA-01 |
| HTTP/API/web architecture | API test collection, 429/stale tests, network-tab evidence | AUT-01, AUT-03, DATA-03 |
| Git / GitHub | Public repo, CI, atomic GSD commits | FND-02, SHIP-03 |
| AI tools in workflow | GSD planning + LLM Wiki memory, described in README | MEM-* |
| Trading experience | Fees, min notional, limit crossing, P&L method | TRD-*, ORD-* |
| Release support, post-release monitoring | Release + production smoke checklists | QA-08 |
| Playwright (TypeScript) | Smoke suite with network mocking | AUT-02, AUT-03 |

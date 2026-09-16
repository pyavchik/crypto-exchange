---
phase: 03-live-markets
verified: 2026-09-16T15:35:00Z
status: passed
score: 5/5 must-haves verified
covered_files: [".planning/REQUIREMENTS.md", ".planning/phases/03-live-markets/03-01-PLAN.md", ".planning/phases/03-live-markets/03-01-SUMMARY.md", ".planning/phases/03-live-markets/03-02-PLAN.md", ".planning/phases/03-live-markets/03-02-SUMMARY.md", ".planning/phases/03-live-markets/03-03-PLAN.md", ".planning/phases/03-live-markets/03-03-SUMMARY.md", ".planning/phases/03-live-markets/03-04-PLAN.md", ".planning/phases/03-live-markets/03-04-SUMMARY.md", ".planning/phases/03-live-markets/03-05-PLAN.md", ".planning/phases/03-live-markets/03-05-SUMMARY.md", ".planning/phases/03-live-markets/03-CONTEXT.md", ".planning/phases/03-live-markets/03-REVIEW.md", ".planning/phases/03-live-markets/03-UAT.md", "api/src/app.ts", "api/src/config.ts", "api/src/lib/coingecko.ts", "api/src/lib/keyedCache.ts", "api/src/lib/marketData.ts", "api/src/routes/markets.ts", "qa/README.md", "qa/TEST-PLAN.md", "qa/runs/RUN-2026-09-16-markets.md", "qa/test-cases/markets.md", "scripts/smoke-dev.mjs", "web/src/App.tsx", "web/src/components/PriceChart.tsx", "web/src/components/StaleBanner.tsx", "web/src/lib/api.ts", "web/src/lib/format.ts", "web/src/lib/healthPoller.ts", "web/src/lib/marketsPoller.ts", "web/src/lib/marketsTable.ts", "web/src/lib/poller.ts", "web/src/lib/priceChart.ts", "web/src/pages/Markets.tsx", "web/src/pages/Trade.tsx", "wiki/pages/concepts/market-data-caching.md", "wiki/pages/decisions/market-data-cache-and-stale.md", "wiki/pages/entities/coingecko-api.md"]
covered_digest: "v1:sha256:6a41289531b309253ee0a7973bb624e002fcd4708b22ccfda84222c96bf40e11"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Live Markets Verification Report

**Phase Goal:** Users see live, rate-limit-safe CoinGecko market data in a Binance-like markets and trade view
**Verified:** 2026-09-16T15:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All five are the ROADMAP.md Success Criteria for this phase (the authoritative contract). Each was
checked independently — automated gates reproduced from a clean shell, source read directly, and
cross-checked against the code-review and UAT artifacts rather than trusted from SUMMARY narration.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Markets table lists the curated pairs with price, 24h %, volume, market cap; search and sort work | ✓ VERIFIED | `web/src/pages/Markets.tsx` renders `markets-table`/`markets-row` with `formatPrice`/`formatPercent`/`formatCompact` (`web/src/lib/format.ts`, magnitude-aware, sub-cent handled); `web/src/lib/marketsTable.ts` provides `filterMarkets`/`sortMarkets`/`compareNullable` (null-last, deterministic tie-break); `GET /api/markets` (`api/src/routes/markets.ts` → `api/src/lib/marketData.ts`) excludes the quote self-pair and caps at `CURATED_LIMIT`. Confirmed live: `npm test` reproduced 338/338 passing; `npm run smoke` reproduced `SMOKE OK` end-to-end (20 rows, search with zero new requests, real column-click reordering); independent UAT tests 1–2 passed against the real CoinGecko API. |
| 2 | Trade page shows a 1D/7D/30D chart for the selected pair | ✓ VERIFIED | `web/src/lib/priceChart.ts`'s `createChartController` (DOM-free, unit-tested against a fake chart factory: single construction, no recreation on repeated `setData`, one resize listener added/removed, idempotent `destroy()` via the library's own `remove()`); `web/src/components/PriceChart.tsx` wires it with a data effect separate from the lifecycle effect; `web/src/pages/Trade.tsx` renders the three window controls and `GET /api/markets/:id/chart` (curated-list validated before any upstream call). `npm run smoke`'s reproduced run passed the chart section (chart-ready, sized canvas, window switches with stable canvas count). Independent UAT test 3 additionally proved, manually in real Chrome, that canvas count held at 7 across all three window switches **and** across a navigate-away-and-return cycle — closing the one thing code review flagged as unproven by automation (IN-03). |
| 3 | The CoinGecko key does not appear anywhere in browser network traffic | ✓ VERIFIED | `api/src/lib/marketData.ts` sends the key only as the `x-cg-demo-api-key` header (`apiKey !== null ? { "x-cg-demo-api-key": apiKey } : {}`, lines 296/380), never interpolated into a URL, never included in the scalar-only log-fields object. `npm run smoke`'s reproduced run includes the whole-journey assertion (every request hostname is `localhost`/`127.0.0.1`, no URL/header/body/log-file occurrence of the test key) and printed `SMOKE OK`. Independent UAT test 5 confirmed the same against the real Demo key and real browser traffic, no off-origin requests. `api/.env` (holds the real key) is absent from `git ls-files` and `.gitignore` covers `.env`/`.env.local`. QA TC-MKT-033/034 (browser-traffic + build-bundle grep) both recorded Pass. |
| 4 | When CoinGecko returns 429 or times out, the UI shows cached prices with a "prices delayed" banner | ✓ VERIFIED | `api/src/lib/keyedCache.ts`'s `resolve()` last-good fallback (never rewrites `fetchedAt` on failure, so the next call retries upstream) plus `onStale` (fires once per real failure, not once per concurrent waiter) backs `api/src/lib/marketData.ts`'s `serving stale market data` log line (request id, resource, reason, age — D-43). `web/src/components/StaleBanner.tsx` renders purely from the payload's own `stale`/`fetchedAt`. `web/src/pages/Trade.tsx` additionally banners on chart staleness too (WR-01 fix, confirmed in source: `chartStale`/`bannerStale` at lines 126–127) so a stale chart with fresh markets data no longer goes unbannered. `npm run smoke`'s reproduced run passed the degraded-path section (forced 429 via stub, banner appears with age, table stays populated, matching stale-serve log line with request id + reason, banner clears on recovery). |
| 5 | Market data test cases are written and executed | ✓ VERIFIED | `qa/test-cases/markets.md` holds 36 `TC-MKT-NNN` cases (confirmed by direct count) tracing every DATA-01..04/MKT-01..05 requirement, spanning positive/negative/boundary/security types. `qa/runs/RUN-2026-09-16-markets.md` has exactly 36 result rows (confirmed by direct count) — 35 Pass, 1 Blocked (`TC-MKT-020`, diagnosed as a headless-Chrome automation limitation via two independent CDP probes, not an app defect — and closed by the independent UAT's manual real-Chrome pass, test 4). Zero bugs filed. `REQUIREMENTS.md` marks QA-03 Complete. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `api/src/lib/keyedCache.ts` | generalized TTL cache + in-flight dedupe + last-good fallback + `onStale` | ✓ VERIFIED | Present, exported, wired into `coingecko.ts` and `marketData.ts`; `onStale` hook and stale-fallback branch confirmed by direct read |
| `api/src/lib/marketData.ts` | markets + chart CoinGecko client, D-36 USD/USDT convention, stale-serve logging | ✓ VERIFIED | `VS_CURRENCY`/`QUOTE_SYMBOL` present with doc comments; `getMarkets`/`getChart` present; key sent header-only; WR-03 timeout-vs-malformed_body fix present at both `fetchMarkets` and `fetchChart` sites |
| `api/src/routes/markets.ts` | public `GET /api/markets` + `GET /api/markets/:id/chart` | ✓ VERIFIED | Both handlers present; curated-list validation (`UNKNOWN_MARKET`) runs before `getChart` is called (confirmed by line-order read) |
| `web/src/lib/format.ts` | magnitude-aware price/percent/compact/updated-at formatting | ✓ VERIFIED | `formatPrice` implements the ≥$1 / ¢1–$1 / sub-cent branches exactly as specified; sub-cent path derives significant-digit precision rather than fixed rounding |
| `web/src/lib/poller.ts` | generic, receiver-safe visibility-aware poller | ✓ VERIFIED | `createPoller<T>`; WR-02 fix present — `start()` gates the initial fetch on `visibility.isVisible()` |
| `web/src/lib/marketsTable.ts` | pure search/sort/null-last comparison | ✓ VERIFIED | `filterMarkets`/`sortMarkets`/`compareNullable`/`nextSortState` all present and exported |
| `web/src/components/StaleBanner.tsx` | prices-delayed banner from payload's own stale flag | ✓ VERIFIED | Pure props-only component, `stale-banner` test id present |
| `web/src/lib/priceChart.ts` / `web/src/components/PriceChart.tsx` | DOM-free chart controller + React shell | ✓ VERIFIED | `createChartController`/`toSeriesData` present; `price-chart`/`chart-ready` test ids present; two-effect split (lifecycle vs. data) confirmed |
| `web/src/pages/Markets.tsx` / `web/src/pages/Trade.tsx` | live markets table / trade page | ✓ VERIFIED | Both render all required test ids, quote-convention text, attribution; Trade.tsx's WR-01 chart-staleness banner fix confirmed in source |
| `qa/test-cases/markets.md` / `qa/runs/RUN-2026-09-16-markets.md` | 36 cases, executed | ✓ VERIFIED | Row counts match (36/36); build commit present; no unfilled placeholders in the executed rows I sampled |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `api/src/lib/coingecko.ts` | `api/src/lib/keyedCache.ts` | ping dedupe delegated to shared registry | ✓ WIRED | `coingecko.test.ts` (11 tests) passes unmodified, proving behavior-preserving refactor |
| `api/src/routes/markets.ts` | `api/src/lib/marketData.ts` | route handlers call `getMarkets`/`getChart` | ✓ WIRED | Confirmed by direct read; curated-list check ordering confirmed |
| `web/src/pages/Markets.tsx` | `web/src/lib/api.ts` | `fetchMarkets` (no credentials, public) | ✓ WIRED | Confirmed; `web/src/pages/Markets.tsx` rows link to `/trade/:id` |
| `web/src/pages/Trade.tsx` | `web/src/components/PriceChart.tsx` | one controller per mount, destroyed on unmount | ✓ WIRED | `chartState.kind === "ok"` gates mount so the sentinel only ever reflects real data; confirmed by direct read of `Trade.tsx` lines 116–169 |
| `scripts/smoke-dev.mjs` | live app | real-browser key/host/chart/degraded-path assertions | ✓ WIRED | Reproduced independently: `npm run smoke` → `SMOKE OK` |

### Behavioral Spot-Checks / Gate Reproduction

All gates were re-run independently from a clean shell rather than trusted from SUMMARY claims.

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Full test suite | `npm test` | 158 API + 180 web = 338/338 passed | ✓ PASS |
| Typecheck | `npm run typecheck` | clean (api + web) | ✓ PASS |
| Lint | `npm run lint` | clean | ✓ PASS |
| Format | `npm run format:check` | clean | ✓ PASS |
| Wiki lint | `node scripts/wiki-lint.mjs --base e39073e` | `pages=20 orphans=0 broken_links=0 duplicates=0 errors=0` | ✓ PASS |
| Real-browser smoke (markets, chart, degraded path, key-exposure) | `npm run smoke` | `browser: Chrome 152.0.7977.84` / `SMOKE OK` | ✓ PASS |
| WR-01..WR-04 review fixes actually in source (not just narrated) | direct `grep`/read of `Trade.tsx`, `poller.ts`, `marketData.ts`, `api.ts` | all four fixes present and match the review's described diff | ✓ PASS |
| Debt-marker scan (TBD/FIXME/XXX/TODO/HACK) on all phase-3-changed source files | per-file `grep` | zero matches | ✓ PASS |
| `api/.env` (holds the real key) untracked | `git ls-files "api/*"` excluding known extensions | not listed; `.gitignore` covers `.env`/`.env.local` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-01 | 03-01, 03-04 | Key never reaches browser | ✓ SATISFIED | Header-only transport; smoke + UAT + QA cases all confirm |
| DATA-02 | 03-01, 03-02 | 30–60s TTL cache bounds upstream calls | ✓ SATISFIED | 45s default TTL, dedup registry, env-overridable seam (`MARKETS_TTL_MS`) |
| DATA-03 | 03-02, 03-03, 03-04 | Stale-serve on 429/timeout with banner | ✓ SATISFIED | Last-good fallback + `onStale` + `StaleBanner`; smoke degraded-path section reproduced passing |
| DATA-04 | 03-01 | Curated top-20 quoted in USDT | ✓ SATISFIED | `toMarketPairs` excludes self-pair, caps at 20; USD-upstream/USDT-display convention stated visibly on both pages |
| MKT-01 | 03-01, 03-03 | Markets table: coin, price, 24h%, volume, market cap | ✓ SATISFIED | `MarketsView` renders all five fields with magnitude-aware formatting |
| MKT-02 | 03-03 | Search by name/symbol | ✓ SATISFIED | `filterMarkets`, client-side, zero network calls (smoke-proven) |
| MKT-03 | 03-03 | Sort by price/24h/volume | ✓ SATISFIED | `sortMarkets`/`compareNullable`, null-last, deterministic tie-break |
| MKT-04 | 03-04 | Trade page with 1D/7D/30D chart | ✓ SATISFIED | `priceChart.ts`/`PriceChart.tsx`/`Trade.tsx`; smoke + UAT confirm drawing and teardown |
| MKT-05 | 03-03, 03-04 | Auto-refresh + last-updated + attribution | ✓ SATISFIED | `marketsPoller.ts` (30s, visibility-gated, WR-02 fixed), `formatUpdatedAt`, CoinGecko credit on both pages + footer |
| QA-03 | 03-05 | Market-data test cases written and executed | ✓ SATISFIED | 36 cases, 35 Pass/1 Blocked (diagnosed), 0 bugs, REQUIREMENTS.md marks Complete |

No orphaned requirements found for this phase's DATA-*/MKT-*/QA-03 IDs.

### Anti-Patterns Found

None. Debt-marker scan (TBD/FIXME/XXX/TODO/HACK) across all 18 phase-3-changed source files returned zero matches. No stub patterns (`return null`/`{}`/`[]` feeding a rendered value with no other data path) found in the pages and components reviewed directly (`Markets.tsx`, `Trade.tsx`, `StaleBanner.tsx`, `PriceChart.tsx`).

### Code Review Findings (03-REVIEW.md) — Disposition

- **0 Critical.**
- **4 Warning** — all four confirmed FIXED by re-reading the current source (not trusted from the review's own "FIXED" annotation): WR-01 (stale banner now reflects chart staleness too, `Trade.tsx:126-127`), WR-02 (poller `start()` gates on visibility, `poller.ts`), WR-03 (mid-body-read timeout no longer misclassified as `malformed_body`, `marketData.ts`), WR-04 (`parseErrorResponse` re-throws `AbortError`, `api.ts:399-407`).
- **4 Info** — accepted as documented, non-blocking: IN-01 (dead `Wallet.tsx` branches, carried from Phase 2, out of this phase's scope), IN-02 (no keyless smoke scenario — D-35's keyless path is still unit-tested, just not end-to-end in the browser), IN-03 (chart unmount teardown not asserted by the automated smoke script — **closed** by the independent UAT's manual real-Chrome verification, canvas count held at 7 across a navigate-away-and-return cycle), IN-04 (unbounded chart-cache growth as coins rotate out of top-20 — low severity, accepted for a demo-lifetime process).

### Independent UAT (03-UAT.md) — Disposition

5 tests / 12 checks, all Pass, run against a real temporary instance hitting the live CoinGecko API, deliberately separate from the 03-05 QA harness so a bug in that harness could not hide a bug in the app. Two self-corrections were made to the *test script* (not the app) during the run and documented transparently (TC-MKT-008-equivalent formatting expectation, and a visibility-test race in capturing the "requests so far" baseline) — both are recorded as authoring errors, re-verified, and do not indicate an app defect.

### Pre-Ship Note (non-blocking)

`origin/main` is 31 commits behind local `main` — GitHub CI has not run on this code yet. None of the five phase-3 Success Criteria require CI-green-on-GitHub; this is recorded as a pre-ship action item for the orchestrator's immediate push, not a phase-goal gap.

### Human Verification Required

None. All must-haves resolved to VERIFIED through a combination of reproduced automated gates, direct source reading, and the already-completed independent code review (03-REVIEW.md, all Warnings fixed and reproduced) and independent UAT (03-UAT.md, 12/12 checks passed against the real API, including the one item — chart unmount teardown — that automation alone could not prove).

### Gaps Summary

None. All five ROADMAP success criteria are observably true in the codebase, all ten phase-3 requirements (DATA-01..04, MKT-01..05, QA-03) are satisfied with concrete evidence, all four code-review Warnings are fixed and confirmed in source, and the one automation gap the review flagged (IN-03, chart unmount) was independently closed by manual UAT. Phase 3 is ready to proceed.

---

_Verified: 2026-09-16T15:35:00Z_
_Verifier: Claude (gsd-verifier)_

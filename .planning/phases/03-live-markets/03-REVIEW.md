---
phase: 03-live-markets
reviewed: 2026-09-16T12:10:53Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - api/.env.example
  - api/src/app.ts
  - api/src/config.ts
  - api/src/lib/coingecko.ts
  - api/src/lib/keyedCache.ts
  - api/src/lib/keyedCache.test.ts
  - api/src/lib/marketData.ts
  - api/src/lib/marketData.test.ts
  - api/src/routes/markets.ts
  - api/src/routes/markets.test.ts
  - scripts/smoke-dev.mjs
  - web/src/App.tsx
  - web/src/App.test.tsx
  - web/src/components/PriceChart.tsx
  - web/src/components/PriceChart.test.tsx
  - web/src/components/StaleBanner.tsx
  - web/src/components/StaleBanner.test.tsx
  - web/src/lib/api.ts
  - web/src/lib/api.test.ts
  - web/src/lib/format.ts
  - web/src/lib/healthPoller.ts
  - web/src/lib/marketsPoller.ts
  - web/src/lib/marketsPoller.test.ts
  - web/src/lib/marketsTable.ts
  - web/src/lib/poller.ts
  - web/src/lib/poller.test.ts
  - web/src/lib/priceChart.ts
  - web/src/lib/priceChart.test.ts
  - web/src/pages/Markets.tsx
  - web/src/pages/Markets.test.tsx
  - web/src/pages/Trade.tsx
  - web/src/pages/Trade.test.tsx
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-16T12:10:53Z
**Depth:** standard
**Files Reviewed:** 26 source files (of 34 changed paths; `package-lock.json` and `web/package.json` excluded as dependency-manifest, not logic)
**Status:** issues_found

## Summary

Reviewed all five plans of Phase 3 (Live Markets): the generalized keyed cache and markets tracer slice (03-01), the D-41 stale-serve fallback and chart endpoint (03-02), the frontend poller/search/sort/banner (03-03), the `lightweight-charts` chart controller and trade page (03-04), and the QA artifacts (03-05, not source-reviewed beyond the smoke-script cross-checks the brief asked for). This included an external-reviewer evidence pass (Codex, gpt-5.6-terra) — every one of its four claims was independently re-opened against current source and traced to exact lines before being accepted; three are confirmed narrative findings below, one is confirmed but downgraded in severity from how a naive reading might classify it.

**Overall assessment: the security-critical paths in this phase hold up under adversarial re-derivation.** The CoinGecko Demo key never reaches a browser-observable surface — it is attached only as the `x-cg-demo-api-key` header on server-side `fetchImpl` calls in `marketData.ts`, is never interpolated into a URL, is never included in the `logFields` object passed to the logger (which is explicitly scoped to `upstream`/`url`/`status`/`durationMs`/`result`), and every error surfaced to the client goes through `MarketDataUpstreamError`'s fixed, key-free message. The curated-list validation in `routes/markets.ts` (T-03-08/D-45) genuinely runs before `getChart` is ever called, closing off the id-as-open-proxy risk a naive implementation would have. `keyedCache.ts`'s in-flight dedupe registers synchronously before any `await` (verified by reading, not just trusting the comment), its stale-fallback branch never writes to the cache on failure (so a bad upstream response cannot poison good cached data), and `onStale` genuinely fires once per real failure, not once per concurrent waiter, because the callback lives inside the function passed to the shared in-flight registry. No Critical findings were found in this phase's code, matching the external lane's own conclusion — but two of my own Warnings (chart staleness ignored by the banner, and body-read timeouts misclassified as malformed bodies) and one carried-forward Warning (the `parseErrorResponse` `AbortError` gap, now exercised by more call sites) genuinely degrade correctness or the accuracy of the D-43 RCA log trail this phase specifically built.

## External Reviewer Claims (Codex, gpt-5.6-terra) — Verification

1. **`web/src/pages/Trade.tsx:122` — stale banner ignores chart staleness.** CONFIRMED. See WR-01 below.
2. **`web/src/lib/poller.ts:179-183` — `start()` always fetches regardless of visibility.** CONFIRMED. See WR-02 below.
3. **`scripts/smoke-dev.mjs:294-307` — smoke never exercises the no-key (D-35) path.** CONFIRMED. See IN-02 below.
4. **`scripts/smoke-dev.mjs:964-981` — chart smoke check never navigates away and back, so it can't catch a missing unmount teardown.** CONFIRMED, but downgraded in practical severity: `web/src/lib/priceChart.test.ts` (lines 123-170) already unit-tests `destroy()` tearing down the resize listener exactly once, calling the library's own `remove()` exactly once, and no-oping a double-destroy or a post-destroy `setData` — the untested surface is narrower than "cleanup is untested": it is specifically "React's effect-cleanup wiring in `PriceChart.tsx` actually invokes `controller.destroy()` on a real unmount in a real browser," not the destroy logic itself. See IN-03 below.

## Warnings

### WR-01: The "prices delayed" banner is driven only by markets staleness — a stale chart with fresh markets data shows no warning (external: codex)

**FIXED** in `35b256b` (`fix(03): WR-01 drive stale banner from chart staleness too`). `TradeView` now banners on `stale || chartStale` and uses the older of the two available `fetchedAt` values for the age phrase. Regression test added to `Trade.test.tsx` proving a fresh-markets/stale-chart combination still banners with the older (chart) timestamp.

**File:** `web/src/pages/Trade.tsx:116-122` (banner), `web/src/pages/Trade.tsx:196-231` (`Trade` wrapper never reads `chartState.data.stale`)
**Issue:** `TradeView` destructures `const { fetchedAt, stale } = marketsState.data;` and passes only those two fields to `<StaleBanner>`. `chartState` — the payload actually driving the `<PriceChart>` on this same page — carries its own independent `stale`/`fetchedAt` fields (`ChartResponse` in `web/src/lib/api.ts:322-328`), and `getChart` on the API side genuinely can return `stale: true` with a much older `fetchedAt` than the markets payload: the two resources have different TTLs (45s markets vs 2min/10min chart per D-38) and fail independently (a 429 on `/coins/{id}/market_chart` doesn't imply one on `/coins/markets`). `Trade.tsx` never reads `chartState.data.stale` or `chartState.data.fetchedAt` anywhere in the file (confirmed by full-file search — the only `stale` read is `marketsState.data.stale`), and no test in `web/src/pages/Trade.test.tsx` sets up a scenario where markets is fresh and chart is stale (the only stale-banner test, lines 110-117, drives both from `marketsOk({ stale: ... })`).
**Concrete failure scenario:** the 03-04 smoke section's degraded-path proof forces a 429 broadly enough that both resources go stale together (per its own description, "a matching 'serving stale market data' log line"), so it never isolates this case either. In production: a reviewer opens `/trade/bitcoin`, the markets table refreshes fine every 30s, but CoinGecko's `market_chart` endpoint degrades (a different upstream code path, real possibility during a rate-limit event since chart calls are the most expensive per D-38's own comment) — the chart silently keeps showing a stale series with zero visual indication of its age, while the page's own banner infrastructure exists and is wired up for exactly this purpose.
**Fix:** Thread chart staleness into the banner, e.g. treat the banner as "stale" when either resource is stale, and prefer the older/more-relevant `fetchedAt` for the age phrase:
```tsx
const chartStale = chartState.kind === "ok" && chartState.data.stale;
const chartFetchedAt = chartState.kind === "ok" ? chartState.data.fetchedAt : null;
<StaleBanner
  stale={stale || chartStale}
  fetchedAt={chartStale ? chartFetchedAt : fetchedAt}
  now={now}
/>
```
Add a `Trade.test.tsx` case with `marketsOk({ stale: false })` and a chart state whose `data.stale` is `true`, asserting the banner renders.

### WR-02: `createPoller`'s `start()` fetches unconditionally on mount, regardless of tab visibility, contradicting D-40's "only while the tab is visible" (external: codex)

**FIXED** in `0830ca8` (`fix(03): WR-02 gate poller start() fetch on tab visibility`). `start()` now skips the initial fetch when `visibility.isVisible()` is `false`, relying on the existing `onVisibilityChange` path to fire it once the tab becomes visible. Start-while-hidden coverage added to `poller.test.ts`, `healthPoller.test.ts`, and `marketsPoller.test.ts`; existing "fetch immediately when elapsed >= interval" cases in all three suites still pass unchanged.

**File:** `web/src/lib/poller.ts:178-183`
**Issue:**
```ts
start(): void {
  stopped = false;
  unsubscribe = visibility.subscribe(onVisibilityChange);
  void performFetch();
},
```
`start()` calls `performFetch()` unconditionally — it never consults `visibility.isVisible()` first. Every subsequent scheduling decision in this module (`afterSettled`, `onVisibilityChange`) does gate on visibility, but the very first fetch on mount does not. D-40 states the FE "polls our own API ... only while the tab is visible" — this is the one poller behavior in this file that doesn't honor that.
**Concrete failure scenario:** a `/markets` or `/trade/:id` page mounted in a background tab (opened via a middle-click, or restored by the browser after being backgrounded/discarded while the app was already loaded) immediately fires a `GET /api/markets` (and, on `/trade/:id`, potentially also triggers a `GET /api/markets/:id/chart` via `Trade`'s separate chart effect, which is unconditional regardless of visibility entirely) the instant `Markets`/`Trade` mounts, with no user ever having looked at the tab. This is inherited unchanged from the original `createHealthPoller` (Phase 1) — not a regression introduced this phase — but this phase generalized it into `poller.ts` and built two new visible-tab-gated consumers (`marketsPoller.ts`, and `Trade.tsx`'s own poller usage) directly on top of it, so the gap is now exercised by three consumers instead of one, and D-40 (a decision this phase specifically wrote) states the tighter guarantee.
**Fix:** Gate the initial fetch the same way `onVisibilityChange` gates a resumed one:
```ts
start(): void {
  stopped = false;
  unsubscribe = visibility.subscribe(onVisibilityChange);
  if (visibility.isVisible()) {
    void performFetch();
  }
},
```
This is a deliberate behavior change from the current implicit "always fetch once on mount" contract, so it should be paired with a `poller.test.ts` case asserting `fetchImpl` is not called when `visibility.isVisible()` is `false` at `start()` time, and a check that the existing masking-a-hidden-tab-via-`ProtectedRoute`-loading-shell scenarios in `healthPoller`/`marketsPoller` still pass.

### WR-03: A timeout occurring mid-body-read is misclassified as `malformed_body`, corrupting the D-43 stale-serve RCA log reason

**FIXED** in `e7a60fb` (`fix(03): WR-03 classify mid-body-read timeouts as timeout, not malformed_body`). Both `fetchMarkets` and `fetchChart`'s body-parse `catch` now re-check the rejection's `error.name` for `AbortError`/`TimeoutError` before falling back to `malformed_body`. A test per function (constructing a 200 response whose `.json()` rejects with a `TimeoutError`) was added to `marketData.test.ts` and confirmed to fail against the pre-fix code.

**File:** `api/src/lib/marketData.ts:320-333` (`fetchMarkets`), `api/src/lib/marketData.ts:391-404` (`fetchChart`, identical pattern)
**Issue:** Both upstream-call functions classify failures in two separate, independently-scoped `try`/`catch` blocks:
```ts
try {
  response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(MARKETS_TIMEOUT_MS) });
  httpStatus = response.status;
} catch (error) {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    timedOut = true;
  }
}
...
} else {
  try {
    const body: unknown = await response!.json();
    pairs = toMarketPairs(body);
  } catch {
    reason = "malformed_body";
  }
}
```
The same `AbortSignal.timeout(MARKETS_TIMEOUT_MS)` governs the entire fetch lifecycle, including body streaming — if the upstream sends headers promptly but stalls while streaming the response body, the timeout fires *during* `await response!.json()`, not during `await fetchImpl(...)`. That rejection is a genuine `AbortError`/`TimeoutError`, but it is caught by the second, unconditional `catch { reason = "malformed_body"; }`, which discards the error's identity entirely and always reports `"malformed_body"`.
**Concrete failure scenario:** during a real upstream slowdown (not a clean 429/5xx, but a connection that opens and then stalls mid-response — a realistic degraded-upstream mode, and the exact kind of event D-43 was written to make legible to an RCA), the `serving stale market data` log line emitted by `makeOnStale` (`marketData.ts:253-273`) records `reason: "malformed_body"` instead of `reason: "timeout"`. Anyone debugging the incident via that log line — the entire stated purpose of D-43/FND-04/RCA-01 — is actively misled into suspecting a CoinGecko response-shape regression instead of a slow/timing-out upstream, the opposite of the log line's job.
**Fix:** Re-check the timeout/abort condition inside the body-parse `catch` too, before falling back to `malformed_body`:
```ts
} else {
  try {
    const body: unknown = await response!.json();
    pairs = toMarketPairs(body);
  } catch (error) {
    reason =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
        ? "timeout"
        : "malformed_body";
  }
}
```
Apply identically in `fetchChart`. Add a test that rejects `response.json()` with a `DOMException("...", "TimeoutError")` (or `AbortError`) and asserts the resulting `MarketDataUpstreamError.reason === "timeout"`, not `"malformed_body"`.

### WR-04 (carried forward from `02-REVIEW.md` WR-01, still open): `parseErrorResponse`'s non-2xx path still relabels a genuine `AbortError` as a generic HTTP error, and this phase added two more call sites through it

**FIXED** in `2886817` (`fix(03): WR-04 rethrow AbortError from parseErrorResponse's non-2xx path`). `parseErrorResponse`'s `catch` now re-throws a genuine `AbortError` before falling through to the synthetic `HTTP_<status>` code, mirroring the already-fixed `parseJsonBody` 2xx path. Regression test added to `api.test.ts` (`fetchMarketChart` against a non-2xx response whose `.json()` rejects with an `AbortError`), confirmed to fail against the pre-fix code.

**File:** `web/src/lib/api.ts:382-403`
**Issue:** `02-REVIEW.md`'s WR-01 fixed the 2xx JSON-parse path (`parseJsonBody`) to re-throw a genuine `AbortError` rather than relabelling it, but explicitly noted `parseErrorResponse`'s equivalent gap on the non-2xx path was out of scope and left it open. It remains unfixed:
```ts
async function parseErrorResponse(response: Response, headerRequestId: string | null): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorResponseBody;
    ...
  } catch {
    // Non-JSON or unparsable body — fall through to the generic HTTP_<status> code.
  }
  return new ApiError(response.status, `HTTP_${response.status}`, headerRequestId);
}
```
If `response.json()` rejects with a real `AbortError` (the caller's `AbortSignal` fires while the non-2xx body is still being read), this `catch` swallows it identically to a malformed body and returns a synthetic `ApiError("HTTP_<status>")` instead of letting the abort propagate.
**Concrete failure scenario:** this phase's own `Trade.tsx` is the first place in the codebase that actually wires a real, frequently-firing `AbortController` into a call that funnels through `parseErrorResponse` — the chart-fetch effect (`Trade.tsx:213-231`) creates a fresh `AbortController` on every coin-id/window change and calls `controller.abort()` in its cleanup, explicitly to cancel an in-flight `fetchMarketChart` when the window is switched again quickly. `Trade`'s own settle handler correctly checks `if (error instanceof DOMException && error.name === "AbortError") return;` to no-op on a real abort — but if the in-flight request had already received a non-2xx status (e.g. a `404 UNKNOWN_MARKET` or `502 UPSTREAM_UNAVAILABLE`) and was aborted while `parseErrorResponse` was still reading that response's body, the abort is mislabelled as `ApiError("HTTP_404"/"HTTP_502", ...)`, that check does not match, and `Trade` incorrectly calls `setChartState({ kind: "error", error })` — a spurious error flash on a window switch the user has already moved past, exactly the failure class WR-01 fixed for the 2xx path.
**Fix:** identical treatment to the already-fixed `parseJsonBody`:
```ts
async function parseErrorResponse(response: Response, headerRequestId: string | null): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorResponseBody;
    ...
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // Non-JSON or unparsable body — fall through to the generic HTTP_<status> code.
  }
  return new ApiError(response.status, `HTTP_${response.status}`, headerRequestId);
}
```
Add a regression test mirroring the existing `fetchHealth`/`fetchWallet` `AbortError` tests, but against a non-2xx response (e.g. `fetchMarketChart` with a 404 response whose `.json()` is made to reject with an `AbortError`).

## Info

### IN-01 (carried forward from `02-REVIEW.md` IN-01, still open): `Wallet()`'s `loading`/`anonymous` branches remain dead code

**File:** `web/src/pages/Wallet.tsx:34-55` (unchanged this phase), `web/src/App.tsx:128-135` (touched this phase — trade routes added around it, `ProtectedRoute` wrapping of `Wallet` left unchanged)
**Issue:** `App.tsx` was modified in this phase (03-04, swapping `/trade` from `ComingSoon`), and its route table still wraps `Wallet` in `<ProtectedRoute>` exactly as before, so `Wallet()`'s own `loading`/`anonymous` branches remain unreachable through the app's only route to that component, per the original finding. `Wallet.tsx` itself was not touched this phase.
**Fix:** unchanged from `02-REVIEW.md`: delete the two dead branches, or add a comment explaining why they're intentionally kept for a hypothetical standalone reuse.

### IN-02: `scripts/smoke-dev.mjs` never exercises the keyless (D-35) public-endpoint path (external: codex)

**File:** `scripts/smoke-dev.mjs:294-307`
**Issue:** `devEnv` unconditionally sets `COINGECKO_API_KEY: "smoke-test-key"` for every smoke run. There is no smoke scenario (and, checked via `grep -n "apiKey" api/src/lib/marketData.test.ts`, only unit-level coverage) that runs the browser end-to-end with `COINGECKO_API_KEY` unset, so a regression that accidentally made the `apiKey === null` code path throw, hang, or behave differently under the real dev server / real browser wiring would not be caught by `npm run smoke` — only by the unit suite, which stubs `fetchImpl` directly and therefore can't catch an integration-level regression (e.g. a header object shaped wrong when empty, or a route-registration issue specific to the no-key config).
**Fix:** Add a second, shorter smoke pass (or a dedicated section within the existing run) that starts the dev stack with `COINGECKO_API_KEY` unset and asserts the markets table still renders with 20 rows and the health badge still reports `not_configured` honestly (per D-35), keeping the existing full run as the primary keyed pass.

### IN-03: The browser chart-lifecycle smoke check never navigates away and back, so it can't prove `PriceChart`'s React-level unmount cleanup actually fires in a real browser (external: codex, downgraded)

**File:** `scripts/smoke-dev.mjs:926-1009`
**Issue:** The chart section clicks into a trade page, waits for `chart-ready`, then switches windows (`7d`, `30d`) while `PriceChart` stays mounted the entire time — by design, per 03-04's own documented decision that `Trade`'s `chartState` never resets to `"loading"` so the component never remounts across a window switch. That design choice is correct and intentional, but as a side effect it means the smoke suite never triggers `PriceChart`'s unmount path (navigating to `/markets` or to a different `/trade/:id`) in a real browser at all. `priceChart.test.ts` unit-tests `destroy()` itself thoroughly (resize-listener removal, idempotent double-destroy, post-destroy `setData` no-op — see the External Reviewer Claims section above), but nothing in this repository proves, in a real browser, that React's effect-cleanup return in `PriceChart.tsx:36-48` actually gets invoked when the component unmounts for real (as opposed to a Vitest-simulated cleanup, which this workspace's `environment: "node"` `vitest.config.ts` cannot run for this file per its own documented coverage boundary).
**Fix:** Extend the chart smoke section (or add a short new one) that, after the window-switch assertions, navigates back to `/markets` and into a *different* trade pair, then asserts the canvas count inside the new pair's chart container still equals the original baseline (proving the old chart's canvases were actually torn down, not just hidden/covered by the new one).

### IN-04: The chart cache (`chart:{id}:{window}` keys inside `keyedCache.ts`'s `Map`) has no eviction and grows for the lifetime of the process

**File:** `api/src/lib/marketData.ts:110-112` (`chartCacheKey`), `api/src/lib/keyedCache.ts:109-174` (`createKeyedCache`, no delete/eviction path outside the deliberately-transient in-flight registry)
**Issue:** `createKeyedCache`'s backing `Map` only ever grows — entries are `set` on a successful fetch and never removed (the stale-fallback branch explicitly documents that it never writes, but nothing anywhere ever deletes a key either). Because the curated top-20 list is dynamic (D-36: "the list changes over time"), every coin that has ever appeared in the top 20 across the process's uptime leaves behind up to 3 permanent entries (`chart:{id}:1d`, `:7d`, `:30d`) that are never reclaimed even after that coin permanently drops out of the curated set — `routes/markets.ts`'s curated-list check (T-03-08/D-45) prevents an *attacker* from growing this cache via enumeration, but does nothing to bound organic growth from legitimate churn in the top-20 list over weeks/months of uptime. In practice this is a slow, bounded-by-the-universe-of-ever-top-20-coins leak (performance/memory concerns are explicitly out of this review's v1 scope per the review brief), not a correctness or security defect, so it is recorded at Info rather than escalated.
**Fix:** Not urgent given the practical growth rate, but worth a one-line doc note on `createKeyedCache` (which already documents the no-cross-process-dedupe caveat) acknowledging the same "no eviction" fact explicitly, or a follow-up ticket for a simple max-size/LRU bound before this pattern is reused for a resource with a less-bounded key space than a top-20 curated list.

---

_Reviewed: 2026-09-16T12:10:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

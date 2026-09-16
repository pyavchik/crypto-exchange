import type { FastifyBaseLogger } from "fastify";
import { AppError } from "./errors.js";
import { createKeyedCache } from "./keyedCache.js";

type LogCtx = { requestId: string; log: FastifyBaseLogger };

// D-36 correction (03-RESEARCH.md, live-verified 2026-09-16): CoinGecko
// rejects `vs_currency=usdt` with a 400 "invalid vs_currency" — "usdt" is
// absent from the live `/simple/supported_vs_currencies` list. The upstream
// reference price this project fetches is therefore always the dollar figure
// CoinGecko quotes.
export const VS_CURRENCY = "usd";
// The display-only quote leg. Pairs render as `<SYMBOL>/USDT`, but the
// underlying reference price is USD — this is this project's own 1:1
// stablecoin-peg convention, not a literal upstream currency. Phase 4's
// order math inherits this convention. Never interpolate this into an
// upstream URL.
export const QUOTE_SYMBOL = "USDT";

export const CURATED_LIMIT = 20;
// Requested rows exceed CURATED_LIMIT because the quote asset itself
// (QUOTE_SYMBOL) typically ranks inside the top 20 by market cap and is
// excluded from the tradable set (D-36) — over-fetching by five guarantees a
// full curated set of 20 pairs from a single upstream call.
export const UPSTREAM_PAGE_SIZE = 25;
export const MARKETS_CACHE_KEY = "markets";
export const MARKETS_TTL_MS = 45_000;
export const MARKETS_TIMEOUT_MS = 8_000;

const MARKETS_PATH = "/coins/markets";
const CHART_PATH_PREFIX = "/coins";
const CHART_PATH_SUFFIX = "/market_chart";
const UPSTREAM_NAME = "coingecko";

export interface MarketPair {
  id: string;
  symbol: string;
  name: string;
  pair: string;
  price: number;
  change24hPct: number | null;
  volume24h: number | null;
  marketCap: number | null;
}

export interface MarketsPayload {
  pairs: MarketPair[];
  fetchedAt: string;
  stale: boolean;
}

export interface MarketDataDeps {
  apiKey: string | null;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  // D-51: overridable in place of MARKETS_TTL_MS so a test/smoke run can
  // force the D-41 stale path deterministically without waiting out a real
  // 45-second window. Chart window lifetimes stay fixed (CHART_TTL_MS) — one
  // override is enough to reach the fallback, and the "prices delayed"
  // banner this proves is driven by the markets payload.
  marketsTtlMs?: number;
}

export interface MarketDataService {
  getMarkets(ctx: LogCtx): Promise<MarketsPayload>;
  getChart(id: string, window: ChartWindow, ctx: LogCtx): Promise<ChartPayload>;
}

// D-38: the three chart windows the trade page offers. The route schema and
// the front end both read this same tuple as their source of truth.
export const CHART_WINDOWS = ["1d", "7d", "30d"] as const;
export type ChartWindow = (typeof CHART_WINDOWS)[number];

// D-38: a chart's shape barely moves inside a window, and these are the most
// expensive calls this project makes — 1D refreshes often (five-minute
// upstream samples), 7D/30D refresh rarely (their samples are hourly/daily).
export const CHART_TTL_MS: Record<ChartWindow, number> = {
  "1d": 120_000,
  "7d": 600_000,
  "30d": 600_000,
};

// The integer day count CoinGecko's market_chart endpoint takes for each
// window. Not exported: nothing outside this module needs to know the raw
// day count, only the window label.
const CHART_DAYS: Record<ChartWindow, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

export interface ChartPoint {
  time: number;
  value: number;
}

export interface ChartPayload {
  id: string;
  window: ChartWindow;
  points: ChartPoint[];
  fetchedAt: string;
  stale: boolean;
}

/**
 * Colon-joined, resource-prefixed cache key — namespaced away from the
 * "markets" key and readable directly in a stale-serve log line.
 */
export function chartCacheKey(id: string, window: ChartWindow): string {
  return `chart:${id}:${window}`;
}

/**
 * Pure, unit-testable mapping from a live-shaped `/coins/{id}/market_chart`
 * body to the ascending, unique, whole-second ChartPoint[] the chart library
 * requires. Reads only the `prices` array — `market_caps` and
 * `total_volumes` are always present in CoinGecko's response but unused
 * here. Throws the same way `toMarketPairs` does when the shape is wrong or
 * nothing survives, so a malformed chart body is classified as an upstream
 * failure and falls back to the last good series rather than being cached.
 */
export function toChartPoints(raw: unknown): ChartPoint[] {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !Array.isArray((raw as Record<string, unknown>).prices)
  ) {
    throw new Error("chart response was missing a prices array");
  }

  const prices = (raw as { prices: unknown[] }).prices;
  const points: ChartPoint[] = [];
  let previousTime: number | null = null;

  for (const entry of prices) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [timestampMs, value] = entry as [unknown, unknown];
    if (typeof timestampMs !== "number" || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    // The chart library interprets its time field as seconds since the
    // epoch; feeding it milliseconds silently places every sample tens of
    // thousands of years in the future, producing an empty-looking chart
    // rather than an obviously broken one.
    const time = Math.floor(timestampMs / 1000);

    // The library requires strictly ascending, unique times and either
    // throws or silently drops a duplicate — drop any point that does not
    // strictly exceed the previous KEPT one (not the previous raw sample),
    // so two samples inside the same second collapse to one point.
    if (previousTime !== null && time <= previousTime) continue;

    points.push({ time, value });
    previousTime = time;
  }

  if (points.length === 0) {
    throw new Error("chart response had no usable price points");
  }

  return points;
}

/**
 * The AppError this module throws on every upstream failure. Carries a
 * short machine `reason` (`http_429`, `http_503`, `timeout`, `network`,
 * `malformed_body`) that 03-02's stale-serve path will read when it adds the
 * last-good fallback — it is never surfaced to the client, only logged and
 * available on the error instance.
 */
export class MarketDataUpstreamError extends AppError {
  readonly reason: string;

  constructor(reason: string) {
    super(502, "UPSTREAM_UNAVAILABLE", "Market data is temporarily unavailable");
    this.name = "MarketDataUpstreamError";
    this.reason = reason;
  }
}

function toFiniteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pure, unit-testable mapping from a live-shaped `/coins/markets` array to
 * the curated MarketPair[] this project serves. Every entry is validated
 * before any exclusion or truncation happens, so a malformed upstream body
 * anywhere in the array is always an upstream failure — never a cached
 * value, regardless of its position in the response.
 */
export function toMarketPairs(raw: unknown): MarketPair[] {
  if (!Array.isArray(raw)) {
    throw new Error("markets response was not an array");
  }

  const mapped: MarketPair[] = [];
  for (const entry of raw) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof (entry as Record<string, unknown>).id !== "string" ||
      typeof (entry as Record<string, unknown>).current_price !== "number" ||
      !Number.isFinite((entry as Record<string, unknown>).current_price as number)
    ) {
      throw new Error("markets response entry missing a string id or numeric current_price");
    }

    const row = entry as Record<string, unknown>;
    const symbol = typeof row.symbol === "string" ? row.symbol.toUpperCase() : "";

    // D-36: a <QUOTE_SYMBOL>/<QUOTE_SYMBOL> pair is nonsensical — the quote
    // asset itself is excluded from the tradable set.
    if (symbol === QUOTE_SYMBOL) continue;

    mapped.push({
      id: row.id as string,
      symbol,
      name: typeof row.name === "string" ? row.name : symbol,
      pair: `${symbol}/${QUOTE_SYMBOL}`,
      price: row.current_price as number,
      change24hPct: toFiniteOrNull(row.price_change_percentage_24h),
      volume24h: toFiniteOrNull(row.total_volume),
      marketCap: toFiniteOrNull(row.market_cap),
    });
  }

  return mapped.slice(0, CURATED_LIMIT);
}

export function createMarketDataService(deps: MarketDataDeps): MarketDataService {
  const {
    apiKey,
    baseUrl,
    fetchImpl = fetch,
    now = Date.now,
    marketsTtlMs = MARKETS_TTL_MS,
  } = deps;
  // Reusing one cache instance for both resources (markets + every
  // chart:{id}:{window} key) means they share one dedupe registry, matching
  // the pattern generalized in keyedCache.ts (D-39).
  const cache = createKeyedCache<MarketPair[] | ChartPoint[]>({ now });

  /**
   * D-43: builds the onStale callback for a given request context. Reads the
   * cache's own record of the served entry's fetchedAt via peek() rather
   * than threading it through resolveOptions — the stale-serve branch never
   * mutates the entry, so peek() always reflects the exact value onStale is
   * reporting on.
   */
  function makeOnStale(ctx: LogCtx): (key: string, reason: string, ageMs: number) => void {
    return (key, reason, ageMs) => {
      const entry = cache.peek(key);
      // Include the request id as an explicit field rather than relying only
      // on the logger's own binding, so this assertion is directly visible
      // on the record and an RCA can search for it (D-43, FND-04, RCA-01).
      // No headers, no key, no response body — the same scalar-field
      // discipline the upstream-call line above follows.
      ctx.log.warn(
        {
          upstream: UPSTREAM_NAME,
          resource: key,
          reason,
          ageMs,
          fetchedAt: entry ? new Date(entry.fetchedAt).toISOString() : null,
          requestId: ctx.requestId,
        },
        "serving stale market data",
      );
    };
  }

  // Deliberate non-behavior worth recording: this phase adds no retry
  // backoff and does not honor the upstream's retry-after header. During an
  // outage each front-end poll produces at most one upstream attempt per
  // resource per TTL window (T-03-14), which stays far inside the verified
  // 100 calls/min Demo limit, and D-41 asks for an immediate fallback rather
  // than a queued retry.

  async function fetchMarkets(ctx: LogCtx): Promise<MarketPair[]> {
    const url =
      `${baseUrl}${MARKETS_PATH}?vs_currency=${VS_CURRENCY}&order=market_cap_desc` +
      `&per_page=${UPSTREAM_PAGE_SIZE}&page=1&sparkline=false&price_change_percentage=24h`;
    const start = now();
    let httpStatus: number | null = null;
    let timedOut = false;
    let response: Response | null = null;

    try {
      // D-35: transport the key only as this header, and only when
      // configured — a null key still performs the upstream call,
      // unauthenticated, sending no key header at all.
      const headers: Record<string, string> =
        apiKey !== null ? { "x-cg-demo-api-key": apiKey } : {};
      response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(MARKETS_TIMEOUT_MS),
      });
      httpStatus = response.status;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        timedOut = true;
      }
      // Any other thrown error (e.g. TypeError('fetch failed')) is a network
      // failure: httpStatus stays null and timedOut stays false.
    }

    const durationMs = now() - start;
    let reason: string | null = null;
    let pairs: MarketPair[] | null = null;

    // Classify only on the HTTP status code and the thrown error name — never
    // by parsing the upstream error body, whose shape CoinGecko has never
    // committed to in writing.
    if (timedOut) {
      reason = "timeout";
    } else if (httpStatus === null) {
      reason = "network";
    } else if (httpStatus < 200 || httpStatus >= 300) {
      reason = httpStatus === 429 ? "http_429" : `http_${httpStatus}`;
    } else {
      try {
        const body: unknown = await response!.json();
        pairs = toMarketPairs(body);
      } catch {
        reason = "malformed_body";
      }
    }

    // Never pass headers, the deps object or the key to the logger — only
    // these scalar fields ever reach the log line (D-08 discipline, extended
    // from coingecko.ts).
    const logFields = {
      upstream: UPSTREAM_NAME,
      url: `${baseUrl}${MARKETS_PATH}`,
      status: httpStatus,
      durationMs,
      result: reason ?? "ok",
    };

    if (reason) {
      ctx.log.warn(logFields, "upstream call");
      throw new MarketDataUpstreamError(reason);
    }

    ctx.log.info(logFields, "upstream call");
    return pairs as MarketPair[];
  }

  async function fetchChart(id: string, window: ChartWindow, ctx: LogCtx): Promise<ChartPoint[]> {
    const days = CHART_DAYS[window];
    // Encode the id even though it is validated upstream of this call
    // (routes/markets.ts checks it against the curated list before getChart
    // is ever invoked) — defence in depth costs nothing here. No granularity
    // option is passed: the fine-grained values are Enterprise-only, and the
    // Demo plan's automatic selection already returns five-minute samples
    // for one day, hourly samples for two to ninety days, daily beyond that.
    const path = `${CHART_PATH_PREFIX}/${encodeURIComponent(id)}${CHART_PATH_SUFFIX}`;
    const url = `${baseUrl}${path}?vs_currency=${VS_CURRENCY}&days=${days}`;
    const start = now();
    let httpStatus: number | null = null;
    let timedOut = false;
    let response: Response | null = null;

    try {
      const headers: Record<string, string> =
        apiKey !== null ? { "x-cg-demo-api-key": apiKey } : {};
      response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(MARKETS_TIMEOUT_MS),
      });
      httpStatus = response.status;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        timedOut = true;
      }
    }

    const durationMs = now() - start;
    let reason: string | null = null;
    let points: ChartPoint[] | null = null;

    if (timedOut) {
      reason = "timeout";
    } else if (httpStatus === null) {
      reason = "network";
    } else if (httpStatus < 200 || httpStatus >= 300) {
      reason = httpStatus === 429 ? "http_429" : `http_${httpStatus}`;
    } else {
      try {
        const body: unknown = await response!.json();
        points = toChartPoints(body);
      } catch {
        reason = "malformed_body";
      }
    }

    const logFields = {
      upstream: UPSTREAM_NAME,
      url: `${baseUrl}${path}`,
      status: httpStatus,
      durationMs,
      result: reason ?? "ok",
    };

    if (reason) {
      ctx.log.warn(logFields, "upstream call");
      throw new MarketDataUpstreamError(reason);
    }

    ctx.log.info(logFields, "upstream call");
    return points as ChartPoint[];
  }

  return {
    async getMarkets(ctx): Promise<MarketsPayload> {
      const result = await cache.resolve(MARKETS_CACHE_KEY, marketsTtlMs, () => fetchMarkets(ctx), {
        onStale: makeOnStale(ctx),
      });
      return {
        pairs: result.value as MarketPair[],
        fetchedAt: new Date(result.fetchedAt).toISOString(),
        stale: result.stale,
      };
    },
    async getChart(id, window, ctx): Promise<ChartPayload> {
      const key = chartCacheKey(id, window);
      const result = await cache.resolve(
        key,
        CHART_TTL_MS[window],
        () => fetchChart(id, window, ctx),
        {
          onStale: makeOnStale(ctx),
        },
      );
      return {
        id,
        window,
        points: result.value as ChartPoint[],
        fetchedAt: new Date(result.fetchedAt).toISOString(),
        stale: result.stale,
      };
    },
  };
}

import type { FastifyBaseLogger } from "fastify";
import { AppError } from "./errors.js";
import { createKeyedCache } from "./keyedCache.js";

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
}

export interface MarketDataService {
  getMarkets(ctx: { requestId: string; log: FastifyBaseLogger }): Promise<MarketsPayload>;
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
  const { apiKey, baseUrl, fetchImpl = fetch, now = Date.now } = deps;
  const cache = createKeyedCache<MarketPair[]>({ now });

  async function fetchMarkets(ctx: {
    requestId: string;
    log: FastifyBaseLogger;
  }): Promise<MarketPair[]> {
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

  return {
    async getMarkets(ctx): Promise<MarketsPayload> {
      const result = await cache.resolve(MARKETS_CACHE_KEY, MARKETS_TTL_MS, () =>
        fetchMarkets(ctx),
      );
      return {
        pairs: result.value,
        fetchedAt: new Date(result.fetchedAt).toISOString(),
        stale: result.stale,
      };
    },
  };
}

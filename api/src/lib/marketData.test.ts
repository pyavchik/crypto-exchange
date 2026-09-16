import { describe, expect, it, vi } from "vitest";
import {
  createMarketDataService,
  CURATED_LIMIT,
  MARKETS_TTL_MS,
  MarketDataUpstreamError,
  QUOTE_SYMBOL,
  toMarketPairs,
  UPSTREAM_PAGE_SIZE,
  VS_CURRENCY,
} from "./marketData.js";
import { createLogger } from "./logger.js";

const BASE_URL = "https://api.coingecko.com/api/v3";

function makeLogger() {
  const lines: string[] = [];
  const destination = {
    write: (msg: string): boolean => {
      lines.push(msg);
      return true;
    },
  };
  const logger = createLogger({ destination });
  return { lines, log: logger.child({ requestId: "req-1" }) };
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// Live-captured shape from 03-RESEARCH.md's /coins/markets probe, extended to
// UPSTREAM_PAGE_SIZE (25) entries: includes the quote asset itself (to
// exercise D-36's self-pair exclusion), one sub-cent entry, and one entry
// with an absent 24h change percentage.
function buildFixture(): unknown[] {
  const entries: unknown[] = [
    {
      id: "bitcoin",
      symbol: "btc",
      name: "Bitcoin",
      current_price: 75755,
      market_cap: 1521766040123,
      total_volume: 39122950768,
      price_change_percentage_24h: -1.53973,
      roi: null,
      max_supply: 21000000,
    },
    {
      id: "ethereum",
      symbol: "eth",
      name: "Ethereum",
      current_price: 2400.26,
      market_cap: 292987353189,
      total_volume: 12345678,
      price_change_percentage_24h: 2.1,
      roi: { times: 41.37, currency: "btc", percentage: 4137.13 },
      max_supply: null,
    },
    {
      id: "tether",
      symbol: QUOTE_SYMBOL.toLowerCase(),
      name: "Tether",
      current_price: 1.0,
      market_cap: 120000000000,
      total_volume: 50000000000,
      price_change_percentage_24h: 0.01,
      roi: null,
      max_supply: null,
    },
    {
      id: "sub-cent-coin",
      symbol: "subc",
      name: "Sub Cent Coin",
      current_price: 0.00001234,
      market_cap: 1000000,
      total_volume: null,
      price_change_percentage_24h: null,
      roi: null,
      max_supply: null,
    },
  ];

  for (let i = entries.length; i < UPSTREAM_PAGE_SIZE; i += 1) {
    entries.push({
      id: `coin-${i}`,
      symbol: `c${i}`,
      name: `Coin ${i}`,
      current_price: 10 + i,
      market_cap: 1_000_000 * i,
      total_volume: 500_000 * i,
      price_change_percentage_24h: i % 2 === 0 ? 1.5 : -1.5,
      roi: null,
      max_supply: null,
    });
  }

  return entries;
}

describe("toMarketPairs", () => {
  it("maps a live-shaped /coins/markets array, deriving pair as uppercased symbol + / + quote", () => {
    const pairs = toMarketPairs([
      {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        current_price: 75755,
        market_cap: 1521766040123,
        total_volume: 39122950768,
        price_change_percentage_24h: -1.53973,
      },
    ]);

    expect(pairs).toEqual([
      {
        id: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        pair: "BTC/USDT",
        price: 75755,
        change24hPct: -1.53973,
        volume24h: 39122950768,
        marketCap: 1521766040123,
      },
    ]);
  });

  it("excludes the quote-asset self-pair and keeps at most CURATED_LIMIT entries from a 25-entry fixture", () => {
    const pairs = toMarketPairs(buildFixture());

    expect(pairs).toHaveLength(CURATED_LIMIT);
    expect(pairs.some((pair) => pair.symbol === QUOTE_SYMBOL)).toBe(false);
    expect(pairs.some((pair) => pair.id === "tether")).toBe(false);
  });

  it("preserves null for a missing or non-numeric price_change_percentage_24h, total_volume or market_cap rather than coercing to zero", () => {
    const pairs = toMarketPairs([
      {
        id: "sub-cent-coin",
        symbol: "subc",
        name: "Sub Cent Coin",
        current_price: 0.00001234,
        market_cap: undefined,
        total_volume: null,
        price_change_percentage_24h: "n/a",
      },
    ]);

    expect(pairs[0]).toMatchObject({
      change24hPct: null,
      volume24h: null,
      marketCap: null,
    });
  });

  it("keeps entries whose roi or max_supply is null without throwing (both observed live)", () => {
    expect(() => toMarketPairs(buildFixture())).not.toThrow();
  });

  it("throws on a response that is not an array", () => {
    expect(() => toMarketPairs({ not: "an array" })).toThrow();
    expect(() => toMarketPairs(null)).toThrow();
  });

  it("throws on an array whose entries lack a string id or a numeric current_price", () => {
    expect(() => toMarketPairs([{ symbol: "btc", current_price: 1 }])).toThrow();
    expect(() => toMarketPairs([{ id: "bitcoin", symbol: "btc", current_price: "not-a-number" }])).toThrow();
    expect(() => toMarketPairs([{ id: "bitcoin", symbol: "btc" }])).toThrow();
  });
});

describe("createMarketDataService", () => {
  it("issues exactly one upstream call for two concurrent callers, and one more after the TTL expires", async () => {
    let now = 1_700_000_000_000;
    const { log } = makeLogger();
    const fixture = buildFixture();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    const [first, second] = await Promise.all([
      service.getMarkets({ requestId: "req-1", log }),
      service.getMarkets({ requestId: "req-2", log }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.pairs).toHaveLength(CURATED_LIMIT);
    expect(second).toEqual(first);
    expect(first.stale).toBe(false);

    now += MARKETS_TTL_MS;
    const third = await service.getMarkets({ requestId: "req-3", log });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(third.pairs).toHaveLength(CURATED_LIMIT);
  });

  it("sends the Demo key as the x-cg-demo-api-key request header and puts no key anywhere in the request URL", async () => {
    const { log } = makeLogger();
    const apiKey = "test-secret-key-123";
    const fixture = buildFixture();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey, baseUrl: BASE_URL, fetchImpl });

    await service.getMarkets({ requestId: "req-1", log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;
    expect(calledUrl).not.toContain(apiKey);
    expect(calledUrl).toContain(`vs_currency=${VS_CURRENCY}`);
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["x-cg-demo-api-key"]).toBe(apiKey);
  });

  it("with a null API key still performs the upstream call and sends no key header at all", async () => {
    const { log } = makeLogger();
    const fixture = buildFixture();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: null, baseUrl: BASE_URL, fetchImpl });

    const result = await service.getMarkets({ requestId: "req-1", log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.pairs).toHaveLength(CURATED_LIMIT);
    const [, calledOptions] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["x-cg-demo-api-key"]).toBeUndefined();
  });

  it("throws MarketDataUpstreamError(502, UPSTREAM_UNAVAILABLE) when the upstream returns a non-2xx status", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    await expect(service.getMarkets({ requestId: "req-1", log })).rejects.toMatchObject({
      statusCode: 502,
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("classifies a 429 as reason http_429 on the thrown MarketDataUpstreamError", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    try {
      await service.getMarkets({ requestId: "req-1", log });
      expect.unreachable("expected getMarkets to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(MarketDataUpstreamError);
      expect((error as MarketDataUpstreamError).reason).toBe("http_429");
    }
  });

  it("throws on a malformed upstream body and never caches it", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    await expect(service.getMarkets({ requestId: "req-1", log })).rejects.toMatchObject({
      statusCode: 502,
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("logs exactly one upstream call line per real fetch, and the API key never appears in it", async () => {
    const { lines, log } = makeLogger();
    const apiKey = "test-secret-key-123";
    const fixture = buildFixture();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey, baseUrl: BASE_URL, fetchImpl });

    await service.getMarkets({ requestId: "req-1", log });

    const parsed = parseLines(lines);
    const upstreamLines = parsed.filter((entry) => entry.msg === "upstream call");
    expect(upstreamLines).toHaveLength(1);
    expect(upstreamLines[0]?.result).toBe("ok");

    const rawText = lines.join("\n");
    expect(rawText).not.toContain(apiKey);
  });
});

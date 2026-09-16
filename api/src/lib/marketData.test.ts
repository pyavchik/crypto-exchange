import { describe, expect, it, vi } from "vitest";
import {
  chartCacheKey,
  CHART_TTL_MS,
  createMarketDataService,
  CURATED_LIMIT,
  MARKETS_TTL_MS,
  MarketDataUpstreamError,
  QUOTE_SYMBOL,
  toChartPoints,
  toMarketPairs,
  UPSTREAM_PAGE_SIZE,
  VS_CURRENCY,
} from "./marketData.js";
import { createLogger } from "./logger.js";
import { loadConfig } from "../config.js";

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
    expect(() =>
      toMarketPairs([{ id: "bitcoin", symbol: "btc", current_price: "not-a-number" }]),
    ).toThrow();
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
    const [, calledOptions] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!;
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["x-cg-demo-api-key"]).toBeUndefined();
  });

  it("throws MarketDataUpstreamError(502, UPSTREAM_UNAVAILABLE) when the upstream returns a non-2xx status", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 429 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    await expect(service.getMarkets({ requestId: "req-1", log })).rejects.toMatchObject({
      statusCode: 502,
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("classifies a 429 as reason http_429 on the thrown MarketDataUpstreamError", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 429 }),
    ) as unknown as typeof fetch;
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

  it("classifies a timeout that fires mid-body-read as reason timeout, not malformed_body (WR-03)", async () => {
    const { log } = makeLogger();
    // The same AbortSignal.timeout governs the whole fetch lifecycle
    // including body streaming: headers arrive (status 200) but the
    // signal fires while response.json() is still reading the stream, so
    // .json() rejects with an AbortError/TimeoutError rather than a
    // JSON-parse SyntaxError.
    const fetchImpl = vi.fn(
      async () =>
        ({
          status: 200,
          json: () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    try {
      await service.getMarkets({ requestId: "req-1", log });
      expect.unreachable("expected getMarkets to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(MarketDataUpstreamError);
      expect((error as MarketDataUpstreamError).reason).toBe("timeout");
    }
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

describe("createMarketDataService — stale fallback (D-41/D-43)", () => {
  async function expectStaleFallback(
    secondResponse: () => Promise<Response>,
    expectedReason: string,
  ): Promise<void> {
    let now = 1_700_000_000_000;
    const { lines, log } = makeLogger();
    const fixture = buildFixture();
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify(fixture), { status: 200 });
      return secondResponse();
    }) as unknown as typeof fetch;
    const service = createMarketDataService({
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    const first = await service.getMarkets({ requestId: "req-1", log });
    expect(first.stale).toBe(false);

    now += MARKETS_TTL_MS;
    const second = await service.getMarkets({ requestId: "req-2", log });

    expect(second.stale).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(second.pairs).toEqual(first.pairs);

    const parsed = parseLines(lines);
    const staleLines = parsed.filter((entry) => entry.msg === "serving stale market data");
    expect(staleLines).toHaveLength(1);
    expect(staleLines[0]).toMatchObject({
      resource: "markets",
      reason: expectedReason,
      requestId: "req-2",
    });
    expect(typeof staleLines[0]?.ageMs).toBe("number");
  }

  it("falls back to the previous pairs with reason http_429 on a 429", () =>
    expectStaleFallback(async () => new Response(null, { status: 429 }), "http_429"));

  it("falls back to the previous pairs with reason http_503 on a 503", () =>
    expectStaleFallback(async () => new Response(null, { status: 503 }), "http_503"));

  it("falls back to the previous pairs with reason malformed_body on a body failing validation", () =>
    expectStaleFallback(
      async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 }),
      "malformed_body",
    ));

  it("falls back to the previous pairs with reason timeout on an upstream timeout", () =>
    expectStaleFallback(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    }, "timeout"));

  it("rejects with the D-09 502 UPSTREAM_UNAVAILABLE envelope and logs no stale line when nothing has ever been cached", async () => {
    const { lines, log } = makeLogger();
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    await expect(service.getMarkets({ requestId: "req-1", log })).rejects.toMatchObject({
      statusCode: 502,
      code: "UPSTREAM_UNAVAILABLE",
    });

    const parsed = parseLines(lines);
    expect(parsed.some((entry) => entry.msg === "serving stale market data")).toBe(false);
  });
});

describe("loadConfig — MARKETS_TTL_MS (D-51)", () => {
  it("defaults to 45000 milliseconds when MARKETS_TTL_MS is absent", () => {
    expect(loadConfig({}).marketsTtlMs).toBe(45_000);
  });

  it("reads an explicit MARKETS_TTL_MS override", () => {
    expect(loadConfig({ MARKETS_TTL_MS: "2000" }).marketsTtlMs).toBe(2000);
  });

  it("throws on a non-integer or non-positive MARKETS_TTL_MS, the same way an invalid PORT throws", () => {
    expect(() => loadConfig({ MARKETS_TTL_MS: "not-a-number" })).toThrow(/MARKETS_TTL_MS/);
    expect(() => loadConfig({ MARKETS_TTL_MS: "0" })).toThrow(/MARKETS_TTL_MS/);
    expect(() => loadConfig({ MARKETS_TTL_MS: "-5" })).toThrow(/MARKETS_TTL_MS/);
  });
});

describe("createMarketDataService — marketsTtlMs override", () => {
  it("uses an explicit cache lifetime in place of the module default", async () => {
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
      marketsTtlMs: 2_000,
    });

    await service.getMarkets({ requestId: "req-1", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 1_999;
    await service.getMarkets({ requestId: "req-2", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 1;
    await service.getMarkets({ requestId: "req-3", log });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// Live-shaped /coins/{id}/market_chart fixture builder: prices is an array
// of [ms_timestamp, value] pairs, chronologically ascending, matching
// 03-RESEARCH.md's live capture.
function buildChartFixture(count: number, startMs: number, stepMs: number): unknown {
  const prices: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    prices.push([startMs + i * stepMs, 100 + i]);
  }
  return { prices, market_caps: [], total_volumes: [] };
}

describe("toChartPoints", () => {
  it("converts millisecond timestamps to whole-second time values", () => {
    const points = toChartPoints({
      prices: [
        [1_700_000_000_123, 100],
        [1_700_000_060_456, 101],
      ],
    });

    expect(points).toEqual([
      { time: Math.floor(1_700_000_000_123 / 1000), value: 100 },
      { time: Math.floor(1_700_000_060_456 / 1000), value: 101 },
    ]);
  });

  it("drops a point whose converted time does not strictly exceed the previous kept point's", () => {
    const points = toChartPoints({
      prices: [
        [1_700_000_000_000, 100],
        [1_700_000_000_500, 101], // rounds into the same second as the previous point
        [1_700_000_001_000, 102],
      ],
    });

    expect(points).toEqual([
      { time: 1_700_000_000, value: 100 },
      { time: 1_700_000_001, value: 102 },
    ]);
  });

  it("drops a point whose value is not a finite number", () => {
    const points = toChartPoints({
      prices: [
        [1_700_000_000_000, 100],
        [1_700_000_001_000, Number.NaN],
        [1_700_000_002_000, 102],
      ],
    });

    expect(points).toEqual([
      { time: 1_700_000_000, value: 100 },
      { time: 1_700_000_002, value: 102 },
    ]);
  });

  it("throws when the body has no prices array", () => {
    expect(() => toChartPoints({})).toThrow();
    expect(() => toChartPoints(null)).toThrow();
  });

  it("throws when the prices array is empty", () => {
    expect(() => toChartPoints({ prices: [] })).toThrow();
  });

  it("throws when every point is dropped", () => {
    expect(() => toChartPoints({ prices: [[1_700_000_000_000, Number.NaN]] })).toThrow();
  });
});

describe("chartCacheKey", () => {
  it("is distinct per coin and per window", () => {
    expect(chartCacheKey("bitcoin", "7d")).not.toBe(chartCacheKey("bitcoin", "1d"));
    expect(chartCacheKey("bitcoin", "7d")).not.toBe(chartCacheKey("ethereum", "7d"));
  });
});

describe("createMarketDataService — getChart", () => {
  it("issues two upstream calls for two different coins requested concurrently", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(buildChartFixture(5, 1_700_000_000_000, 3_600_000)), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    const [btc, eth] = await Promise.all([
      service.getChart("bitcoin", "7d", { requestId: "req-1", log }),
      service.getChart("ethereum", "7d", { requestId: "req-2", log }),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(btc.id).toBe("bitcoin");
    expect(eth.id).toBe("ethereum");
  });

  it("dedupes five concurrent requests for the same coin and window into a single upstream call", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(buildChartFixture(5, 1_700_000_000_000, 3_600_000)), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.getChart("bitcoin", "7d", { requestId: "req-1", log }),
      ),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("serves the 1d window from cache 119 seconds later and refetches 121 seconds later", async () => {
    let now = 1_700_000_000_000;
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(buildChartFixture(5, now, 60_000)), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    await service.getChart("bitcoin", "1d", { requestId: "req-1", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 119_000;
    await service.getChart("bitcoin", "1d", { requestId: "req-2", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 2_000; // 121s total
    await service.getChart("bitcoin", "1d", { requestId: "req-3", log });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("serves the 7d and 30d windows from cache just under 10 minutes later and refetches past 10 minutes", async () => {
    let now = 1_700_000_000_000;
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(buildChartFixture(5, now, 60_000)), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    for (const window of ["7d", "30d"] as const) {
      await service.getChart("bitcoin", window, { requestId: "req-1", log });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    now += 600_000 - 1_000;
    for (const window of ["7d", "30d"] as const) {
      await service.getChart("bitcoin", window, { requestId: "req-2", log });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    now += 1_000;
    for (const window of ["7d", "30d"] as const) {
      await service.getChart("bitcoin", window, { requestId: "req-3", log });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("requests the dollar currency code and the day count matching the window, with no granularity option", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(buildChartFixture(5, 1_700_000_000_000, 3_600_000)), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    await service.getChart("bitcoin", "7d", { requestId: "req-1", log });

    const [calledUrl] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(calledUrl).toContain(`vs_currency=${VS_CURRENCY}`);
    expect(calledUrl).toContain("days=7");
    expect(calledUrl).not.toContain("interval=");
  });

  it("sends the Demo key as a request header when configured and no key header when null", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(buildChartFixture(5, 1_700_000_000_000, 3_600_000)), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const keyed = createMarketDataService({ apiKey: "secret-key", baseUrl: BASE_URL, fetchImpl });
    await keyed.getChart("bitcoin", "1d", { requestId: "req-1", log });
    const [, keyedOptions] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!;
    expect((keyedOptions.headers as Record<string, string>)["x-cg-demo-api-key"]).toBe(
      "secret-key",
    );

    const keyless = createMarketDataService({ apiKey: null, baseUrl: BASE_URL, fetchImpl });
    await keyless.getChart("bitcoin", "1d", { requestId: "req-2", log });
    const [, keylessOptions] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[1]!;
    expect((keylessOptions.headers as Record<string, string>)["x-cg-demo-api-key"]).toBeUndefined();
  });

  it("falls back to the previously cached series with stale: true and its original fetchedAt on upstream failure, and logs one stale line naming the chart resource key", async () => {
    let now = 1_700_000_000_000;
    const { lines, log } = makeLogger();
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify(buildChartFixture(5, now, 3_600_000)), { status: 200 });
      }
      return new Response(null, { status: 503 });
    }) as unknown as typeof fetch;
    const service = createMarketDataService({
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    const first = await service.getChart("bitcoin", "1d", { requestId: "req-1", log });
    now += CHART_TTL_MS["1d"];
    const second = await service.getChart("bitcoin", "1d", { requestId: "req-2", log });

    expect(second.stale).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(second.points).toEqual(first.points);

    const parsed = parseLines(lines);
    const staleLines = parsed.filter((entry) => entry.msg === "serving stale market data");
    expect(staleLines).toHaveLength(1);
    expect(staleLines[0]?.resource).toBe(chartCacheKey("bitcoin", "1d"));
    expect(staleLines[0]?.reason).toBe("http_503");
  });

  it("classifies a timeout that fires mid-body-read as reason timeout, not malformed_body (WR-03)", async () => {
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      async () =>
        ({
          status: 200,
          json: () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const service = createMarketDataService({ apiKey: "key", baseUrl: BASE_URL, fetchImpl });

    try {
      await service.getChart("bitcoin", "1d", { requestId: "req-1", log });
      expect.unreachable("expected getChart to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(MarketDataUpstreamError);
      expect((error as MarketDataUpstreamError).reason).toBe("timeout");
    }
  });
});

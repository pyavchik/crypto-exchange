import { describe, expect, it } from "vitest";
import { buildApp, UUID_RE } from "../app.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { createLogger } from "../lib/logger.js";

function makeFixture(count: number): unknown[] {
  const entries: unknown[] = [];
  for (let i = 0; i < count; i += 1) {
    entries.push({
      id: `coin-${i}`,
      symbol: `c${i}`,
      name: `Coin ${i}`,
      current_price: 10 + i,
      market_cap: 1_000_000 * (i + 1),
      total_volume: 500_000 * (i + 1),
      price_change_percentage_24h: i % 2 === 0 ? 1.5 : -1.5,
    });
  }
  return entries;
}

function makeChartFixture(count: number): unknown {
  const prices: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    prices.push([1_700_000_000_000 + i * 3_600_000, 100 + i]);
  }
  return { prices, market_caps: [], total_volumes: [] };
}

/**
 * A combined stub serving both /coins/markets (curated list, 25 fabricated
 * entries -> 20 curated coin-0..coin-19) and /coins/{id}/market_chart, and
 * recording every requested URL so a test can assert the ABSENCE of a chart
 * upstream call, not merely a 404 status — a 404 returned after an upstream
 * call would satisfy a status assertion while leaving the open-proxy hole
 * (T-03-08/D-45) wide open.
 */
function buildFetchStub(): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    if (url.includes("/market_chart")) {
      return new Response(JSON.stringify(makeChartFixture(5)), { status: 200 });
    }
    return new Response(JSON.stringify(makeFixture(25)), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("GET /api/markets", () => {
  it("returns 200 with a pairs array, an ISO fetchedAt and stale: false, and requires no session cookie", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fetchImpl = (async () =>
      new Response(JSON.stringify(makeFixture(25)), { status: 200 })) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/api/markets" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.pairs)).toBe(true);
    expect(body.pairs.length).toBe(20);
    expect(typeof body.fetchedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    expect(body.stale).toBe(false);
    expect(response.headers["set-cookie"]).toBeUndefined();

    const requestId = response.headers["x-request-id"];
    expect(typeof requestId).toBe("string");
    expect(UUID_RE.test(requestId as string)).toBe(true);

    await app.close();
  });

  it("returns 502 with error.code UPSTREAM_UNAVAILABLE and a requestId in the D-09 envelope when the upstream fails and nothing is cached", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fetchImpl = (async () => new Response(null, { status: 503 })) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/api/markets" });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(typeof body.error.requestId).toBe("string");
    expect(body.error.requestId).toBe(response.headers["x-request-id"]);

    await app.close();
  });

  it("works with no COINGECKO_API_KEY configured, falling back to unauthenticated upstream calls (D-35)", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({});
    let lastHeaders: Record<string, unknown> | undefined;
    const fetchImpl = (async (_url, options) => {
      lastHeaders = (options as { headers?: Record<string, unknown> })?.headers;
      return new Response(JSON.stringify(makeFixture(25)), { status: 200 });
    }) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/api/markets" });

    expect(response.statusCode).toBe(200);
    expect(lastHeaders?.["x-cg-demo-api-key"]).toBeUndefined();

    await app.close();
  });

  it("serves two callers inside the TTL from a single upstream call", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify(makeFixture(25)), { status: 200 });
    }) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const first = await app.inject({ method: "GET", url: "/api/markets" });
    const second = await app.inject({ method: "GET", url: "/api/markets" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(fetchCalls).toBe(1);

    await app.close();
  });

  it("strips fields outside the response schema (additionalProperties: false)", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fixture = makeFixture(21).map((entry, index) =>
      index === 0
        ? { ...(entry as Record<string, unknown>), image: "https://evil.example/x.png" }
        : entry,
    );
    const fetchImpl = (async () =>
      new Response(JSON.stringify(fixture), { status: 200 })) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/api/markets" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    for (const pair of body.pairs) {
      expect(Object.keys(pair).sort()).toEqual(
        ["change24hPct", "id", "marketCap", "name", "pair", "price", "symbol", "volume24h"].sort(),
      );
    }

    await app.close();
  });
});

describe("GET /api/markets/:id/chart", () => {
  it("returns 200 with the coin id, the window, a points array and an ISO fetchedAt, and requires no session cookie", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({
      method: "GET",
      url: "/api/markets/coin-0/chart?window=7d",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe("coin-0");
    expect(body.window).toBe("7d");
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThan(0);
    expect(typeof body.fetchedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    expect(response.headers["set-cookie"]).toBeUndefined();

    await app.close();
  });

  it("returns the 1d window when the window query parameter is omitted", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/api/markets/coin-0/chart" });

    expect(response.statusCode).toBe(200);
    expect(response.json().window).toBe("1d");

    await app.close();
  });

  it("returns 400 with error.code VALIDATION_ERROR and a requestId for an unsupported window", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({
      method: "GET",
      url: "/api/markets/coin-0/chart?window=90d",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof body.error.requestId).toBe("string");

    await app.close();
  });

  it("returns 404 with error.code UNKNOWN_MARKET and a requestId for a coin id absent from the curated list, making no chart upstream call", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl, calls } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({
      method: "GET",
      url: "/api/markets/not-a-real-coin/chart",
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("UNKNOWN_MARKET");
    expect(typeof body.error.requestId).toBe("string");
    expect(calls.some((url) => url.includes("/market_chart"))).toBe(false);

    await app.close();
  });

  it("returns 404 and makes no chart upstream call for fifty distinct fabricated coin ids", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl, calls } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });

    for (let i = 0; i < 50; i += 1) {
      const response = await app.inject({
        method: "GET",
        url: `/api/markets/fabricated-coin-${i}/chart`,
      });
      expect(response.statusCode).toBe(404);
    }

    expect(calls.filter((url) => url.includes("/market_chart"))).toHaveLength(0);

    await app.close();
  });

  it("rejects a path id containing a slash, a percent-encoded slash, or a scheme-and-host string with 400 or 404, never reaching an upstream call", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl, calls } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });

    const paths = [
      "/api/markets/coin-0%2Fchart/chart",
      "/api/markets/https://evil.example/chart",
      "/api/markets/coin-0/../etc/chart",
    ];
    for (const path of paths) {
      const response = await app.inject({ method: "GET", url: path });
      expect([400, 404]).toContain(response.statusCode);
    }

    expect(calls.filter((url) => url.includes("/market_chart"))).toHaveLength(0);

    await app.close();
  });

  it("returns the 502 UPSTREAM_UNAVAILABLE envelope rather than a 404 when the curated list itself is cold and unavailable", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fetchImpl = (async () => new Response(null, { status: 503 })) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/api/markets/bitcoin/chart" });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("UPSTREAM_UNAVAILABLE");

    await app.close();
  });

  it("serializes only the documented members, dropping any extra field the service returns", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: { write: () => true } });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const { fetchImpl } = buildFetchStub();

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({
      method: "GET",
      url: "/api/markets/coin-0/chart?window=7d",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(
      ["fetchedAt", "id", "points", "stale", "window"].sort(),
    );
    for (const point of body.points) {
      expect(Object.keys(point).sort()).toEqual(["time", "value"]);
    }

    await app.close();
  });
});

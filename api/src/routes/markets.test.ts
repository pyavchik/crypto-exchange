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

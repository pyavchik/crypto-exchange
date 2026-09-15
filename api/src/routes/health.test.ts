import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp, UUID_RE } from "../app.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { upstreamChecks } from "../db/schema.js";
import type { CoingeckoStatusService, UpstreamCheck } from "../lib/coingecko.js";
import { createLogger } from "../lib/logger.js";
import healthRoutes from "./health.js";

const API_PACKAGE_JSON_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);
const API_PKG_VERSION = (
  JSON.parse(readFileSync(API_PACKAGE_JSON_PATH, "utf8")) as { version: string }
).version;

function captureLines() {
  const lines: string[] = [];
  const destination = {
    write: (msg: string): boolean => {
      lines.push(msg);
      return true;
    },
  };
  return { lines, destination };
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("GET /health", () => {
  it("reports not_configured with no CoinGecko key and logs the request", async () => {
    const { db } = createDb(":memory:");
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });
    const config = loadConfig({});

    const app = await buildApp({ config, db, logger });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["commit", "status", "upstream", "version"].sort());
    expect(body).toEqual({
      status: "ok",
      version: API_PKG_VERSION,
      commit: "dev",
      upstream: { coingecko: { status: "not_configured", checkedAt: null, latencyMs: null } },
    });

    const requestId = response.headers["x-request-id"];
    expect(typeof requestId).toBe("string");
    expect(UUID_RE.test(requestId as string)).toBe(true);

    const parsed = parseLines(lines);
    const completed = parsed.find((entry) => entry.msg === "request completed");
    expect(completed).toBeDefined();
    expect(completed?.requestId).toBe(requestId);
    expect(completed?.path).toBe("/health");
    expect(completed?.status).toBe(200);

    await app.close();
  });

  it("caches the upstream ping after one real call", async () => {
    const { db } = createDb(":memory:");
    const { destination } = captureLines();
    const logger = createLogger({ destination });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });

    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ gecko_says: "(V3) To the Moon!" }), { status: 200 });
    }) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });

    const first = await app.inject({ method: "GET", url: "/health" });
    const second = await app.inject({ method: "GET", url: "/health" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("application/json");
    expect(first.headers["x-request-id"]).toBeDefined();
    expect(first.json().upstream.coingecko.status).toBe("ok");
    expect(second.json().upstream.coingecko.status).toBe("ok");
    expect(fetchCalls).toBe(1);

    const rows = await db.select().from(upstreamChecks);
    expect(rows).toHaveLength(1);

    await app.close();
  });

  it("reports the commit from GIT_COMMIT when configured", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: captureLines().destination });
    const config = loadConfig({ GIT_COMMIT: "abc1234" });

    const app = await buildApp({ config, db, logger });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json().commit).toBe("abc1234");

    await app.close();
  });

  it("reports down (HTTP 200) when the upstream ping resolves 503", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: captureLines().destination });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fetchImpl = (async () => new Response(null, { status: 503 })) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["x-request-id"]).toBeDefined();
    const { coingecko } = response.json().upstream;
    expect(coingecko.status).toBe("down");
    expect(typeof coingecko.checkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(coingecko.checkedAt))).toBe(false);
    expect(typeof coingecko.latencyMs).toBe("number");

    await app.close();
  });

  it("reports degraded (HTTP 200) when the upstream ping resolves 429", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: captureLines().destination });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fetchImpl = (async () => new Response(null, { status: 429 })) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.json().upstream.coingecko.status).toBe("degraded");

    await app.close();
  });

  it("reports down (HTTP 200) when the upstream fetch rejects with TypeError", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: captureLines().destination });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.json().upstream.coingecko.status).toBe("down");

    await app.close();
  });

  it("strips fields outside the D-03 contract from the serialized response (additionalProperties: false)", async () => {
    const app = Fastify();
    const coingecko: CoingeckoStatusService = {
      getStatus: async () =>
        ({
          status: "ok",
          checkedAt: "2026-01-01T00:00:00.000Z",
          latencyMs: 42,
          secret: "should never leak",
        }) as unknown as UpstreamCheck,
    };

    await app.register(healthRoutes, { version: "0.0.0-test", commit: "test", coingecko });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.upstream.coingecko).toEqual({
      status: "ok",
      checkedAt: "2026-01-01T00:00:00.000Z",
      latencyMs: 42,
    });
    expect(Object.keys(body.upstream.coingecko)).not.toContain("secret");

    await app.close();
  });

  it("dedupes 10 concurrent /health requests on a fresh cache into one upstream call", async () => {
    const { db } = createDb(":memory:");
    const logger = createLogger({ destination: captureLines().destination });
    const config = loadConfig({ COINGECKO_API_KEY: "test-key" });
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const app = await buildApp({ config, db, logger, fetchImpl });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => app.inject({ method: "GET", url: "/health" })),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(200);
    }
    expect(fetchCalls).toBe(1);

    const rows = await db.select().from(upstreamChecks);
    expect(rows).toHaveLength(1);

    const bodies = responses.map((response) => response.json().upstream.coingecko);
    for (const body of bodies) {
      expect(body).toEqual(bodies[0]);
    }

    await app.close();
  });
});

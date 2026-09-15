import { describe, expect, it } from "vitest";
import { buildApp, UUID_RE } from "../app.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { upstreamChecks } from "../db/schema.js";
import { createLogger } from "../lib/logger.js";

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
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["commit", "status", "upstream", "version"].sort());
    expect(body.upstream.coingecko).toEqual({
      status: "not_configured",
      checkedAt: null,
      latencyMs: null,
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
    expect(first.json().upstream.coingecko.status).toBe("ok");
    expect(second.json().upstream.coingecko.status).toBe("ok");
    expect(fetchCalls).toBe(1);

    const rows = await db.select().from(upstreamChecks);
    expect(rows).toHaveLength(1);

    await app.close();
  });
});

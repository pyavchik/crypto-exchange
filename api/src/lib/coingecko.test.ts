import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client.js";
import { upstreamChecks } from "../db/schema.js";
import {
  classifyPing,
  createCoingeckoStatusService,
  PING_CACHE_TTL_MS,
  PING_TIMEOUT_MS,
  SLOW_THRESHOLD_MS,
} from "./coingecko.js";
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
  // Mirrors how Fastify's request.log is a per-request child logger carrying
  // the requestId binding — exercises the same code path as production.
  return { lines, log: logger.child({ requestId: "req-1" }) };
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("classifyPing", () => {
  it("classifies every D-04 case", () => {
    expect(classifyPing({ httpStatus: 200, latencyMs: 150, timedOut: false })).toBe("ok");
    expect(classifyPing({ httpStatus: 200, latencyMs: SLOW_THRESHOLD_MS, timedOut: false })).toBe(
      "ok",
    );
    expect(
      classifyPing({ httpStatus: 200, latencyMs: SLOW_THRESHOLD_MS + 1, timedOut: false }),
    ).toBe("degraded");
    expect(classifyPing({ httpStatus: 429, latencyMs: 100, timedOut: false })).toBe("degraded");
    expect(classifyPing({ httpStatus: 500, latencyMs: 10, timedOut: false })).toBe("down");
    expect(classifyPing({ httpStatus: 503, latencyMs: 10, timedOut: false })).toBe("down");
    expect(classifyPing({ httpStatus: 401, latencyMs: 10, timedOut: false })).toBe("down");
    expect(classifyPing({ httpStatus: 403, latencyMs: 10, timedOut: false })).toBe("down");
    expect(classifyPing({ httpStatus: null, latencyMs: PING_TIMEOUT_MS, timedOut: true })).toBe(
      "down",
    );
    expect(classifyPing({ httpStatus: null, latencyMs: 10, timedOut: false })).toBe("down");
  });
});

describe("createCoingeckoStatusService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns not_configured without a key, performs no upstream call, and stays empty", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: null,
      baseUrl: BASE_URL,
      fetchImpl,
    });

    const result = await service.getStatus({ requestId: "req-1", log });

    expect(result).toEqual({ status: "not_configured", checkedAt: null, latencyMs: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    const rows = await db.select().from(upstreamChecks);
    expect(rows).toHaveLength(0);
  });

  it("fetches once, serves the cache under the TTL, and refetches at exactly PING_CACHE_TTL_MS", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    let now = 1_700_000_000_000;
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    const first = await service.getStatus({ requestId: "req-1", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("ok");

    now += PING_CACHE_TTL_MS - 1;
    const second = await service.getStatus({ requestId: "req-2", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    now += 1;
    const third = await service.getStatus({ requestId: "req-3", log });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(third.status).toBe("ok");
  });

  it("treats a stored row with a future checkedAt as expired and refetches", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    const now = 1_700_000_000_000;
    await db.insert(upstreamChecks).values({
      service: "coingecko",
      status: "ok",
      httpStatus: 200,
      latencyMs: 120,
      checkedAt: new Date(now + 60_000).toISOString(),
      requestId: "prior",
    });
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    const result = await service.getStatus({ requestId: "req-1", log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
  });

  it("caches a down result too, avoiding a second upstream call within the TTL", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    let now = 1_700_000_000_000;
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
      now: () => now,
    });

    const first = await service.getStatus({ requestId: "req-1", log });
    expect(first.status).toBe("down");

    now += 1_000;
    const second = await service.getStatus({ requestId: "req-2", log });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.status).toBe("down");
  });

  it("classifies a hung request as down, with a measured latency, once the abort signal fires", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchImpl = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = options.signal;
          const onAbort = (): void => {
            reject(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }));
          };
          // Defensive against ordering: `abort()` may be called before or
          // after fetchImpl attaches its listener depending on when the
          // caller's promise chain resumes.
          if (signal?.aborted) {
            onAbort();
          } else {
            signal?.addEventListener("abort", onAbort);
          }
        }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
    });

    const pending = service.getStatus({ requestId: "req-1", log });
    controller.abort();
    const result = await pending;

    expect(result.status).toBe("down");
    expect(result.latencyMs).not.toBeNull();
  });

  it("classifies a network error (TypeError) as down and stores a null http_status", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
    });

    const result = await service.getStatus({ requestId: "req-1", log });

    expect(result.status).toBe("down");
    const rows = await db.select().from(upstreamChecks);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.httpStatus).toBeNull();
  });

  it("dedupes 10 concurrent calls on an empty cache into a single upstream fetch", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response(null, { status: 200 })), 50);
        }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({
      db,
      apiKey: "key",
      baseUrl: BASE_URL,
      fetchImpl,
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => service.getStatus({ requestId: `req-${i}`, log })),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(upstreamChecks);
    expect(rows).toHaveLength(1);
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("survives a restart: a second instance over the same file reuses the fresh row with no upstream call", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cg-restart-"));
    const dbPath = join(dir, "app.db");
    const { log } = makeLogger();
    try {
      const first = createDb(dbPath);
      const fetchImplA = vi.fn(
        async () => new Response(null, { status: 200 }),
      ) as unknown as typeof fetch;
      const serviceA = createCoingeckoStatusService({
        db: first.db,
        apiKey: "key",
        baseUrl: BASE_URL,
        fetchImpl: fetchImplA,
        now: () => 1_700_000_000_000,
      });
      const resultA = await serviceA.getStatus({ requestId: "req-1", log });
      expect(fetchImplA).toHaveBeenCalledTimes(1);
      first.close();

      const second = createDb(dbPath);
      const fetchImplB = vi.fn() as unknown as typeof fetch;
      const serviceB = createCoingeckoStatusService({
        db: second.db,
        apiKey: "key",
        baseUrl: BASE_URL,
        fetchImpl: fetchImplB,
        now: () => 1_700_000_001_000,
      });
      const resultB = await serviceB.getStatus({ requestId: "req-2", log });

      expect(fetchImplB).not.toHaveBeenCalled();
      expect(resultB).toEqual(resultA);
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("logs exactly one upstream call line per real fetch, and the API key never appears in it", async () => {
    const { db } = createDb(":memory:");
    const { lines, log } = makeLogger();
    const apiKey = "test-secret-key-123";
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({ db, apiKey, baseUrl: BASE_URL, fetchImpl });

    await service.getStatus({ requestId: "req-1", log });

    const parsed = parseLines(lines);
    const upstreamLines = parsed.filter((entry) => entry.msg === "upstream call");

    expect(upstreamLines).toHaveLength(1);
    const entry = upstreamLines[0];
    expect(entry?.url).toBe(`${BASE_URL}/ping`);
    expect(typeof entry?.status).toBe("number");
    expect(typeof entry?.durationMs).toBe("number");
    expect(entry?.result).toBe("ok");
    expect(entry?.requestId).toBe("req-1");

    const rawText = lines.join("\n");
    expect(rawText).not.toContain(apiKey);
  });

  it("sends the key in the x-cg-demo-api-key header against a URL with no query string", async () => {
    const { db } = createDb(":memory:");
    const { log } = makeLogger();
    const apiKey = "test-secret-key-123";
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const service = createCoingeckoStatusService({ db, apiKey, baseUrl: BASE_URL, fetchImpl });

    await service.getStatus({ requestId: "req-1", log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;
    expect(calledUrl).toBe(`${BASE_URL}/ping`);
    expect(calledUrl).not.toContain("?");
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["x-cg-demo-api-key"]).toBe(apiKey);
  });
});

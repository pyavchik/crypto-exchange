import { desc, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { AppDatabase } from "../db/client.js";
import { upstreamChecks } from "../db/schema.js";
import { createInFlightRegistry } from "./keyedCache.js";

export type UpstreamStatus = "ok" | "degraded" | "down" | "not_configured";

export interface UpstreamCheck {
  status: UpstreamStatus;
  checkedAt: string | null;
  latencyMs: number | null;
}

export interface CoingeckoStatusDeps {
  db: AppDatabase;
  apiKey: string | null;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface CoingeckoStatusService {
  getStatus(ctx: { requestId: string; log: FastifyBaseLogger }): Promise<UpstreamCheck>;
}

export const PING_CACHE_TTL_MS = 300_000;
export const PING_TIMEOUT_MS = 5_000;
export const SLOW_THRESHOLD_MS = 2_000;

const SERVICE_NAME = "coingecko";

export function classifyPing(input: {
  httpStatus: number | null;
  latencyMs: number;
  timedOut: boolean;
}): "ok" | "degraded" | "down" {
  const { httpStatus, latencyMs, timedOut } = input;

  if (timedOut || httpStatus === null) return "down";
  if (httpStatus === 429) return "degraded";
  if (httpStatus >= 500) return "down";
  if (httpStatus >= 200 && httpStatus < 300) {
    return latencyMs > SLOW_THRESHOLD_MS ? "degraded" : "ok";
  }
  return "down";
}

export function createCoingeckoStatusService(deps: CoingeckoStatusDeps): CoingeckoStatusService {
  const { db, apiKey, baseUrl, fetchImpl = fetch, now = Date.now } = deps;

  // Per-instance in-flight dedupe: when the cache is missing or expired and a
  // check is already running for this instance, every concurrent caller
  // awaits that same promise instead of starting another upstream fetch
  // (T-01-17 — the 5-minute cache alone does not protect against a burst of
  // concurrent callers that all observe an empty/expired cache before the
  // first insert lands). D-39: delegates to the shared keyed registry so
  // exactly one dedupe implementation exists in the repo.
  const inFlightRegistry = createInFlightRegistry();

  async function performCheck(
    key: string,
    ctx: { requestId: string; log: FastifyBaseLogger },
  ): Promise<UpstreamCheck> {
    const url = `${baseUrl}/ping`;
    const start = now();
    let httpStatus: number | null = null;
    let timedOut = false;

    try {
      const response = await fetchImpl(url, {
        headers: { "x-cg-demo-api-key": key },
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
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
      // failure: httpStatus stays null and timedOut stays false, which
      // classifyPing already maps to "down".
    }

    const latencyMs = now() - start;
    const status = classifyPing({ httpStatus, latencyMs, timedOut });
    // checkedAt is derived from the same clock used for cache-freshness math
    // (now()/start), not wall-clock Date.now() — otherwise an injected fake
    // clock (tests, or any future deterministic-time caller) would compute
    // ages against a real-time checkedAt and desync the TTL boundary.
    const checkedAt = new Date(start).toISOString();

    await db.insert(upstreamChecks).values({
      service: SERVICE_NAME,
      status,
      httpStatus,
      latencyMs,
      checkedAt,
      requestId: ctx.requestId,
    });

    const logFields = {
      upstream: SERVICE_NAME,
      url,
      status: httpStatus,
      durationMs: latencyMs,
      result: status,
    };

    // Never pass headers, the key, or the deps object to the logger — only
    // these five scalar fields ever reach the log line (D-08).
    if (status === "ok") {
      ctx.log.info(logFields, "upstream call");
    } else {
      ctx.log.warn(logFields, "upstream call");
    }

    return { status, checkedAt, latencyMs };
  }

  return {
    async getStatus(ctx): Promise<UpstreamCheck> {
      if (apiKey === null) {
        return { status: "not_configured", checkedAt: null, latencyMs: null };
      }

      const [latest] = await db
        .select()
        .from(upstreamChecks)
        .where(eq(upstreamChecks.service, SERVICE_NAME))
        .orderBy(desc(upstreamChecks.checkedAt))
        .limit(1);

      if (latest) {
        const age = now() - Date.parse(latest.checkedAt);
        if (age >= 0 && age < PING_CACHE_TTL_MS) {
          return {
            status: latest.status as UpstreamStatus,
            checkedAt: latest.checkedAt,
            latencyMs: latest.latencyMs,
          };
        }
      }

      return inFlightRegistry.run(SERVICE_NAME, () => performCheck(apiKey, ctx));
    },
  };
}

import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type pino from "pino";
import type { AppConfig } from "./config.js";
import type { AppDatabase } from "./db/client.js";
import { createCoingeckoStatusService } from "./lib/coingecko.js";
import healthRoutes, { readApiVersion } from "./routes/health.js";

export interface AppDeps {
  config: AppConfig;
  db: AppDatabase;
  logger: pino.Logger;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === "string" && UUID_RE.test(header)) {
    return header;
  }
  return randomUUID();
}

/**
 * Fastify's request-scoped log controller. `requestIdLogLabel: 'requestId'`
 * (passed at construction) is what puts the request id on every request-scoped
 * log line — this controller only adds the single `request completed` line
 * once the response finishes.
 */
export class RequestLogController extends LogController {
  incomingRequest(): void {
    // Intentionally silent: the "request completed" line below is the single
    // request-lifecycle log line this project emits (D-07).
  }

  requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const path = request.url.split("?")[0] ?? request.url;
    const status = reply.statusCode;
    const durationMs = Math.round(reply.elapsedTime);

    const fields: Record<string, unknown> = {
      method: request.method,
      path,
      status,
      durationMs,
      userId: null,
    };

    if (error) {
      fields.err = error;
    }

    const level = error || status >= 500 ? "error" : "info";
    request.log[level](fields, "request completed");
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // Widened to FastifyBaseLogger so Fastify's Logger type parameter resolves to
  // its default instead of the concrete pino.Logger type (which carries extra
  // properties like `msgPrefix` that would otherwise leak into every internal
  // Fastify generic and break FastifyInstance's default type elsewhere).
  const app = Fastify({
    loggerInstance: deps.logger as FastifyBaseLogger,
    genReqId: (req) => resolveRequestId(req.headers["x-request-id"]),
    logController: new RequestLogController({ requestIdLogLabel: "requestId" }),
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  await app.register(cors, {
    origin: deps.config.corsOrigins,
    exposedHeaders: ["X-Request-Id"],
  });

  const coingecko = createCoingeckoStatusService({
    db: deps.db,
    apiKey: deps.config.coingeckoApiKey,
    baseUrl: deps.config.coingeckoBaseUrl,
    fetchImpl: deps.fetchImpl,
    now: deps.now,
  });

  await app.register(healthRoutes, {
    version: readApiVersion(),
    commit: deps.config.gitCommit,
    coingecko,
  });

  return app;
}

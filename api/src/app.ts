import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
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
import { createAccountService } from "./lib/accounts.js";
import { createCoingeckoStatusService } from "./lib/coingecko.js";
import { registerErrorHandlers } from "./lib/errors.js";
import { createMarketDataService } from "./lib/marketData.js";
import { createRequireSession, createSessionService } from "./lib/session.js";
import authRoutes from "./routes/auth.js";
import healthRoutes, { readApiVersion } from "./routes/health.js";
import marketsRoutes from "./routes/markets.js";
import walletRoutes from "./routes/wallet.js";

// Phase 2 populates this from the authenticated session; until then it is
// always null, but the request-log line (D-07) always has the slot.
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}

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
      userId: request.userId ?? null,
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

  app.decorateRequest("userId", null);

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  registerErrorHandlers(app);

  // Must load before any route reads request.cookies.
  await app.register(cookie);

  await app.register(cors, {
    origin: deps.config.corsOrigins,
    credentials: true,
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

  const accounts = createAccountService({ db: deps.db, now: deps.now });
  const sessions = createSessionService({ db: deps.db, now: deps.now });
  const requireSession = createRequireSession(sessions);

  await app.register(authRoutes, {
    accounts,
    sessions,
    requireSession,
    cookieSecure: deps.config.cookieSecure,
  });

  await app.register(walletRoutes, { accounts, requireSession });

  const marketData = createMarketDataService({
    apiKey: deps.config.coingeckoApiKey,
    baseUrl: deps.config.coingeckoBaseUrl,
    fetchImpl: deps.fetchImpl,
    now: deps.now,
  });

  await app.register(marketsRoutes, { marketData });

  return app;
}

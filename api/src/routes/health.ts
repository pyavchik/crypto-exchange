import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import type { CoingeckoStatusService, UpstreamCheck } from "../lib/coingecko.js";

export interface HealthResponse {
  status: "ok";
  version: string;
  commit: string;
  upstream: { coingecko: UpstreamCheck };
}

const PACKAGE_JSON_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);

export function readApiVersion(): string {
  const raw = readFileSync(PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as { version: string };
  return parsed.version;
}

export interface HealthRoutesOptions {
  version: string;
  commit: string;
  coingecko: CoingeckoStatusService;
}

// additionalProperties: false at every level so an accidental extra field on
// the upstream check (or anywhere else in the body) can never leak through
// Fastify's response serialization (D-03, T-01-19), regardless of what the
// underlying service happens to return.
const HEALTH_RESPONSE_SCHEMA = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["status", "version", "commit", "upstream"],
    properties: {
      status: { type: "string", enum: ["ok"] },
      version: { type: "string" },
      commit: { type: "string" },
      upstream: {
        type: "object",
        additionalProperties: false,
        required: ["coingecko"],
        properties: {
          coingecko: {
            type: "object",
            additionalProperties: false,
            required: ["status", "checkedAt", "latencyMs"],
            properties: {
              status: { type: "string", enum: ["ok", "degraded", "down", "not_configured"] },
              checkedAt: { type: ["string", "null"] },
              latencyMs: { type: ["number", "null"] },
            },
          },
        },
      },
    },
  },
} as const;

const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (
  app: FastifyInstance,
  opts,
  done,
) => {
  app.get("/health", { schema: { response: HEALTH_RESPONSE_SCHEMA } }, async (request, reply) => {
    const coingecko = await opts.coingecko.getStatus({
      requestId: request.id,
      log: request.log,
    });

    const body: HealthResponse = {
      status: "ok",
      version: opts.version,
      commit: opts.commit,
      upstream: { coingecko },
    };

    return reply.status(200).send(body);
  });

  done();
};

export default healthRoutes;

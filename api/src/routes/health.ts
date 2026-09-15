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

const PACKAGE_JSON_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");

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

const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (
  app: FastifyInstance,
  opts,
  done,
) => {
  app.get("/health", async (request, reply) => {
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

import type { FastifyInstance, FastifyPluginCallback, FastifyReply } from "fastify";
import { AppError, errorBody } from "../lib/errors.js";
import type { MarketDataService } from "../lib/marketData.js";

export interface MarketsRoutesOptions {
  marketData: MarketDataService;
}

// additionalProperties: false at every nesting level, matching
// health.ts/wallet.ts's leak-prevention discipline (D-03, T-01-19) — an
// unmapped upstream field (e.g. the coin image URL) can never leak through
// serialization. stale/fetchedAt are `required`, never optional-and-absent.
const MARKET_PAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "symbol", "name", "pair", "price", "change24hPct", "volume24h", "marketCap"],
  properties: {
    id: { type: "string" },
    symbol: { type: "string" },
    name: { type: "string" },
    pair: { type: "string" },
    price: { type: "number" },
    change24hPct: { type: ["number", "null"] },
    volume24h: { type: ["number", "null"] },
    marketCap: { type: ["number", "null"] },
  },
} as const;

const MARKETS_RESPONSE_SCHEMA = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["pairs", "fetchedAt", "stale"],
    properties: {
      pairs: { type: "array", items: MARKET_PAIR_SCHEMA },
      fetchedAt: { type: "string" },
      stale: { type: "boolean" },
    },
  },
} as const;

const marketsRoutes: FastifyPluginCallback<MarketsRoutesOptions> = (
  app: FastifyInstance,
  opts,
  done,
) => {
  // D-44: public — no preHandler, no session. /markets must render for a
  // logged-out visitor.
  app.get(
    "/api/markets",
    { schema: { response: MARKETS_RESPONSE_SCHEMA } },
    async (request, reply) => {
      try {
        const payload = await opts.marketData.getMarkets({
          requestId: request.id,
          log: request.log,
        });
        return reply.status(200).send(payload);
      } catch (error) {
        // D-09: the global error handler masks every >=500 statusCode into a
        // generic INTERNAL_ERROR envelope by design (it never trusts a
        // thrown error's own message/code at that severity — see
        // app.test.ts's "even for an AppError-shaped throw" case). A 502
        // UPSTREAM_UNAVAILABLE from marketData is a deliberate, safe-to-show
        // client-facing error, not an unhandled bug, so it is sent directly
        // here rather than rethrown into that masking path.
        if (error instanceof AppError) {
          // Widened to plain FastifyReply: the route's response schema only
          // declares 200, so the schema-narrowed reply type otherwise
          // rejects any other status code at compile time.
          return (reply as FastifyReply)
            .status(error.statusCode)
            .send(errorBody(error.code, error.message, request.id, error.fields));
        }
        throw error;
      }
    },
  );

  done();
};

export default marketsRoutes;

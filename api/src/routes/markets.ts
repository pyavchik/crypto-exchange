import type { FastifyInstance, FastifyPluginCallback, FastifyReply } from "fastify";
import { AppError, errorBody } from "../lib/errors.js";
import { CHART_WINDOWS, type ChartWindow, type MarketDataService } from "../lib/marketData.js";

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

// T-03-08 layer 1: a coin id in a path is the first client-controlled string
// this project has ever interpolated toward an upstream. The pattern alone
// is defence-in-depth only — layer 2 (the curated-list equality check in the
// handler below, T-03-08/D-45) is the actual mitigation, since a well-formed
// but untracked id would still pass this pattern.
const CHART_PARAMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 100, pattern: "^[a-z0-9-]+$" },
  },
} as const;

const CHART_QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    window: { type: "string", enum: [...CHART_WINDOWS], default: "1d" },
  },
} as const;

const CHART_POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["time", "value"],
  properties: {
    time: { type: "number" },
    value: { type: "number" },
  },
} as const;

const CHART_RESPONSE_SCHEMA = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["id", "window", "points", "fetchedAt", "stale"],
    properties: {
      id: { type: "string" },
      window: { type: "string", enum: [...CHART_WINDOWS] },
      points: { type: "array", items: CHART_POINT_SCHEMA },
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

  // D-44: public, same as /api/markets — market data is not user-specific.
  app.get(
    "/api/markets/:id/chart",
    {
      schema: {
        params: CHART_PARAMS_SCHEMA,
        querystring: CHART_QUERY_SCHEMA,
        response: CHART_RESPONSE_SCHEMA,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { window } = request.query as { window: ChartWindow };

      try {
        // T-03-08/D-45: the curated list, not an arbitrary CoinGecko
        // identifier, is the source of truth for what this endpoint will
        // proxy. Performing this check FIRST — before getChart is ever
        // called — is the whole mitigation: a fabricated id never becomes a
        // cache key, so an attacker cannot grow the cache by enumeration
        // (T-03-09). The curated list this call produces is cache-served
        // (getMarkets already resolves through its own TTL cache), so
        // reusing it here rather than fetching it twice costs nothing extra
        // and avoids doubling the log lines for one request.
        const markets = await opts.marketData.getMarkets({
          requestId: request.id,
          log: request.log,
        });
        const known = markets.pairs.some((pair) => pair.id === id);
        if (!known) {
          throw new AppError(404, "UNKNOWN_MARKET", "Unknown market");
        }

        const payload = await opts.marketData.getChart(id, window, {
          requestId: request.id,
          log: request.log,
        });
        return reply.status(200).send(payload);
      } catch (error) {
        // D-09: see the identical rationale on the /api/markets handler
        // above — a deliberate client-facing AppError (404 UNKNOWN_MARKET,
        // or a 502 UPSTREAM_UNAVAILABLE from getMarkets/getChart) is sent
        // directly here so a >=500 case never hits the global masking
        // handler by accident, while a <500 case (404) is equally safe to
        // send this way.
        if (error instanceof AppError) {
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

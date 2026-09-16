import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import type { AccountService } from "../lib/accounts.js";

export interface WalletRoutesOptions {
  accounts: AccountService;
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
}

// additionalProperties: false at every level, matching health.ts/auth.ts's
// leak-prevention discipline (D-03).
const WALLET_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["balances"],
  properties: {
    balances: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["asset", "amount"],
        properties: {
          asset: { type: "string" },
          amount: { type: "string" },
        },
      },
    },
  },
} as const;

const walletRoutes: FastifyPluginCallback<WalletRoutesOptions> = (
  app: FastifyInstance,
  opts,
  done,
) => {
  app.get(
    "/api/wallet",
    { preHandler: opts.requireSession, schema: { response: { 200: WALLET_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      // D-20: identity comes only from request.userId, set by requireSession
      // from the session cookie. This handler never reads a path, query or
      // body parameter — the session is the only identity source in this
      // phase, which is what makes AUTH-04 a structural property here.
      const userId = Number(request.userId);
      const balances = opts.accounts.listBalances(userId);
      return reply.status(200).send({ balances });
    },
  );

  done();
};

export default walletRoutes;

import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import type { AccountService } from "../lib/accounts.js";
import { hashPassword } from "../lib/password.js";
import { setSessionCookie, type SessionService } from "../lib/session.js";

export interface AuthRoutesOptions {
  accounts: AccountService;
  sessions: SessionService;
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  cookieSecure: boolean;
}

interface SignupBody {
  email: string;
  password: string;
}

const SIGNUP_BODY_SCHEMA = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string" },
    password: { type: "string" },
  },
  additionalProperties: false,
} as const;

// additionalProperties: false at every level, matching health.ts's
// leak-prevention discipline (D-03).
const SESSION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["email", "balances"],
  properties: {
    email: { type: "string" },
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const authRoutes: FastifyPluginCallback<AuthRoutesOptions> = (app: FastifyInstance, opts, done) => {
  app.post<{ Body: SignupBody }>(
    "/api/signup",
    { schema: { body: SIGNUP_BODY_SCHEMA, response: { 201: SESSION_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const password = request.body.password;
      const passwordHash = await hashPassword(password);

      let user: { id: number; email: string };
      try {
        user = opts.accounts.createWithGrant({ email, passwordHash });
      } catch (error) {
        // D-23: the unique index is the actual duplicate-email guarantee;
        // this maps the thrown better-sqlite3 constraint error
        // (code SQLITE_CONSTRAINT_UNIQUE, message "UNIQUE constraint failed:
        // users.email" — verified against the installed better-sqlite3) to
        // D-26's explicit signup-only duplicate message.
        const code = (error as { code?: unknown } | null)?.code;
        const message = error instanceof Error ? error.message : String(error);
        if (code === "SQLITE_CONSTRAINT_UNIQUE" && message.includes("users.email")) {
          const err = new Error("That email is already registered") as Error & {
            statusCode: number;
            code: string;
          };
          err.statusCode = 409;
          err.code = "EMAIL_TAKEN";
          throw err;
        }
        throw error;
      }

      const { token } = opts.sessions.create(user.id);
      setSessionCookie(reply, token, opts.cookieSecure);

      const balances = opts.accounts.listBalances(user.id);
      return reply.status(201).send({ email: user.email, balances });
    },
  );

  app.get(
    "/api/me",
    { preHandler: opts.requireSession, schema: { response: { 200: SESSION_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      // D-20: identity comes only from request.userId, set by requireSession
      // from the session cookie — never from a path/query/body parameter.
      const userId = Number(request.userId);
      const account = opts.accounts.findById(userId);
      if (!account) {
        const err = new Error("Not signed in") as Error & { statusCode: number; code: string };
        err.statusCode = 401;
        err.code = "UNAUTHENTICATED";
        throw err;
      }
      const balances = opts.accounts.listBalances(userId);
      return reply.status(200).send({ email: account.email, balances });
    },
  );

  done();
};

export default authRoutes;

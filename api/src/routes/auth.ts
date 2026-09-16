import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import type { AccountService } from "../lib/accounts.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  type SessionService,
} from "../lib/session.js";

// D-26/T-02-10: a fixed, valid-format dummy hash, computed once at module
// load. Used as the verification target when an email is unregistered, so
// verifyPassword still runs the same scrypt derivation either way — an
// unknown email and a wrong password take comparable time, and the login
// endpoint never becomes an account-existence oracle by timing.
const DUMMY_PASSWORD_HASH = await hashPassword("dummy-password-for-constant-time-login");

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

const LOGOUT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
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

  app.post<{ Body: SignupBody }>(
    "/api/login",
    { schema: { body: SIGNUP_BODY_SCHEMA, response: { 200: SESSION_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const password = request.body.password;

      const account = opts.accounts.findByEmail(email);
      // T-02-10: always run a verification pass, even when no account
      // matches, so an unknown email and a wrong password take comparable
      // time — see DUMMY_PASSWORD_HASH above.
      const passwordValid = await verifyPassword(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);

      if (!account || !passwordValid) {
        // D-26: one identical message, status and code for both failure
        // modes — login must never reveal which accounts exist.
        const err = new Error("Invalid email or password") as Error & {
          statusCode: number;
          code: string;
        };
        err.statusCode = 401;
        err.code = "INVALID_CREDENTIALS";
        throw err;
      }

      const { token } = opts.sessions.create(account.id);
      setSessionCookie(reply, token, opts.cookieSecure);

      const balances = opts.accounts.listBalances(account.id);
      return reply.status(200).send({ email: account.email, balances });
    },
  );

  app.post(
    "/api/logout",
    { schema: { response: { 200: LOGOUT_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      // No requireSession preHandler here — D-18: logout is idempotent by
      // design, so an absent, already-invalid or already-used session is a
      // success, not an error.
      const rawToken = request.cookies[SESSION_COOKIE_NAME];
      if (rawToken) {
        opts.sessions.revoke(rawToken);
      }
      // Cleared through the same helper (and therefore the same scoping
      // options) that set the cookie — a mismatched path would leave the
      // live cookie in the browser (Pitfall 4).
      clearSessionCookie(reply, opts.cookieSecure);
      return reply.status(200).send({ ok: true });
    },
  );

  done();
};

export default authRoutes;

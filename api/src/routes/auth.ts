import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import type { AccountService } from "../lib/accounts.js";
import { AppError } from "../lib/errors.js";
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

// D-15/D-27: semantic validity the Fastify body schema cannot express per
// field (the schema already rejects a missing key or a non-string value
// before the handler runs). Shared by signup and login so both surfaces
// agree on what a well-formed email/password looks like.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LEN = 254;
const PASSWORD_MIN_LEN = 8;
const PASSWORD_MAX_LEN = 200; // T-02-16: rejected before hashing, so an oversized input never reaches scrypt.

function validateCredentials(input: { email: string; password: string }): Record<string, string> {
  const fields: Record<string, string> = {};

  const trimmedEmail = input.email.trim();
  if (trimmedEmail.length === 0 || trimmedEmail.length > EMAIL_MAX_LEN || !EMAIL_RE.test(trimmedEmail)) {
    fields.email = "Enter a valid email address";
  }

  // Password is NEVER trimmed — the raw string, spaces included, is the
  // secret (D-15).
  if (input.password.length < PASSWORD_MIN_LEN) {
    fields.password = "Password must be at least 8 characters";
  } else if (input.password.length > PASSWORD_MAX_LEN) {
    fields.password = "Password must be at most 200 characters";
  }

  return fields;
}

const authRoutes: FastifyPluginCallback<AuthRoutesOptions> = (app: FastifyInstance, opts, done) => {
  app.post<{ Body: SignupBody }>(
    "/api/signup",
    { schema: { body: SIGNUP_BODY_SCHEMA, response: { 201: SESSION_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      const fields = validateCredentials(request.body);
      if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION_ERROR", "Please fix the highlighted fields", fields);
      }

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
          throw new AppError(409, "EMAIL_TAKEN", "That email is already registered");
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
        throw new AppError(401, "UNAUTHENTICATED", "Not signed in");
      }
      const balances = opts.accounts.listBalances(userId);
      return reply.status(200).send({ email: account.email, balances });
    },
  );

  app.post<{ Body: SignupBody }>(
    "/api/login",
    { schema: { body: SIGNUP_BODY_SCHEMA, response: { 200: SESSION_RESPONSE_SCHEMA } } },
    async (request, reply) => {
      // D-27: malformed input (e.g. an empty email) is a VALIDATION_ERROR,
      // not an INVALID_CREDENTIALS — distinguishable without revealing
      // whether any particular account exists (the check below doesn't
      // depend on account lookup at all).
      const fields = validateCredentials(request.body);
      if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION_ERROR", "Please fix the highlighted fields", fields);
      }

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
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
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

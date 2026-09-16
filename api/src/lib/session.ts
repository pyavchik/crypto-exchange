import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { errorBody } from "./errors.js";

/**
 * D-16/D-17/D-19/D-20: opaque random session tokens (not JWTs). Only the
 * token's SHA-256 hash is ever persisted — the raw token lives only in the
 * cookie — so a leaked `sessions` row can never be replayed as a session.
 */
export const SESSION_COOKIE_NAME = "session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // D-17: 7-day absolute lifetime, no sliding renewal

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface SessionServiceDeps {
  db: AppDatabase;
  now?: () => number;
}

export interface SessionService {
  create(userId: number): { token: string; expiresAt: string };
  validate(rawToken: string): { userId: number } | null;
  revoke(rawToken: string): void;
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const { db, now = Date.now } = deps;

  return {
    create(userId: number) {
      const token = generateSessionToken();
      const tokenHash = hashSessionToken(token);
      const createdAt = new Date(now()).toISOString();
      const expiresAt = new Date(now() + SESSION_TTL_MS).toISOString();
      db.insert(sessions).values({ tokenHash, userId, createdAt, expiresAt }).run();
      return { token, expiresAt };
    },

    validate(rawToken: string) {
      const tokenHash = hashSessionToken(rawToken);
      const row = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
      if (!row) return null;
      // D-19: expired sessions are rejected on read and deleted lazily when
      // encountered — no background sweeper in this phase.
      if (Date.parse(row.expiresAt) <= now()) {
        db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
        return null;
      }
      return { userId: row.userId };
    },

    revoke(rawToken: string): void {
      const tokenHash = hashSessionToken(rawToken);
      db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
    },
  };
}

// Both setSessionCookie and clearSessionCookie MUST pass the identical
// scoping options (path/httpOnly/sameSite/secure). A cookie is identified by
// name + path; clearing with mismatched options creates a second expired
// cookie and leaves the live one in the browser (D-18/Pitfall 4).
function cookieOptions(secure: boolean) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
  };
}

export function setSessionCookie(reply: FastifyReply, rawToken: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    ...cookieOptions(secure),
    maxAge: SESSION_TTL_MS / 1000, // @fastify/cookie's maxAge unit is seconds
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions(secure));
}

/**
 * D-20: identity resolves ONLY from the session cookie. On failure, replies
 * 401 UNAUTHENTICATED in the D-09 envelope and short-circuits the route
 * handler; on success, assigns `request.userId` (converted to string to
 * satisfy the existing `FastifyRequest.userId: string | null` contract, so
 * the D-07 request-completed log line picks it up for free).
 */
export function createRequireSession(sessions: SessionService) {
  return async function requireSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const rawToken = request.cookies[SESSION_COOKIE_NAME];
    const session = rawToken ? sessions.validate(rawToken) : null;
    if (!session) {
      reply.code(401).send(errorBody("UNAUTHENTICATED", "Not signed in", request.id));
      return reply;
    }
    request.userId = String(session.userId);
    return undefined;
  };
}

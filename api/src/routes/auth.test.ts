import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { balances, users } from "../db/schema.js";
import { createLogger } from "../lib/logger.js";

function captureLines() {
  const lines: string[] = [];
  const destination = {
    write: (msg: string): boolean => {
      lines.push(msg);
      return true;
    },
  };
  return { lines, destination };
}

async function buildTestApp() {
  const { db } = createDb(":memory:");
  const { destination } = captureLines();
  const logger = createLogger({ destination });
  const config = loadConfig({});
  const app = await buildApp({ config, db, logger });
  return { app, db };
}

// Task 1: signs up a fresh account and returns its raw session cookie value,
// so isolation/login/logout tests can replay it via app.inject()'s `cookies`
// option without duplicating the signup boilerplate everywhere.
async function signupAndLogin(app: FastifyInstance, email: string): Promise<string> {
  const signup = await app.inject({
    method: "POST",
    url: "/api/signup",
    payload: { email, password: "password1" },
  });
  const cookie = signup.cookies.find((c) => c.name === "session");
  if (!cookie) throw new Error("signup did not set a session cookie");
  return cookie.value;
}

describe("POST /api/signup", () => {
  it("returns 201 with email and the 10,000.00000000 USDT grant", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "a@example.com", password: "password1" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      email: "a@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    });

    await app.close();
  });

  it("sets a session cookie with httpOnly, SameSite=Lax, Path=/, and a 7-day max-age", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "b@example.com", password: "password1" },
    });

    const cookie = response.cookies.find((c) => c.name === "session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(604800);

    await app.close();
  });

  it("does not set Secure outside production", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "secure-check@example.com", password: "password1" },
    });

    const cookie = response.cookies.find((c) => c.name === "session");
    expect(cookie?.secure).toBeFalsy();

    await app.close();
  });

  it("normalizes email (trim + lowercase) before storing and rejects a duplicate", async () => {
    const { app } = await buildTestApp();

    const first = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "  Dup@Example.com  ", password: "password1" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().email).toBe("dup@example.com");

    const second = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "dup@example.com", password: "password2" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("EMAIL_TAKEN");

    await app.close();
  });

  it("writes exactly one balances row per new account", async () => {
    const { app, db } = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "count@example.com", password: "password1" },
    });

    const userRows = await db.select().from(users);
    expect(userRows).toHaveLength(1);

    const balanceRows = await db.select().from(balances);
    expect(balanceRows).toHaveLength(1);
    expect(balanceRows[0]?.amount).toBe("10000.00000000");
    expect(balanceRows[0]?.asset).toBe("USDT");

    await app.close();
  });

  it("rejects a body missing password with a validation error", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "novalidation@example.com" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");

    await app.close();
  });
});

describe("GET /api/me", () => {
  it("returns the account for a replayed valid session cookie (simulated browser refresh)", async () => {
    const { app } = await buildTestApp();

    const signup = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "me@example.com", password: "password1" },
    });
    const cookie = signup.cookies.find((c) => c.name === "session");
    expect(cookie).toBeDefined();

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { session: cookie?.value ?? "" },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      email: "me@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    });

    await app.close();
  });

  it("returns 401 UNAUTHENTICATED with no cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/me" });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(typeof body.error.requestId).toBe("string");

    await app.close();
  });

  it("returns 401 UNAUTHENTICATED with a garbage cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { session: "not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");

    await app.close();
  });

  it("returns 401 UNAUTHENTICATED after the session row is deleted", async () => {
    const { app, db } = await buildTestApp();

    const signup = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "revoked@example.com", password: "password1" },
    });
    const cookie = signup.cookies.find((c) => c.name === "session");

    const { sessions } = await import("../db/schema.js");
    await db.delete(sessions);

    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { session: cookie?.value ?? "" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");

    await app.close();
  });
});

describe("POST /api/login", () => {
  it("logs in with existing credentials and returns a session cookie different from signup's", async () => {
    const { app } = await buildTestApp();
    const signup = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "login@example.com", password: "password1" },
    });
    const signupCookie = signup.cookies.find((c) => c.name === "session");
    expect(signupCookie).toBeDefined();

    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "login@example.com", password: "password1" },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({
      email: "login@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    });
    const loginCookie = login.cookies.find((c) => c.name === "session");
    expect(loginCookie).toBeDefined();
    expect(loginCookie?.value).not.toBe(signupCookie?.value);

    await app.close();
  });

  it("both the signup cookie and the login cookie work on GET /api/me — logging in does not invalidate other sessions", async () => {
    const { app } = await buildTestApp();
    const signup = await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "both@example.com", password: "password1" },
    });
    const signupCookie = signup.cookies.find((c) => c.name === "session")?.value ?? "";

    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "both@example.com", password: "password1" },
    });
    const loginCookie = login.cookies.find((c) => c.name === "session")?.value ?? "";

    const meViaSignup = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { session: signupCookie },
    });
    const meViaLogin = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { session: loginCookie },
    });
    expect(meViaSignup.statusCode).toBe(200);
    expect(meViaLogin.statusCode).toBe(200);

    await app.close();
  });

  it("returns 401 INVALID_CREDENTIALS for an email that was never registered", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "nobody@example.com", password: "password1" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(response.json().error.message).toBe("Invalid email or password");

    await app.close();
  });

  it("returns a byte-identical body (except requestId) for a wrong password as for an unknown email", async () => {
    const { app } = await buildTestApp();
    await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "wrongpw@example.com", password: "password1" },
    });

    const unknownEmail = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "nobody2@example.com", password: "password1" },
    });
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "wrongpw@example.com", password: "wrongpassword" },
    });

    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    const unknownBody = unknownEmail.json();
    const wrongBody = wrongPassword.json();
    // requestId legitimately differs per request — every other field must be
    // byte-identical, per D-26: login must not become an account-existence oracle.
    expect({ ...unknownBody.error, requestId: undefined }).toEqual({
      ...wrongBody.error,
      requestId: undefined,
    });

    await app.close();
  });

  it("matches the account case-insensitively and ignores surrounding whitespace", async () => {
    const { app } = await buildTestApp();
    await app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "case@example.com", password: "password1" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "  Case@Example.com  ", password: "password1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe("case@example.com");

    await app.close();
  });
});

describe("POST /api/logout", () => {
  it("returns 200 { ok: true } and clears the session cookie at path=/", async () => {
    const { app } = await buildTestApp();
    const token = await signupAndLogin(app, "logout@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/logout",
      cookies: { session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const cleared = response.cookies.find((c) => c.name === "session");
    expect(cleared).toBeDefined();
    expect(cleared?.path).toBe("/");

    await app.close();
  });

  it("kills the session server-side: replaying the same cookie on GET /api/me after logout returns 401", async () => {
    const { app } = await buildTestApp();
    const token = await signupAndLogin(app, "dead@example.com");

    await app.inject({ method: "POST", url: "/api/logout", cookies: { session: token } });
    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { session: token },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");

    await app.close();
  });

  it("is idempotent: a second call with the same dead cookie, and a call with no cookie, both return 200", async () => {
    const { app } = await buildTestApp();
    const token = await signupAndLogin(app, "idempotent@example.com");

    const first = await app.inject({
      method: "POST",
      url: "/api/logout",
      cookies: { session: token },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/logout",
      cookies: { session: token },
    });
    const noCookie = await app.inject({ method: "POST", url: "/api/logout" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(noCookie.statusCode).toBe(200);

    await app.close();
  });
});

describe("loadConfig cookieSecure (D-17)", () => {
  it("is true in production and false otherwise", () => {
    expect(loadConfig({ NODE_ENV: "production" }).cookieSecure).toBe(true);
    expect(loadConfig({}).cookieSecure).toBe(false);
  });
});

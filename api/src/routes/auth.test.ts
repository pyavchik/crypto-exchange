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

describe("loadConfig cookieSecure (D-17)", () => {
  it("is true in production and false otherwise", () => {
    expect(loadConfig({ NODE_ENV: "production" }).cookieSecure).toBe(true);
    expect(loadConfig({}).cookieSecure).toBe(false);
  });
});

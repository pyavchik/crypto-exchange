import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
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

// Task 1: signs up a fresh account and returns its raw session cookie value.
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

describe("GET /api/wallet", () => {
  it("returns exactly one USDT balance of 10000.00000000 for a fresh account", async () => {
    const { app } = await buildTestApp();
    const token = await signupAndLogin(app, "wallet@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/wallet",
      cookies: { session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    });

    await app.close();
  });

  it("returns 401 UNAUTHENTICATED with a requestId when there is no session cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/wallet" });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(typeof body.error.requestId).toBe("string");

    await app.close();
  });
});

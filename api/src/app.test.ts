import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp, UUID_RE } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { AppError } from "./lib/errors.js";
import { createLogger } from "./lib/logger.js";

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

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function buildTestApp() {
  const { db } = createDb(":memory:");
  const { lines, destination } = captureLines();
  const logger = createLogger({ destination });
  const config = loadConfig({});
  const app = await buildApp({ config, db, logger });

  // Test-only routes registered on the built instance before the first inject
  // (Fastify allows route registration until `ready()` is called implicitly by inject).
  app.get("/__test/boom", async () => {
    throw new Error("boom internal detail");
  });

  app.get("/__test/bad-input", async () => {
    throw new AppError(400, "BAD_INPUT", "field is required");
  });

  app.get("/__test/validation-error", async () => {
    throw new AppError(400, "VALIDATION_ERROR", "Please fix the highlighted fields", {
      email: "Enter a valid email address",
    });
  });

  return { app, lines };
}

describe("app request-id, error shape, CORS and request logging", () => {
  it("generates a UUID request id when none is supplied and logs the same id", async () => {
    const { app, lines } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/health" });
    const requestId = response.headers["x-request-id"] as string;
    expect(UUID_RE.test(requestId)).toBe(true);

    const completed = parseLines(lines).find((entry) => entry.msg === "request completed");
    expect(completed?.requestId).toBe(requestId);

    await app.close();
  });

  it("reuses a valid lowercase UUID X-Request-Id header verbatim", async () => {
    const { app, lines } = await buildTestApp();
    const id = randomUUID();

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": id },
    });
    expect(response.headers["x-request-id"]).toBe(id);

    const completed = parseLines(lines).find((entry) => entry.msg === "request completed");
    expect(completed?.requestId).toBe(id);

    await app.close();
  });

  it("reuses a valid uppercase UUID X-Request-Id header verbatim", async () => {
    const { app, lines } = await buildTestApp();
    const id = randomUUID().toUpperCase();

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": id },
    });
    expect(response.headers["x-request-id"]).toBe(id);

    const completed = parseLines(lines).find((entry) => entry.msg === "request completed");
    expect(completed?.requestId).toBe(id);

    await app.close();
  });

  it("replaces rejected X-Request-Id values with a fresh UUID and never logs the rejected text", async () => {
    const { app, lines } = await buildTestApp();

    const longString = "a".repeat(500);
    const jsonBreaking = `${randomUUID()}","level":60,"x":"`;
    const scriptTag = "<script>alert(1)</script>";
    const arrayIdA = randomUUID();
    const arrayIdB = randomUUID();
    const altHeaderUuid = randomUUID();

    const cases: Array<{
      headers: Record<string, string | string[]>;
      submittedValues: string[];
    }> = [
      { headers: { "x-request-id": "not-a-uuid" }, submittedValues: ["not-a-uuid"] },
      { headers: { "x-request-id": longString }, submittedValues: [longString] },
      { headers: { "x-request-id": jsonBreaking }, submittedValues: [jsonBreaking] },
      { headers: { "x-request-id": scriptTag }, submittedValues: [scriptTag] },
      {
        headers: { "x-request-id": [arrayIdA, arrayIdB] },
        submittedValues: [arrayIdA, arrayIdB],
      },
      { headers: { "request-id": altHeaderUuid }, submittedValues: [altHeaderUuid] },
    ];

    for (const { headers, submittedValues } of cases) {
      const response = await app.inject({ method: "GET", url: "/health", headers });
      const requestId = response.headers["x-request-id"] as string;
      expect(UUID_RE.test(requestId)).toBe(true);
      for (const submitted of submittedValues) {
        expect(requestId).not.toBe(submitted);
      }
    }

    const logText = lines.join("");
    expect(logText).not.toContain("not-a-uuid");
    expect(logText).not.toContain(longString);
    expect(logText).not.toContain(jsonBreaking);
    expect(logText).not.toContain(scriptTag);

    await app.close();
  });

  it("returns the D-09 NOT_FOUND shape for unknown routes", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    const requestId = response.headers["x-request-id"] as string;
    const body = response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.requestId).toBe(requestId);

    await app.close();
  });

  it("returns the D-09 INTERNAL_ERROR shape for unhandled errors without leaking message or stack", async () => {
    const { app, lines } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/__test/boom" });
    expect(response.statusCode).toBe(500);
    const requestId = response.headers["x-request-id"] as string;
    expect(response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId },
    });
    expect(response.body).not.toContain("boom");
    expect(response.body.toLowerCase()).not.toContain("stack");

    const parsed = parseLines(lines);
    const errorLine = parsed.find((entry) => entry.msg === "unhandled error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.level).toBe(50);
    expect(JSON.stringify(errorLine)).toContain("boom internal detail");

    await app.close();
  });

  it("returns the caller-provided status and code for a 4xx error", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/__test/bad-input" });
    expect(response.statusCode).toBe(400);
    const requestId = response.headers["x-request-id"] as string;
    expect(response.json()).toEqual({
      error: { code: "BAD_INPUT", message: "field is required", requestId },
    });

    await app.close();
  });

  it("keeps the exact three-member D-09 envelope for a plain AppError with no fields (D-27)", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/__test/bad-input" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toBeUndefined();
    expect(Object.keys(response.json().error).sort()).toEqual(["code", "message", "requestId"]);

    await app.close();
  });

  it("adds a fields member only when the thrown AppError actually carries one (D-27)", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/__test/validation-error" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(response.json().error.fields).toEqual({ email: "Enter a valid email address" });

    await app.close();
  });

  it("a 500-class error still returns the generic internal-error envelope with no leaked message, even for an AppError-shaped throw", async () => {
    const { app } = await buildTestApp();

    app.get("/__test/server-error", async () => {
      throw new AppError(500, "SHOULD_NOT_LEAK", "internal detail that must not reach the client");
    });

    const response = await app.inject({ method: "GET", url: "/__test/server-error" });
    expect(response.statusCode).toBe(500);
    const requestId = response.headers["x-request-id"] as string;
    expect(response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId },
    });
    expect(response.body).not.toContain("internal detail");

    await app.close();
  });

  it("logs exactly one request completed line per request with D-07 fields and strips query values", async () => {
    const { app, lines } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/health?token=abc123" });
    const requestId = response.headers["x-request-id"] as string;

    const parsed = parseLines(lines);
    const completedLines = parsed.filter((entry) => entry.msg === "request completed");
    expect(completedLines).toHaveLength(1);

    const [entry] = completedLines;
    expect(entry?.requestId).toBe(requestId);
    expect(entry?.method).toBe("GET");
    expect(entry?.path).toBe("/health");
    expect(entry?.status).toBe(200);
    expect(typeof entry?.durationMs).toBe("number");
    expect(entry?.durationMs as number).toBeGreaterThanOrEqual(0);
    expect(entry?.userId).toBeNull();

    const logText = lines.join("");
    expect(logText).not.toContain("abc123");

    await app.close();
  });

  it("exposes X-Request-Id via CORS for an allowed origin and omits allow-origin for a disallowed one", async () => {
    const { app } = await buildTestApp();

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const exposeHeaders = (allowed.headers["access-control-expose-headers"] as string) ?? "";
    expect(exposeHeaders.toLowerCase()).toContain("x-request-id");

    const disallowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://evil.example" },
    });
    expect(disallowed.headers["access-control-allow-origin"]).toBeUndefined();

    await app.close();
  });

  it("keeps 20 concurrent request ids distinct, each with exactly one matching log line", async () => {
    const { app, lines } = await buildTestApp();

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => app.inject({ method: "GET", url: "/health" })),
    );
    const ids = responses.map((response) => response.headers["x-request-id"] as string);
    expect(new Set(ids).size).toBe(20);

    const parsed = parseLines(lines);
    const completedLines = parsed.filter((entry) => entry.msg === "request completed");
    for (const id of ids) {
      const matching = completedLines.filter((entry) => entry.requestId === id);
      expect(matching).toHaveLength(1);
      expect(matching[0]?.path).toBe("/health");
    }

    await app.close();
  });
});

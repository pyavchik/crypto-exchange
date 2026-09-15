import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { buildRotationOptions, createLogger, ensureLogSymlink } from "./logger.js";

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

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "logger-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("createLogger redaction", () => {
  it("redacts a top-level headers['x-cg-demo-api-key'] value", () => {
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });

    logger.info({ headers: { "x-cg-demo-api-key": "k-SECRET-1" }, url: "https://example.test" });

    const text = lines.join("");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("k-SECRET-1");
    expect(text).toContain("https://example.test");
  });

  it("redacts req.headers['x-cg-demo-api-key'], authorization and cookie", () => {
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });

    logger.info({
      req: {
        headers: {
          "x-cg-demo-api-key": "k-SECRET-2",
          authorization: "Bearer top-secret",
          cookie: "session=top-secret-cookie",
        },
      },
      status: 200,
    });

    const text = lines.join("");
    expect(text).not.toContain("k-SECRET-2");
    expect(text).not.toContain("top-secret");
    expect(text).not.toContain("top-secret-cookie");
    expect(text).toContain('"status":200');
  });

  it("redacts headers.authorization and headers.cookie (not nested under req)", () => {
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });

    logger.info({
      headers: { authorization: "Bearer other-secret", cookie: "session=other-secret-cookie" },
      status: 401,
    });

    const text = lines.join("");
    expect(text).not.toContain("other-secret");
    expect(text).not.toContain("other-secret-cookie");
    expect(text).toContain('"status":401');
  });

  it("redacts a nested upstream.headers['x-cg-demo-api-key'] value", () => {
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });

    logger.info({
      upstream: { headers: { "x-cg-demo-api-key": "k-SECRET-3" }, url: "https://api.example/ping" },
    });

    const text = lines.join("");
    expect(text).not.toContain("k-SECRET-3");
    expect(text).toContain("https://api.example/ping");
  });

  it("redacts a top-level apiKey field", () => {
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });

    logger.info({ apiKey: "k-SECRET-4", url: "https://api.example/ping" });

    const text = lines.join("");
    expect(text).not.toContain("k-SECRET-4");
    expect(text).toContain("https://api.example/ping");
  });

  it("redacts config.coingeckoApiKey produced by the real loadConfig", () => {
    const { lines, destination } = captureLines();
    const logger = createLogger({ destination });
    const config = loadConfig({ COINGECKO_API_KEY: "k-SECRET-5" });

    logger.info({ config });

    const text = lines.join("");
    expect(text).not.toContain("k-SECRET-5");
    expect(text).toContain("[REDACTED]");
  });
});

describe("buildRotationOptions", () => {
  it("returns pino-roll options derived from the configured log file path", () => {
    const options = buildRotationOptions("/abs/logs/api.log");
    expect(options).toEqual({
      file: "/abs/logs/api",
      extension: ".log",
      frequency: "daily",
      size: "10m",
      dateFormat: "yyyy-MM-dd",
      limit: { count: 14 },
      mkdir: true,
      symlink: true,
    });
  });
});

describe("ensureLogSymlink", () => {
  it("creates a symlink named api.log pointing at current.log", () => {
    const dir = makeTempDir();
    const logPath = join(dir, "api.log");

    ensureLogSymlink(logPath);

    const stat = lstatSync(logPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("is idempotent when called a second time", () => {
    const dir = makeTempDir();
    const logPath = join(dir, "api.log");

    ensureLogSymlink(logPath);
    ensureLogSymlink(logPath);

    const stat = lstatSync(logPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("renames a pre-existing regular file to api.legacy.log, preserving content", () => {
    const dir = makeTempDir();
    const logPath = join(dir, "api.log");
    writeFileSync(logPath, "old log content\n");

    ensureLogSymlink(logPath);

    const legacyPath = join(dir, "api.legacy.log");
    expect(existsSync(legacyPath)).toBe(true);
    expect(readFileSync(legacyPath, "utf8")).toBe("old log content\n");

    const stat = lstatSync(logPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });
});

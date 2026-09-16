import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export interface AppConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  coingeckoApiKey: string | null;
  coingeckoBaseUrl: string;
  databasePath: string;
  logFile: string | null;
  logLevel: string;
  gitCommit: string;
  cookieSecure: boolean;
}

// api package root, resolved from this file's location (not process.cwd())
const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveAgainstApiRoot(path: string): string {
  return resolve(API_ROOT, path);
}

/**
 * Loads a .env-style file at `filePath`, if it exists, and sets any keys it
 * defines onto `env` that are NOT already present there. Explicit process
 * env values always win, so behavior stays deterministic across smoke/CI.
 */
export function loadDotEnv(filePath: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf8");
  const parsed = parseEnv(contents);
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || String(port) !== rawPort.trim()) {
    throw new Error(`Invalid PORT: expected an integer, got "${rawPort}"`);
  }

  const host = env.HOST ?? "localhost";

  const corsOrigins = (env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const trimmedKey = (env.COINGECKO_API_KEY ?? "").trim();
  const coingeckoApiKey = trimmedKey.length > 0 ? trimmedKey : null;

  const coingeckoBaseUrl = (env.COINGECKO_BASE_URL ?? "https://api.coingecko.com/api/v3").replace(
    /\/+$/,
    "",
  );

  const rawDatabasePath = env.DATABASE_PATH ?? "data/app.db";
  const databasePath =
    rawDatabasePath === ":memory:" ? rawDatabasePath : resolveAgainstApiRoot(rawDatabasePath);

  const rawLogFile = (env.LOG_FILE ?? "logs/api.log").trim();
  const logFile =
    rawLogFile.length === 0 || rawLogFile.toLowerCase() === "off"
      ? null
      : resolveAgainstApiRoot(rawLogFile);

  const logLevel = env.LOG_LEVEL ?? "info";
  const gitCommit = env.GIT_COMMIT ?? "dev";

  // D-17: the cookie's Secure attribute is scoped to production only, so
  // local http development keeps working.
  const cookieSecure = env.NODE_ENV === "production";

  return {
    port,
    host,
    corsOrigins,
    coingeckoApiKey,
    coingeckoBaseUrl,
    databasePath,
    logFile,
    logLevel,
    gitCommit,
    cookieSecure,
  };
}

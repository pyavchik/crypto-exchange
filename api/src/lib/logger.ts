import { dirname, extname } from "node:path";
import { lstatSync, mkdirSync, renameSync, symlinkSync, type Stats } from "node:fs";
import pino, { type DestinationStream } from "pino";

export interface CreateLoggerOptions {
  level?: string;
  filePath?: string | null;
  destination?: DestinationStream;
}

/**
 * D-08: paths pino redacts to [REDACTED] before any log line is serialized —
 * the CoinGecko API key (header and config field forms) plus authorization
 * and cookie headers, at both a direct and one-level-nested position. `*`
 * matches exactly one intervening key (e.g. `upstream.headers[...]`,
 * `config.coingeckoApiKey`).
 */
export const REDACT_PATHS = [
  'headers["x-cg-demo-api-key"]',
  'req.headers["x-cg-demo-api-key"]',
  '*.headers["x-cg-demo-api-key"]',
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "apiKey",
  "*.apiKey",
  "coingeckoApiKey",
  "*.coingeckoApiKey",
];

const REDACT_OPTIONS = { paths: REDACT_PATHS, censor: "[REDACTED]" };

interface RotationOptions {
  file: string;
  extension: string;
  frequency: string;
  size: string;
  dateFormat: string;
  limit: { count: number };
  mkdir: boolean;
  symlink: boolean;
}

/**
 * D-06: pino-roll options for `filePath` (e.g. `/abs/logs/api.log`). Strips
 * the `.log` extension from `file` since pino-roll appends
 * `<file>.<date>.<count><extension>` itself, and enables its own `current.log`
 * symlink (pointing at the active rotated file) via `symlink: true`.
 */
export function buildRotationOptions(filePath: string): RotationOptions {
  return {
    file: filePath.replace(/\.log$/, ""),
    extension: ".log",
    frequency: "daily",
    size: "10m",
    dateFormat: "yyyy-MM-dd",
    limit: { count: 14 },
    mkdir: true,
    symlink: true,
  };
}

/**
 * D-06: makes sure `filePath` (e.g. `api/logs/api.log`) always resolves to
 * pino-roll's `current.log` symlink, so a fixed, well-known path is always the
 * active log file regardless of rotation. Idempotent: a no-op if `filePath`
 * is already a symlink. A pre-existing regular file is preserved by renaming
 * it alongside (`api.legacy.log`) before the symlink is created.
 */
export function ensureLogSymlink(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });

  let stat: Stats | null;
  try {
    stat = lstatSync(filePath);
  } catch {
    stat = null;
  }

  if (stat?.isSymbolicLink()) {
    return;
  }

  if (stat?.isFile()) {
    const ext = extname(filePath);
    const legacyPath = `${filePath.slice(0, filePath.length - ext.length)}.legacy${ext}`;
    renameSync(filePath, legacyPath);
  }

  symlinkSync("current.log", filePath);
}

/**
 * Builds the api's pino logger. When `destination` is supplied (tests), pino
 * writes directly to it. Otherwise it writes plain JSON to stdout and, when
 * `filePath` is set, also rotates JSON lines into that file via pino-roll
 * (daily/10MB, 14 kept, `current.log` symlink) — no pretty printing anywhere.
 * The CoinGecko API key, authorization and cookie values are always redacted
 * (D-08), regardless of destination.
 */
export function createLogger(options: CreateLoggerOptions = {}): pino.Logger {
  const { level = "info", filePath = null, destination } = options;

  const baseOptions = {
    level,
    base: { service: "api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: REDACT_OPTIONS,
  };

  if (destination) {
    return pino(baseOptions, destination);
  }

  const targets: pino.TransportTargetOptions[] = [
    { target: "pino/file", options: { destination: 1 }, level },
  ];

  if (filePath) {
    ensureLogSymlink(filePath);
    targets.push({
      target: "pino-roll",
      options: buildRotationOptions(filePath),
      level,
    });
  }

  return pino(baseOptions, pino.transport({ targets }));
}

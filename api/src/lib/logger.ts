import pino, { type DestinationStream } from "pino";

export interface CreateLoggerOptions {
  level?: string;
  filePath?: string | null;
  destination?: DestinationStream;
}

/**
 * Builds the api's pino logger. When `destination` is supplied (tests), pino
 * writes directly to it. Otherwise it writes plain JSON to stdout and,
 * when `filePath` is set, also appends JSON lines to that file — no pretty
 * printing anywhere. Rotation (pino-roll) and redaction rules are added by a
 * later plan without changing this function's signature.
 */
export function createLogger(options: CreateLoggerOptions = {}): pino.Logger {
  const { level = "info", filePath = null, destination } = options;

  const baseOptions = {
    level,
    base: { service: "api" },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (destination) {
    return pino(baseOptions, destination);
  }

  const targets: pino.TransportTargetOptions[] = [
    { target: "pino/file", options: { destination: 1 }, level },
  ];

  if (filePath) {
    targets.push({
      target: "pino/file",
      options: { destination: filePath, mkdir: true, append: true },
      level,
    });
  }

  return pino(baseOptions, pino.transport({ targets }));
}

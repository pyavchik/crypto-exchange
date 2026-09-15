import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig, loadDotEnv } from "./config.js";
import { createDb } from "./db/client.js";
import { createLogger } from "./lib/logger.js";

const ENV_FILE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

loadDotEnv(ENV_FILE_PATH);
const config = loadConfig(process.env);

const logger = createLogger({ level: config.logLevel, filePath: config.logFile });
const { db, close } = createDb(config.databasePath);

const app = await buildApp({ config, db, logger });

app.addHook("onClose", async () => {
  close();
});

let shuttingDown = false;

function registerShutdownHandler(signal: "SIGINT" | "SIGTERM"): void {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "shutting down");

    // Fallback in case app.close() hangs (e.g. a stuck connection) — unref()
    // so this timer alone never keeps the process alive.
    const forceExitTimer = setTimeout(() => {
      logger.error({ signal }, "forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    app
      .close()
      .then(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(forceExitTimer);
        logger.error({ err: error, signal }, "error during shutdown");
        process.exit(1);
      });
  });
}

registerShutdownHandler("SIGINT");
registerShutdownHandler("SIGTERM");

await app.listen({ port: config.port, host: config.host });

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

await app.listen({ port: config.port, host: config.host });

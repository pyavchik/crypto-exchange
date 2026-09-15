#!/usr/bin/env node
// End-to-end smoke test for `npm run dev`: starts a local CoinGecko stub,
// picks two free ports, spawns the real dev command, and exercises the full
// web -> api -> SQLite -> upstream -> logs path. POSIX only (fine for macOS
// dev and Linux CI). Never uses fixed ports so multiple runs (or a developer's
// own `npm run dev`) never collide.

import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIXED_REQUEST_ID = "3f0c8a6e-2b1d-4c9e-9a7f-5d4e3c2b1a09";

function fail(reason) {
  // Throws rather than exiting directly so the caller's finally block still
  // runs (killing the dev process group and closing the stub server).
  throw new Error(reason);
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((err) => {
        if (err) return rejectPort(err);
        if (port === null) return rejectPort(new Error("could not determine free port"));
        resolvePort(port);
      });
    });
    server.on("error", rejectPort);
  });
}

function startStub() {
  const state = { hits: 0, lastKeyHeader: null };
  const server = createHttpServer((req, res) => {
    if (req.method === "GET" && req.url === "/ping") {
      state.hits += 1;
      state.lastKeyHeader = req.headers["x-cg-demo-api-key"] ?? null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ gecko_says: "(V3) To the Moon!" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolveStub) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      resolveStub({ server, port, state });
    });
  });
}

async function pollUntilOk(url, options, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(`${url} responded with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw lastError ?? new Error(`Timed out polling ${url}`);
}

async function pollForLogLine(logFilePath, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const contents = readFileSync(logFilePath, "utf8");
      const lines = contents
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (predicate(parsed)) return { parsed, contents };
      }
    } catch {
      // log file may not exist yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "crypto-exchange-smoke-"));
  const stub = await startStub();
  const apiPackageVersion = JSON.parse(
    readFileSync(join(REPO_ROOT, "api", "package.json"), "utf8"),
  ).version;

  const apiPort = await getFreePort();
  const webPort = await getFreePort();

  const databasePath = join(tempDir, "smoke.db");
  const logFilePath = join(tempDir, "smoke.log");

  const devEnv = {
    ...process.env,
    PORT: String(apiPort),
    HOST: "localhost",
    VITE_PORT: String(webPort),
    VITE_API_URL: `http://localhost:${apiPort}`,
    CORS_ORIGIN: `http://localhost:${webPort}`,
    COINGECKO_API_KEY: "smoke-test-key",
    COINGECKO_BASE_URL: `http://127.0.0.1:${stub.port}`,
    DATABASE_PATH: databasePath,
    LOG_FILE: logFilePath,
    GIT_COMMIT: "smoke",
  };

  const devProcess = spawn("npm", ["run", "dev"], {
    cwd: REPO_ROOT,
    env: devEnv,
    detached: true,
    stdio: "ignore",
  });

  let exitCode = 0;

  try {
    await pollUntilOk(`http://localhost:${apiPort}/health`, {}, 30_000);
    await pollUntilOk(`http://localhost:${webPort}/`, {}, 30_000);

    // (a) web root
    const webResponse = await fetch(`http://localhost:${webPort}/`);
    if (webResponse.status !== 200) fail(`web root returned status ${webResponse.status}`);
    const webBody = await webResponse.text();
    if (!webBody.includes('id="root"')) fail('web root response did not contain id="root"');

    // (b) GET /health with Origin header
    const origin = `http://localhost:${webPort}`;
    const healthResponse = await fetch(`http://localhost:${apiPort}/health`, {
      headers: { Origin: origin },
    });
    if (healthResponse.status !== 200) fail(`/health returned status ${healthResponse.status}`);
    const healthBody = await healthResponse.json();
    if (healthBody.status !== "ok") fail(`/health status field was "${healthBody.status}"`);
    if (healthBody.version !== apiPackageVersion) {
      fail(
        `/health version "${healthBody.version}" !== api/package.json version "${apiPackageVersion}"`,
      );
    }
    if (healthBody.commit !== "smoke")
      fail(`/health commit was "${healthBody.commit}", expected "smoke"`);
    if (healthBody.upstream?.coingecko?.status !== "ok") {
      fail(`/health upstream.coingecko.status was "${healthBody.upstream?.coingecko?.status}"`);
    }
    const requestIdHeader = healthResponse.headers.get("x-request-id");
    if (!requestIdHeader || !UUID_RE.test(requestIdHeader)) {
      fail(`/health x-request-id header "${requestIdHeader}" is not a UUID`);
    }
    const allowOrigin = healthResponse.headers.get("access-control-allow-origin");
    if (allowOrigin !== origin) {
      fail(`access-control-allow-origin was "${allowOrigin}", expected "${origin}"`);
    }
    const exposeHeaders = (
      healthResponse.headers.get("access-control-expose-headers") ?? ""
    ).toLowerCase();
    if (!exposeHeaders.includes("x-request-id")) {
      fail(`access-control-expose-headers "${exposeHeaders}" does not include x-request-id`);
    }

    // (c) echoing an explicit X-Request-Id
    const echoResponse = await fetch(`http://localhost:${apiPort}/health`, {
      headers: { "X-Request-Id": FIXED_REQUEST_ID },
    });
    const echoedId = echoResponse.headers.get("x-request-id");
    if (echoedId !== FIXED_REQUEST_ID) {
      fail(`explicit X-Request-Id was not echoed exactly (got "${echoedId}")`);
    }

    // (d) second /health does not re-hit the stub, key header still recorded
    await fetch(`http://localhost:${apiPort}/health`);
    if (stub.state.hits !== 1) fail(`stub was hit ${stub.state.hits} times, expected exactly 1`);
    if (stub.state.lastKeyHeader !== "smoke-test-key") {
      fail(`stub recorded key header "${stub.state.lastKeyHeader}", expected "smoke-test-key"`);
    }

    // (e) log correlation
    const requestLine = await pollForLogLine(
      logFilePath,
      (entry) =>
        entry.requestId === requestIdHeader &&
        entry.method === "GET" &&
        entry.path === "/health" &&
        entry.status === 200 &&
        typeof entry.durationMs === "number",
      5_000,
    );
    if (!requestLine) fail('no matching "request completed" log line found within 5s');

    const upstreamLine = await pollForLogLine(
      logFilePath,
      (entry) =>
        entry.msg === "upstream call" &&
        typeof entry.url === "string" &&
        entry.url.endsWith("/ping"),
      5_000,
    );
    if (!upstreamLine) fail('no matching "upstream call" log line found within 5s');

    // (f) key never appears in the log file
    if (upstreamLine.contents.includes("smoke-test-key")) {
      fail("log file contains the configured CoinGecko API key");
    }

    // (g) exactly one row in upstream_checks
    const db = new Database(databasePath, { readonly: true });
    const row = db.prepare("select count(*) as n from upstream_checks").get();
    db.close();
    if (row.n !== 1) fail(`upstream_checks has ${row.n} rows, expected exactly 1`);

    console.log("SMOKE OK");
  } catch (error) {
    exitCode = 1;
    console.error(`SMOKE FAIL: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (devProcess.pid) {
      try {
        process.kill(-devProcess.pid, "SIGTERM");
      } catch {
        // process group may already be gone
      }
    }
    stub.server.close();
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`SMOKE FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

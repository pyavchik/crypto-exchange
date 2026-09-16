#!/usr/bin/env node
// End-to-end smoke test for `npm run dev`: starts a local CoinGecko stub,
// picks two free ports, spawns the real dev command, and exercises the full
// web -> api -> SQLite -> upstream -> logs path. POSIX only (fine for macOS
// dev and Linux CI). Never uses fixed ports so multiple runs (or a developer's
// own `npm run dev`) never collide.
//
// It also drives the developer's installed Google Chrome through
// playwright-core (a library, no bundled browser download) to prove the
// footer health badge actually renders correctly in a real browser — the
// class of bug that pure-Node fetch checks and Vitest's fake DOM cannot
// catch (see BUG-001). The browser step needs Google Chrome installed, and
// adds about 60s to the total run because it waits in real time for the
// health poller's actual 60s poll interval to fire while the tab is visible.

import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";

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

// D-36 self-pair exclusion proof needs the quote asset itself in the fixture;
// the sub-cent and null-24h-change entries exercise Pitfall 3 and the
// null-preserving formatting path against real rendered DOM, not a unit
// fixture. 25 entries mirrors UPSTREAM_PAGE_SIZE so the curated-20 slice
// after excluding the quote asset is exercised end to end.
const MARKETS_QUOTE_ASSET_ID = "tether";
const MARKETS_SUB_CENT_ID = "microcoin";

function buildMarketsFixture() {
  const entries = [
    {
      id: "bitcoin",
      symbol: "btc",
      name: "Bitcoin",
      current_price: 75755,
      market_cap: 1521766040123,
      total_volume: 39122950768,
      price_change_percentage_24h: -1.53973,
    },
    {
      id: "ethereum",
      symbol: "eth",
      name: "Ethereum",
      current_price: 2400.26,
      market_cap: 292987353189,
      total_volume: 12345678,
      price_change_percentage_24h: 2.1,
    },
    {
      id: MARKETS_QUOTE_ASSET_ID,
      symbol: "usdt",
      name: "Tether",
      current_price: 1.0,
      market_cap: 120000000000,
      total_volume: 50000000000,
      price_change_percentage_24h: 0.01,
    },
    {
      id: MARKETS_SUB_CENT_ID,
      symbol: "micr",
      name: "Micro Coin",
      current_price: 0.00001234,
      market_cap: 1000000,
      total_volume: 20000,
      price_change_percentage_24h: null,
    },
  ];
  for (let i = entries.length; i < 25; i += 1) {
    entries.push({
      id: `smoke-coin-${i}`,
      symbol: `sc${i}`,
      name: `Smoke Coin ${i}`,
      current_price: 10 + i,
      market_cap: 1_000_000 * (i + 1),
      total_volume: 500_000 * (i + 1),
      price_change_percentage_24h: i % 2 === 0 ? 1.5 : -1.5,
    });
  }
  return entries;
}

function startStub() {
  const state = {
    hits: 0,
    lastKeyHeader: null,
    marketsHits: 0,
    lastMarketsKeyHeader: null,
    lastMarketsQuery: null,
  };
  const server = createHttpServer((req, res) => {
    const [path, query] = (req.url ?? "").split("?");
    if (req.method === "GET" && path === "/ping") {
      state.hits += 1;
      state.lastKeyHeader = req.headers["x-cg-demo-api-key"] ?? null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ gecko_says: "(V3) To the Moon!" }));
      return;
    }
    if (req.method === "GET" && path === "/coins/markets") {
      state.marketsHits += 1;
      state.lastMarketsKeyHeader = req.headers["x-cg-demo-api-key"] ?? null;
      state.lastMarketsQuery = query ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildMarketsFixture()));
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

// Polls the health-badge textContent every 200ms until predicate(text) is
// true, then returns that text. Uses textContent() rather than a text
// locator because the badge nests spans (e.g. "API ok" + "CoinGecko: ok"),
// and a substring text locator can match several elements at once.
async function waitForBadge(page, predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = (await page.getByTestId("health-badge").textContent()) ?? "";
    if (predicate(lastText)) return lastText;
    await new Promise((r) => setTimeout(r, 200));
  }
  fail(
    `browser: badge did not show ${description} within ${timeoutMs}ms (last text: "${lastText}")`,
  );
  return lastText; // unreachable — fail() always throws; keeps type flow simple
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
  // Declared before the try so the finally block can close it even if a
  // check before browser setup fails.
  let browser = null;

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

    // (h0) favicon served with the right content-type (G-01-4)
    const faviconResponse = await fetch(`http://localhost:${webPort}/favicon.svg`);
    if (faviconResponse.status !== 200) {
      fail(`favicon.svg returned status ${faviconResponse.status}`);
    }
    const faviconContentType = faviconResponse.headers.get("content-type") ?? "";
    if (!faviconContentType.includes("svg")) {
      fail(`favicon.svg content-type "${faviconContentType}" does not contain "svg"`);
    }

    // (h) launch installed Google Chrome via playwright-core and load the app.
    // headless:true with no user-data directory gives a fresh temporary
    // profile every run — the developer's real Chrome profile, cookies and
    // extensions are never touched, and only the localhost ports this script
    // picked are ever navigated to.
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch (error) {
      fail(
        `browser: launch failed — the browser step needs Google Chrome installed (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
    console.log(`browser: Chrome ${browser.version()}`);

    const pageErrors = [];
    const consoleErrors = [];
    const healthRequestTimes = [];
    // Flipped true once the (j) simulated outage begins. Chrome logs the
    // route.abort()'d /health request as a console error, which is expected
    // from that point on — page errors are still recorded for the whole run.
    let outageStarted = false;

    const page = await browser.newPage();
    // Records every outgoing request the page makes, for the whole run, so
    // the success-criterion-3 proof below (no request leaves localhost, none
    // carries the Demo key) sees the entire journey, not just the markets
    // section. Registered before the first page.goto so no request escapes.
    const allRequests = [];
    page.on("request", (request) => {
      allRequests.push(request);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (outageStarted) return;
      // D-29: AuthProvider bootstraps auth state with GET /api/me on every
      // page load; for an anonymous visitor that response is a normal 401,
      // which Chrome still logs as a "Failed to load resource" console
      // error regardless of how the app's own fetch handler treats it (this
      // is unavoidable from application code — the browser's network layer
      // emits it before any JS runs). Filtered by the failing resource's own
      // URL, not by message text, so an unrelated 401 elsewhere still fails
      // the run.
      const location = message.location();
      if (location?.url && new URL(location.url).pathname === "/api/me") return;
      consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/health") {
        healthRequestTimes.push(Date.now());
      }
    });

    await page.goto(`http://localhost:${webPort}/`);

    await waitForBadge(
      page,
      (text) => text.includes("API ok") && text.includes("CoinGecko: ok"),
      30_000,
      '"API ok" and "CoinGecko: ok"',
    );
    const badgeOkAt = Date.now();

    await new Promise((r) => setTimeout(r, 2_000));
    const stableText = (await page.getByTestId("health-badge").textContent()) ?? "";
    if (!stableText.includes("API ok") || stableText.includes("API unreachable")) {
      fail(`browser: badge text unstable 2s after ok: "${stableText}"`);
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      fail(
        `browser: page/console errors detected — pageErrors: ${JSON.stringify(
          pageErrors,
        )}, consoleErrors: ${JSON.stringify(consoleErrors)}`,
      );
    }

    // (i) periodic poll while visible (D-02, G-01-2). This waits real time on
    // purpose: a faked page clock replaces the page's native timer functions
    // with plain JavaScript functions that ignore the receiver, which would
    // hide exactly this class of bug (the BUG-001 "Illegal invocation").
    const countBeforePoll = healthRequestTimes.length;
    await page.waitForRequest((request) => new URL(request.url()).pathname === "/health", {
      timeout: 75_000,
    });
    const pollElapsed = Date.now() - badgeOkAt;
    if (pollElapsed < 50_000 || pollElapsed > 70_000) {
      fail(`browser: periodic /health poll fired after ${pollElapsed}ms, expected 50000-70000ms`);
    }
    if (healthRequestTimes.length !== countBeforePoll + 1) {
      fail(
        `browser: expected exactly 1 /health request during the poll window, saw ${
          healthRequestTimes.length - countBeforePoll
        }`,
      );
    }
    await waitForBadge(
      page,
      (text) => text.includes("API ok"),
      10_000,
      '"API ok" after the periodic poll',
    );

    // (j) outage and recovery through Re-check (G-01-3)
    const apiHealthUrl = `http://localhost:${apiPort}/health`;
    const countBeforeOutage = healthRequestTimes.length;
    outageStarted = true;
    await page.route(apiHealthUrl, (route) => route.abort("connectionrefused"));
    await page.getByRole("button", { name: "Re-check API health" }).click();
    await waitForBadge(
      page,
      (text) => text.includes("API unreachable"),
      10_000,
      '"API unreachable" during the simulated outage',
    );
    await new Promise((r) => setTimeout(r, 1_000));
    if (healthRequestTimes.length !== countBeforeOutage + 1) {
      fail(
        `browser: expected exactly 1 /health request for the outage Re-check, saw ${
          healthRequestTimes.length - countBeforeOutage
        }`,
      );
    }

    await page.unroute(apiHealthUrl);
    await page.getByRole("button", { name: "Re-check API health" }).click();
    await waitForBadge(
      page,
      (text) => text.includes("API ok") && text.includes("CoinGecko: ok"),
      10_000,
      '"API ok" and "CoinGecko: ok" after recovery',
    );
    await new Promise((r) => setTimeout(r, 1_000));
    if (healthRequestTimes.length !== countBeforeOutage + 2) {
      fail(
        `browser: expected exactly 1 /health request for the recovery Re-check, saw ${
          healthRequestTimes.length - (countBeforeOutage + 1)
        }`,
      );
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      fail(
        `browser: page/console errors detected after outage/recovery — pageErrors: ${JSON.stringify(
          pageErrors,
        )}, consoleErrors (pre-outage only): ${JSON.stringify(consoleErrors)}`,
      );
    }

    // (k) real-browser sign-up: signup -> funded wallet -> reload -> still
    // signed in (D-34, AUTH-01/AUTH-02/AUTH-05). Set the outage flag back to
    // false first so console-error capture is active again for these steps —
    // the pre-outage error assertion above stays where it is.
    outageStarted = false;

    const smokeEmail = `smoke-${Date.now()}@example.com`;
    const smokePassword = "smoke-test-password1";

    await page.goto(`http://localhost:${webPort}/signup`);
    await page.locator('input[name="email"]').fill(smokeEmail);
    await page.locator('input[name="password"]').fill(smokePassword);
    await page.getByRole("button", { name: "Sign up" }).click();

    // The nav showing the signed-up email is the signal the cookie was
    // accepted, the credentialed cross-origin call succeeded, and the auth
    // state bootstrapped. Reuses waitForBadge's poll-every-200ms pattern
    // against the nav-account test id.
    async function waitForNavAccount(predicate, timeoutMs, description) {
      const deadline = Date.now() + timeoutMs;
      let lastText = "";
      while (Date.now() < deadline) {
        lastText =
          (await page
            .getByTestId("nav-account")
            .textContent()
            .catch(() => "")) ?? "";
        if (predicate(lastText)) return lastText;
        await new Promise((r) => setTimeout(r, 200));
      }
      fail(
        `browser: nav-account did not show ${description} within ${timeoutMs}ms (last text: "${lastText}")`,
      );
      return lastText; // unreachable — fail() always throws
    }

    await waitForNavAccount((text) => text.includes(smokeEmail), 15_000, `"${smokeEmail}"`);

    const walletBodyText = (await page.locator("body").textContent()) ?? "";
    if (!walletBodyText.includes("10000.00000000") || !walletBodyText.includes("USDT")) {
      fail(
        `browser: wallet did not show the 10000.00000000 USDT grant (body: "${walletBodyText}")`,
      );
    }

    // (k1) reload: the AUTH-02 refresh-persistence proof — the only check in
    // the project that exercises the cookie across a real browser navigation.
    await page.reload();
    await waitForNavAccount(
      (text) => text.includes(smokeEmail),
      15_000,
      `"${smokeEmail}" after reload`,
    );
    const afterReloadBodyText = (await page.locator("body").textContent()) ?? "";
    if (!afterReloadBodyText.includes("10000.00000000") || !afterReloadBodyText.includes("USDT")) {
      fail(
        `browser: wallet did not still show the 10000.00000000 USDT grant after reload (body: "${afterReloadBodyText}")`,
      );
    }

    // (k2) the httpOnly attribute means the session token must be invisible
    // to JavaScript. This callback runs inside the browser page context, not
    // this Node script, so `document` is a legitimate browser global here.
    // eslint-disable-next-line no-undef
    const documentCookie = await page.evaluate(() => document.cookie);
    if (documentCookie.includes("session")) {
      fail(`browser: document.cookie exposed a "session" entry: "${documentCookie}"`);
    }

    // (k3) AUTH-05's exactly-once guarantee, measured against the real
    // stack (not a :memory: test database) — same read-only re-open pattern
    // as the (g) upstream_checks assertion above.
    const authDb = new Database(databasePath, { readonly: true });
    const userRow = authDb.prepare("select count(*) as n from users").get();
    const balanceRow = authDb
      .prepare("select count(*) as n, amount from balances where amount = ?")
      .get("10000.00000000");
    authDb.close();
    if (userRow.n !== 1) fail(`users table has ${userRow.n} rows, expected exactly 1`);
    if (balanceRow.n !== 1) {
      fail(
        `balances table has ${balanceRow.n} rows with amount 10000.00000000, expected exactly 1`,
      );
    }

    // (k4) re-run the page-error and console-error assertion after the auth
    // steps, so a React error during signup fails the run.
    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      fail(
        `browser: page/console errors detected during the auth signup steps — pageErrors: ${JSON.stringify(
          pageErrors,
        )}, consoleErrors: ${JSON.stringify(consoleErrors)}`,
      );
    }

    // (l) log out through the nav control present on every page (D-30,
    // T-02-21), and wait for the nav to show the signed-out state. This
    // confirms the session was actually revoked server-side: performLogout
    // awaits the POST /api/logout revoke request before the context flips to
    // "anonymous", and the nav only renders "Log in"/"Sign up" once that
    // state lands.
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("link", { name: "Log in" }).waitFor({ state: "visible", timeout: 10_000 });

    // (m) the guarded route must not render wallet contents after logout —
    // assert on both the resulting URL and the page content, so a guard that
    // renders the login markup at the wrong URL (or the wallet markup at the
    // right one) still fails (T-02-21). A full page.goto (rather than a
    // client-side NavLink click) proves the guard from a cold mount and
    // sidesteps a race with handleLogout's own pending navigate("/login")
    // call, which is a separate async step from the state flip above and can
    // otherwise still be in flight when the next navigation starts.
    await page.goto(`http://localhost:${webPort}/wallet`);
    await page
      .getByRole("heading", { name: "Log in" })
      .waitFor({ state: "visible", timeout: 15_000 });
    const guardedRoutePathname = new URL(page.url()).pathname;
    if (guardedRoutePathname !== "/login") {
      fail(
        `browser: visiting /wallet after logout landed on "${guardedRoutePathname}", expected /login`,
      );
    }
    const loggedOutWalletBody = (await page.locator("body").textContent()) ?? "";
    if (loggedOutWalletBody.includes("10000.00000000")) {
      fail(
        "browser: /wallet rendered balance content after logout — the guarded route leaked wallet data",
      );
    }

    // (n) log back in through /login with the same credentials used at
    // signup (AUTH-02) — the nav shows the email again and the wallet shows
    // the grant again.
    await page.locator('input[name="email"]').fill(smokeEmail);
    await page.locator('input[name="password"]').fill(smokePassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await waitForNavAccount(
      (text) => text.includes(smokeEmail),
      15_000,
      `"${smokeEmail}" after logging back in`,
    );
    const afterLoginBodyText = (await page.locator("body").textContent()) ?? "";
    if (!afterLoginBodyText.includes("10000.00000000") || !afterLoginBodyText.includes("USDT")) {
      fail(
        `browser: wallet did not show the 10000.00000000 USDT grant after logging back in (body: "${afterLoginBodyText}")`,
      );
    }

    // (o) the session value must remain unreadable from page JavaScript at
    // every point after a real login, not just after signup (T-02-22). This
    // callback runs inside the browser page context, not this Node script.
    // eslint-disable-next-line no-undef
    const documentCookieAfterLogin = await page.evaluate(() => document.cookie);
    if (documentCookieAfterLogin.includes("session")) {
      fail(
        `browser: document.cookie exposed a "session" entry after logging back in: "${documentCookieAfterLogin}"`,
      );
    }

    // (p) AUTH-05's exactly-once guarantee must still hold after a full
    // logout/login round trip — signing in and out repeatedly must never
    // re-credit an account.
    const finalAuthDb = new Database(databasePath, { readonly: true });
    const finalUserRow = finalAuthDb.prepare("select count(*) as n from users").get();
    const finalBalanceRow = finalAuthDb
      .prepare("select count(*) as n, amount from balances where amount = ?")
      .get("10000.00000000");
    finalAuthDb.close();
    if (finalUserRow.n !== 1) {
      fail(`users table has ${finalUserRow.n} rows after logout/login, expected exactly 1`);
    }
    if (finalBalanceRow.n !== 1) {
      fail(
        `balances table has ${finalBalanceRow.n} rows with amount 10000.00000000 after logout/login, expected exactly 1`,
      );
    }

    // (q) final page-error and console-error assertion, naming this section
    // so a React error during logout or login fails the run rather than
    // passing silently.
    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      fail(
        `browser: page/console errors detected during the logout/login journey — pageErrors: ${JSON.stringify(
          pageErrors,
        )}, consoleErrors: ${JSON.stringify(consoleErrors)}`,
      );
    }

    // (r) Markets: real-browser proof the curated table renders, D-36's
    // self-pair exclusion and sub-cent legibility hold in the actual DOM,
    // the second load is served from the server-side 45s cache (DATA-02),
    // and — the reason this section exists — the Demo key never leaves the
    // server (success criterion 3, DATA-01).
    async function waitForMarketsRowCount(predicate, timeoutMs, description) {
      const deadline = Date.now() + timeoutMs;
      let lastCount = 0;
      while (Date.now() < deadline) {
        lastCount = await page.getByTestId("markets-row").count();
        if (predicate(lastCount)) return lastCount;
        await new Promise((r) => setTimeout(r, 200));
      }
      fail(
        `browser: markets-row count did not reach ${description} within ${timeoutMs}ms (last count: ${lastCount})`,
      );
      return lastCount; // unreachable — fail() always throws
    }

    // The app's index route redirects "/" -> "/markets" (client-side
    // Navigate), and earlier sections above already visited "/" — so a
    // markets fetch may already have happened once, possibly outside this
    // section's own 45s TTL window (the ~50-70s real-time health-poll wait
    // in section (i) alone exceeds it). Compare against a baseline captured
    // right before this section's own navigation, rather than an absolute
    // count, so this section's assertions are about ITS OWN dedup and cache
    // behavior, not about how many markets fetches happened earlier.
    const marketsHitsBeforeSection = stub.state.marketsHits;

    await page.goto(`http://localhost:${webPort}/markets`);
    await waitForMarketsRowCount((count) => count === 20, 15_000, "20 (curated limit)");

    const marketsTableCount = await page.getByTestId("markets-table").count();
    if (marketsTableCount !== 1) {
      fail(`browser: expected exactly one markets-table element, found ${marketsTableCount}`);
    }

    const rowCoinIds = await page
      .getByTestId("markets-row")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-coin-id")));
    if (rowCoinIds.includes(MARKETS_QUOTE_ASSET_ID)) {
      fail(
        `browser: markets table rendered the stablecoin self-pair row (coin id "${MARKETS_QUOTE_ASSET_ID}") — D-36 exclusion failed`,
      );
    }

    const marketsBodyText = (await page.locator("body").textContent()) ?? "";
    if (!marketsBodyText.includes("BTC/USDT")) {
      fail(`browser: markets table missing the BTC/USDT pair label (body: "${marketsBodyText}")`);
    }
    if (!marketsBodyText.includes("$75,755.00")) {
      fail(`browser: markets table missing the formatted BTC price (body: "${marketsBodyText}")`);
    }
    if (!marketsBodyText.includes("USDT as")) {
      fail(`browser: quote-convention note missing from the page (body: "${marketsBodyText}")`);
    }

    // Pitfall 3 regression, checked against the real rendered DOM: a
    // sub-cent price must not collapse to a run of zeros.
    const subCentRowText =
      (await page
        .locator(`[data-testid="markets-row"][data-coin-id="${MARKETS_SUB_CENT_ID}"]`)
        .textContent()
        .catch(() => "")) ?? "";
    if (!subCentRowText) {
      fail(`browser: sub-cent fixture row (coin id "${MARKETS_SUB_CENT_ID}") did not render`);
    }
    if (!/1234/.test(subCentRowText)) {
      fail(
        `browser: sub-cent price did not preserve significant digits (row text: "${subCentRowText}")`,
      );
    }
    if (/\$0\.00(00)?(\s|$)/.test(subCentRowText)) {
      fail(`browser: sub-cent price rendered as a run of zeros (row text: "${subCentRowText}")`);
    }

    const marketsHitsAfterFirstLoad = stub.state.marketsHits;
    if (marketsHitsAfterFirstLoad !== marketsHitsBeforeSection + 1) {
      fail(
        `this navigation caused ${marketsHitsAfterFirstLoad - marketsHitsBeforeSection} markets upstream hits, expected exactly 1 (dedup across the browser's double-effect load)`,
      );
    }
    if (stub.state.lastMarketsKeyHeader !== "smoke-test-key") {
      fail(
        `stub recorded markets key header "${stub.state.lastMarketsKeyHeader}", expected "smoke-test-key"`,
      );
    }
    const marketsQuery = stub.state.lastMarketsQuery ?? "";
    if (!marketsQuery.includes("vs_currency=usd")) {
      fail(`stub recorded markets query "${marketsQuery}" missing vs_currency=usd`);
    }
    if (!marketsQuery.includes("price_change_percentage=24h")) {
      fail(`stub recorded markets query "${marketsQuery}" missing price_change_percentage=24h`);
    }

    // Second load: DATA-02's whole point measured against the real stack —
    // the server-side 45s cache means the stub is not hit again.
    await page.reload();
    await waitForMarketsRowCount((count) => count === 20, 15_000, "20 after reload");
    if (stub.state.marketsHits !== marketsHitsAfterFirstLoad) {
      fail(
        `stub markets endpoint was hit again after reload (before: ${marketsHitsAfterFirstLoad}, after: ${stub.state.marketsHits}), expected the server-side 45s cache to serve the second load with no new upstream hit`,
      );
    }

    // Success-criterion-3 proof: iterate every request recorded since page
    // creation and fail on any that leaves localhost/127.0.0.1 or carries
    // the Demo key in a URL, header, or post body. The hostname rule is what
    // makes this a guarantee rather than a spot check — the markets payload
    // carries no external URL of any kind (no image field is mapped), so a
    // request to any other host means something in the app reached outside.
    const REDACTED = "[REDACTED]";
    function redact(text) {
      return text.split(devEnv.COINGECKO_API_KEY).join(REDACTED);
    }
    for (const request of allRequests) {
      let requestUrl;
      try {
        requestUrl = new URL(request.url());
      } catch {
        continue;
      }
      if (requestUrl.hostname !== "localhost" && requestUrl.hostname !== "127.0.0.1") {
        fail(`browser: a request left localhost/127.0.0.1 — ${redact(requestUrl.href)}`);
      }
      if (request.url().includes(devEnv.COINGECKO_API_KEY)) {
        fail(`browser: a request URL carried the Demo key — ${redact(requestUrl.href)}`);
      }
      const headers = await request.allHeaders();
      for (const [headerName, headerValue] of Object.entries(headers)) {
        if (typeof headerValue === "string" && headerValue.includes(devEnv.COINGECKO_API_KEY)) {
          fail(
            `browser: request header "${headerName}" carried the Demo key on ${redact(requestUrl.href)}`,
          );
        }
      }
      const postData = request.postData();
      if (postData && postData.includes(devEnv.COINGECKO_API_KEY)) {
        fail(`browser: request post data carried the Demo key on ${redact(requestUrl.href)}`);
      }
    }

    // Extends the existing log-file key-absence proof (e/f above) to the
    // markets upstream call specifically.
    const marketsUpstreamLine = await pollForLogLine(
      logFilePath,
      (entry) =>
        entry.msg === "upstream call" &&
        typeof entry.url === "string" &&
        entry.url.includes("/coins/markets"),
      5_000,
    );
    if (!marketsUpstreamLine) {
      fail('no matching markets "upstream call" log line found within 5s');
    }
    if (marketsUpstreamLine.contents.includes(devEnv.COINGECKO_API_KEY)) {
      fail("log file contains the configured CoinGecko API key (markets upstream call)");
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      fail(
        `browser: page/console errors detected during the markets section — pageErrors: ${JSON.stringify(
          pageErrors,
        )}, consoleErrors: ${JSON.stringify(consoleErrors)}`,
      );
    }

    console.log("SMOKE OK");
  } catch (error) {
    exitCode = 1;
    console.error(`SMOKE FAIL: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // already closed, or never fully launched
      }
    }
    if (devProcess.pid) {
      try {
        process.kill(-devProcess.pid, "SIGTERM");
      } catch {
        // process group may already be gone
      }
    }
    stub.server.close();
    // WR-02: tempDir's smoke.db now holds a real scrypt password hash and
    // session token hash after every run (Phase 2's signup/login sections),
    // not just placeholder rows — remove it on every exit path, success or
    // failure. Swallow errors so a cleanup failure (e.g. a file locked by a
    // process that didn't fully exit) never masks the actual smoke result.
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`SMOKE FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

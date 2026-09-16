import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { balances, sessions, users } from "../db/schema.js";
import { createLogger } from "./logger.js";
import { createAccountService } from "./accounts.js";
import { createSessionService } from "./session.js";

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

describe("createAccountService", () => {
  it("creates a user row and a 10,000.00000000 USDT balance row for a single signup (D-25)", () => {
    const { db } = createDb(":memory:");
    const accounts = createAccountService({ db });

    const user = accounts.createWithGrant({ email: "single@example.com", passwordHash: "hash" });

    const userRows = db.select().from(users).all();
    expect(userRows).toHaveLength(1);
    expect(userRows[0]?.id).toBe(user.id);

    const balanceRows = db.select().from(balances).where(eq(balances.userId, user.id)).all();
    expect(balanceRows).toHaveLength(1);
    expect(balanceRows[0]?.asset).toBe("USDT");
    expect(balanceRows[0]?.amount).toBe("10000.00000000");
  });

  it("throws on a duplicate email and leaves exactly one user row and one balance row (AUTH-05)", () => {
    const { db } = createDb(":memory:");
    const accounts = createAccountService({ db });

    accounts.createWithGrant({ email: "dup@example.com", passwordHash: "hash1" });
    expect(() =>
      accounts.createWithGrant({ email: "dup@example.com", passwordHash: "hash2" }),
    ).toThrow();

    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(balances).all()).toHaveLength(1);
  });

  it("deleting a user row cascades to that user's sessions and balances (PRAGMA foreign_keys proof)", () => {
    const { db } = createDb(":memory:");
    const accounts = createAccountService({ db });
    const sessionService = createSessionService({ db });

    const user = accounts.createWithGrant({ email: "cascade@example.com", passwordHash: "hash" });
    sessionService.create(user.id);

    expect(db.select().from(sessions).where(eq(sessions.userId, user.id)).all()).toHaveLength(1);
    expect(db.select().from(balances).where(eq(balances.userId, user.id)).all()).toHaveLength(1);

    db.delete(users).where(eq(users.id, user.id)).run();

    // Without PRAGMA foreign_keys = ON (db/client.ts), ON DELETE CASCADE is
    // inert and these rows would silently survive — this is the regression
    // test for that pragma.
    expect(db.select().from(sessions).where(eq(sessions.userId, user.id)).all()).toHaveLength(0);
    expect(db.select().from(balances).where(eq(balances.userId, user.id)).all()).toHaveLength(0);
  });
});

describe("AUTH-05: concurrent duplicate signup can never double-credit", () => {
  async function buildTestApp() {
    const { db } = createDb(":memory:");
    const { destination } = captureLines();
    const logger = createLogger({ destination });
    const config = loadConfig({});
    const app = await buildApp({ config, db, logger });
    return { app, db };
  }

  it("two signups for the same email fired back to back settle as exactly one success and one 409, one user row and one balance row", async () => {
    const { app, db } = await buildTestApp();

    // Fired without awaiting the first — proves the transaction boundary
    // (Pattern 3), not just eventual consistency (Pitfall 1).
    const first = app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "race@example.com", password: "password1" },
    });
    const second = app.inject({
      method: "POST",
      url: "/api/signup",
      payload: { email: "race@example.com", password: "password2" },
    });

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    const statuses = [firstResponse.statusCode, secondResponse.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(balances).all()).toHaveLength(1);

    await app.close();
  });
});

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { createSessionService, SESSION_TTL_MS } from "./session.js";

// Modeled on coingecko.test.ts's injected-clock pattern — no real clock
// anywhere in this file, so the 7-day boundary is exercised deterministically.
function insertUser(db: ReturnType<typeof createDb>["db"], email: string): number {
  const row = db
    .insert(users)
    .values({
      email,
      passwordHash: "irrelevant-for-this-suite",
      createdAt: new Date().toISOString(),
    })
    .returning({ id: users.id })
    .get();
  return row.id;
}

describe("createSessionService", () => {
  it("accepts a session one minute before its 7-day expiry and rejects it one minute after (D-17/D-19)", () => {
    const { db } = createDb(":memory:");
    const userId = insertUser(db, "expiry@example.com");
    let now = 1_700_000_000_000;
    const service = createSessionService({ db, now: () => now });

    const { token } = service.create(userId);

    now += SESSION_TTL_MS - 60_000; // one minute before expiry
    expect(service.validate(token)).toEqual({ userId });

    now += 60_000 + 60_000; // now one minute past expiry
    expect(service.validate(token)).toBeNull();
  });

  it("deletes the expired session row on validate, so the table does not accumulate dead rows and the same token cannot be retried (D-19)", () => {
    const { db } = createDb(":memory:");
    const userId = insertUser(db, "lazy-delete@example.com");
    let now = 1_700_000_000_000;
    const service = createSessionService({ db, now: () => now });
    const { token } = service.create(userId);

    now += SESSION_TTL_MS + 1;
    expect(service.validate(token)).toBeNull();

    // Assert the row count, not just the null return — the bug this proof
    // guards against is a row that silently survives an expired read.
    expect(db.select().from(sessions).all()).toHaveLength(0);

    // Retrying the same (now-deleted) token is still a clean null, not an error.
    expect(service.validate(token)).toBeNull();
  });

  it("revoking one session removes exactly that row and leaves the same user's other session valid", () => {
    const { db } = createDb(":memory:");
    const userId = insertUser(db, "revoke@example.com");
    const service = createSessionService({ db });

    const sessionA = service.create(userId);
    const sessionB = service.create(userId);

    service.revoke(sessionA.token);

    expect(service.validate(sessionA.token)).toBeNull();
    expect(service.validate(sessionB.token)).toEqual({ userId });
    expect(db.select().from(sessions).where(eq(sessions.userId, userId)).all()).toHaveLength(1);
  });

  it("validate returns null for a token that was never issued (forged-cookie proof)", () => {
    const { db } = createDb(":memory:");
    const service = createSessionService({ db });

    expect(service.validate("a-token-that-was-never-issued")).toBeNull();
  });
});

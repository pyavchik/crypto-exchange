import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { balances, users } from "../db/schema.js";

// D-25: the 10,000 USDT grant, as a decimal string (D-24 — never a float).
export const STARTING_USDT = "10000.00000000";

export interface AccountServiceDeps {
  db: AppDatabase;
  now?: () => number;
}

export interface Account {
  id: number;
  email: string;
}

export interface AccountWithPasswordHash extends Account {
  passwordHash: string;
}

export interface Balance {
  asset: string;
  amount: string;
}

export interface AccountService {
  createWithGrant(input: { email: string; passwordHash: string }): Account;
  findByEmail(email: string): AccountWithPasswordHash | null;
  // Not in the plan's interface contract — added because GET /api/me only
  // has request.userId (an id, from the session) and must return the
  // account's email; there is no id-keyed lookup otherwise (deviation,
  // Rule 3 — blocking, GET /api/me cannot be implemented without it).
  findById(userId: number): Account | null;
  listBalances(userId: number): Balance[];
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  const { db, now = Date.now } = deps;

  return {
    // D-25: user row + 10,000 USDT grant inserted inside ONE synchronous
    // transaction callback. better-sqlite3 does not await an async
    // transaction callback — it returns as soon as the callback function
    // object itself returns, committing before any awaited statement inside
    // it runs. Every statement here executes synchronously via .run()/.get(),
    // and the callback is a plain (non-async) function — see 02-RESEARCH.md
    // Pattern 3 / Pitfall 1. Hash the password before calling this function,
    // never inside it.
    createWithGrant(input) {
      const createdAt = new Date(now()).toISOString();
      return db.transaction((tx) => {
        const user = tx
          .insert(users)
          .values({ email: input.email, passwordHash: input.passwordHash, createdAt })
          .returning({ id: users.id, email: users.email })
          .get();
        tx.insert(balances).values({ userId: user.id, asset: "USDT", amount: STARTING_USDT }).run();
        return user;
      });
    },

    findByEmail(email: string) {
      const row = db.select().from(users).where(eq(users.email, email)).get();
      if (!row) return null;
      return { id: row.id, email: row.email, passwordHash: row.passwordHash };
    },

    findById(userId: number) {
      const row = db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .get();
      return row ?? null;
    },

    listBalances(userId: number) {
      const rows = db
        .select({ asset: balances.asset, amount: balances.amount })
        .from(balances)
        .where(eq(balances.userId, userId))
        .all();
      return rows;
    },
  };
}

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const upstreamChecks = sqliteTable(
  "upstream_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    service: text("service").notNull(),
    status: text("status", { enum: ["ok", "degraded", "down"] }).notNull(),
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms").notNull(),
    checkedAt: text("checked_at").notNull(),
    requestId: text("request_id"),
  },
  (table) => [index("upstream_checks_service_checked_at_idx").on(table.service, table.checkedAt)],
);

// D-23: users table. Email is normalized (trimmed, lowercased) in application
// code before every insert/lookup, so the unique index only ever compares
// normalized values.
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

// D-16: opaque session tokens. Only the SHA-256 hash of the raw token is ever
// stored here — the raw token lives only in the cookie.
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

// D-24: amounts are TEXT decimal strings, never REAL/float (decimal-safe
// rule). The unique (user_id, asset) index makes a second credit for the
// same asset impossible, which is half of D-25's exactly-once guarantee.
export const balances = sqliteTable(
  "balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").notNull(),
    amount: text("amount").notNull(),
  },
  (table) => [uniqueIndex("balances_user_asset_idx").on(table.userId, table.asset)],
);

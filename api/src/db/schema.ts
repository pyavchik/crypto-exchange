import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

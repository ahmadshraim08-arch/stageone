import { pgTable, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const analysisJobsTable = pgTable("analysis_jobs", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  videoObjectKey: text("video_object_key").notNull(),
  stage: text("stage").notNull().default("preparing"),
  progressPct: integer("progress_pct").notNull().default(0),
  status: text("status").notNull().default("running"),
  perStageErrors: jsonb("per_stage_errors").$type<Record<string, string>>(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  retryable: boolean("retryable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type AnalysisJob = typeof analysisJobsTable.$inferSelect;

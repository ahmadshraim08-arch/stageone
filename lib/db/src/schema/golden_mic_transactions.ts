import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const goldenMicTransactionsTable = pgTable("golden_mic_transactions", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id")
    .notNull()
    .references(() => usersTable.id),
  toUserId: integer("to_user_id")
    .notNull()
    .references(() => usersTable.id),
  postId: integer("post_id").references(() => postsTable.id),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoldenMicTransactionSchema = createInsertSchema(
  goldenMicTransactionsTable,
).omit({ id: true, createdAt: true });
export type InsertGoldenMicTransaction = z.infer<typeof insertGoldenMicTransactionSchema>;
export type GoldenMicTransaction = typeof goldenMicTransactionsTable.$inferSelect;

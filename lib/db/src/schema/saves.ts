import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const savesTable = pgTable(
  "saves",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.postId)],
);

export const insertSaveSchema = createInsertSchema(savesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSave = z.infer<typeof insertSaveSchema>;
export type Save = typeof savesTable.$inferSelect;

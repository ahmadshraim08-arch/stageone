import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const postViewsTable = pgTable(
  "post_views",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id),
    watchDurationMs: integer("watch_duration_ms").notNull(),
    genre: text("genre"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("post_views_user_id_idx").on(t.userId),
    index("post_views_created_at_idx").on(t.createdAt),
  ],
);

export type PostView = typeof postViewsTable.$inferSelect;

import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  title: text("title").notNull(),
  caption: text("caption"),
  performanceType: text("performance_type").notNull(),
  genre: text("genre"),
  language: text("language"),
  musixmatchTrackId: text("musixmatch_track_id"),
  trackTitle: text("track_title"),
  trackArtist: text("track_artist"),
  lyricSectionId: text("lyric_section_id"),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  goldenMicCount: integer("golden_mic_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;

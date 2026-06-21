import { pgTable, serial, integer, text, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
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
  thumbnailObjectKey: text("thumbnail_object_key"),
  title: text("title").notNull(),
  caption: text("caption"),
  performanceType: text("performance_type").notNull(),
  genre: text("genre"),
  language: text("language"),
  musixmatchTrackId: text("musixmatch_track_id"),
  trackTitle: text("track_title"),
  trackArtist: text("track_artist"),
  videoObjectKey: text("video_object_key"),
  lyricSectionId: text("lyric_section_id"),
  lyricSectionLabel: text("lyric_section_label"),
  lyricSectionStartMs: integer("lyric_section_start_ms"),
  lyricSectionEndMs: integer("lyric_section_end_ms"),
  lyricSectionStartLine: integer("lyric_section_start_line"),
  lyricSectionEndLine: integer("lyric_section_end_line"),
  lyricTimingMode: text("lyric_timing_mode"),
  lyricTimingOffsetMs: integer("lyric_timing_offset_ms"),
  lyricTimingAnchors: jsonb("lyric_timing_anchors"),
  analysisJobId: text("analysis_job_id"),
  songMatchConfidence: real("song_match_confidence"),
  lyricStartWord: integer("lyric_start_word"),
  lyricEndWord: integer("lyric_end_word"),
  lyricRangeConfidence: real("lyric_range_confidence"),
  syncConfidence: real("sync_confidence"),
  vocalIsolationUsed: boolean("vocal_isolation_used"),
  transcriptionSource: text("transcription_source"),
  cyaniteGenre: text("cyanite_genre"),
  cyaniteMoods: jsonb("cyanite_moods").$type<string[]>(),
  cyaniteEnergy: text("cyanite_energy"),
  audioAnalysisSource: text("audio_analysis_source"),
  genreDetectionSource: text("genre_detection_source"),
  genreConfidence: real("genre_confidence"),
  languageDetectionSource: text("language_detection_source"),
  languageConfidence: real("language_confidence"),
  creatorOverrodeGenre: boolean("creator_overrode_genre"),
  creatorOverrodeLanguage: boolean("creator_overrode_language"),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  goldenMicCount: integer("golden_mic_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
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

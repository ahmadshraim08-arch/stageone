import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

export const conversationParticipantsTable = pgTable(
  "conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.conversationId, t.userId)],
);

export const insertConversationParticipantSchema = createInsertSchema(
  conversationParticipantsTable,
).omit({ id: true, joinedAt: true });
export type InsertConversationParticipant = z.infer<
  typeof insertConversationParticipantSchema
>;
export type ConversationParticipant =
  typeof conversationParticipantsTable.$inferSelect;

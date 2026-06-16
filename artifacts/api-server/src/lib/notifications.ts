import { db, notificationsTable } from "@workspace/db";

export type NotificationType =
  | "follow"
  | "comment"
  | "golden_mic"
  | "music_minute_share";

export async function createNotification(
  type: NotificationType,
  recipientId: number,
  actorId: number | null,
  entityId: number | null,
): Promise<void> {
  if (recipientId === actorId) return;

  await db.insert(notificationsTable).values({
    userId: recipientId,
    type,
    actorId: actorId ?? null,
    postId: entityId ?? null,
  });
}

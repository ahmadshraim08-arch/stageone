import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type NotificationType =
  | "like"
  | "follow"
  | "comment"
  | "golden_mic"
  | "music_minute_share";

const PUSH_TITLES: Record<NotificationType, string> = {
  like: "New like",
  follow: "New follower",
  comment: "New comment",
  golden_mic: "Golden Mic received 🎤",
  music_minute_share: "Music Minute shared",
};

function pushBody(type: NotificationType, actorName: string): string {
  switch (type) {
    case "like": return `${actorName} liked your Music Minute`;
    case "follow": return `${actorName} started following you`;
    case "comment": return `${actorName} commented on your Music Minute`;
    case "golden_mic": return `${actorName} gave you a Golden Mic`;
    case "music_minute_share": return `${actorName} shared a Music Minute with you`;
    default: return `${actorName} interacted with you`;
  }
}

async function sendExpoPush(token: string, title: string, body: string): Promise<void> {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: "default",
        data: { screen: "notifications" },
        channelId: "default",
      }),
    });
  } catch {
    // Push delivery is best-effort; never throw
  }
}

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

  // Fire push notification best-effort (do not await to keep route latency low)
  void (async () => {
    try {
      const [recipient] = await db
        .select({ expoPushToken: usersTable.expoPushToken, displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.id, recipientId))
        .limit(1);

      const token = recipient?.expoPushToken;
      if (!token) return;

      let actorName = "Someone";
      if (actorId) {
        const [actor] = await db
          .select({ displayName: usersTable.displayName })
          .from(usersTable)
          .where(eq(usersTable.id, actorId))
          .limit(1);
        if (actor) actorName = actor.displayName;
      }

      await sendExpoPush(token, PUSH_TITLES[type], pushBody(type, actorName));
    } catch {
      // best-effort
    }
  })();
}

import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  postsTable,
  followsTable,
  messagesTable,
  notificationsTable,
  conversationParticipantsTable,
} from "@workspace/db";
import { eq, count, isNull, and, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { signVideoGetUrl } from "../lib/objectStorage";

/**
 * Re-sign a stored avatar URL using the stable object key.
 * Falls back to the stored URL if objectKey is absent or signing fails.
 */
async function freshenAvatarUrl(
  avatarUrl: string | null | undefined,
  avatarObjectKey: string | null | undefined,
): Promise<string | null> {
  if (!avatarObjectKey) return avatarUrl ?? null;
  try {
    const slash = avatarObjectKey.indexOf("/");
    if (slash === -1) return avatarUrl ?? null;
    const bucket = avatarObjectKey.slice(0, slash);
    const objectName = avatarObjectKey.slice(slash + 1);
    return await signVideoGetUrl(bucket, objectName);
  } catch {
    return avatarUrl ?? null;
  }
}

const router: IRouter = Router();

router.get("/users/:username", optionalAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.username)
    ? req.params.username[0]
    : req.params.username;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, raw))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const viewerId = req.userIdOptional;

    const [postCount] = await db
      .select({ value: count() })
      .from(postsTable)
      .where(and(eq(postsTable.userId, user.id), isNull(postsTable.deletedAt)));

    const [followerCount] = await db
      .select({ value: count() })
      .from(followsTable)
      .where(eq(followsTable.followingId, user.id));

    const [followingCount] = await db
      .select({ value: count() })
      .from(followsTable)
      .where(eq(followsTable.followerId, user.id));

    let viewerIsFollowing = false;
    if (viewerId !== undefined && viewerId !== user.id) {
      const [followRow] = await db
        .select({ id: followsTable.id })
        .from(followsTable)
        .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, user.id)))
        .limit(1);
      viewerIsFollowing = !!followRow;
    }

    const avatarUrl = await freshenAvatarUrl(user.avatarUrl, user.avatarObjectKey);

    res.json({
      ...user,
      avatarUrl,
      postCount: postCount?.value ?? 0,
      followerCount: followerCount?.value ?? 0,
      followingCount: followingCount?.value ?? 0,
      goldenMicsReceived: user.goldenMicBalance,
      viewerIsFollowing,
    });
  } catch (err) {
    req.log.error({ err }, "GET /users/:username failed");
    res.status(500).json({ error: "Failed to load user profile" });
  }
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    avatarObjectKey?: string;
    genres?: string[];
    languages?: string[];
  };

  const updates: Partial<{
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    avatarObjectKey: string | null;
    genres: string[];
    languages: string[];
  }> = {};

  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.bio !== undefined) updates.bio = body.bio ?? null;
  if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl ?? null;
  if (body.avatarObjectKey !== undefined) updates.avatarObjectKey = body.avatarObjectKey ?? null;
  if (body.genres !== undefined) updates.genres = body.genres;
  if (body.languages !== undefined) updates.languages = body.languages;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.userId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [postCount] = await db
      .select({ value: count() })
      .from(postsTable)
      .where(and(eq(postsTable.userId, updated.id), isNull(postsTable.deletedAt)));

    const [followerCount] = await db
      .select({ value: count() })
      .from(followsTable)
      .where(eq(followsTable.followingId, updated.id));

    const [followingCount] = await db
      .select({ value: count() })
      .from(followsTable)
      .where(eq(followsTable.followerId, updated.id));

    const avatarUrl = await freshenAvatarUrl(updated.avatarUrl, updated.avatarObjectKey);

    res.json({
      ...updated,
      avatarUrl,
      postCount: postCount?.value ?? 0,
      followerCount: followerCount?.value ?? 0,
      followingCount: followingCount?.value ?? 0,
      goldenMicsReceived: updated.goldenMicBalance,
      viewerIsFollowing: false,
    });
  } catch (err) {
    req.log.error({ err }, "PATCH /users/me failed");
    res.status(500).json({ error: "Could not update your profile" });
  }
});

router.post("/users/me/push-token", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }
  await db
    .update(usersTable)
    .set({ expoPushToken: token })
    .where(eq(usersTable.id, req.userId));
  res.sendStatus(204);
});

router.get("/users/me/unread", requireAuth, async (req, res): Promise<void> => {
  const unreadMessagesResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM messages m
    JOIN conversation_participants cp
      ON cp.conversation_id = m.conversation_id AND cp.user_id = ${req.userId}
    WHERE m.sender_id != ${req.userId}
      AND m.read_at IS NULL
  `);
  const unreadMessages = (unreadMessagesResult.rows as unknown as Array<{ cnt: number }>)[0];

  const [unreadNotifications] = await db
    .select({ cnt: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, req.userId),
        isNull(notificationsTable.readAt),
      ),
    );

  res.json({
    messages: unreadMessages?.cnt ?? 0,
    notifications: unreadNotifications?.cnt ?? 0,
  });
});

export default router;

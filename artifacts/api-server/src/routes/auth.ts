import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, postsTable, followsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

async function userWithCounts(userId: number) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return null;

  const [postCount] = await db
    .select({ value: count() })
    .from(postsTable)
    .where(eq(postsTable.userId, userId));

  const [followerCount] = await db
    .select({ value: count() })
    .from(followsTable)
    .where(eq(followsTable.followingId, userId));

  const [followingCount] = await db
    .select({ value: count() })
    .from(followsTable)
    .where(eq(followsTable.followerId, userId));

  return {
    ...user,
    postCount: postCount?.value ?? 0,
    followerCount: followerCount?.value ?? 0,
    followingCount: followingCount?.value ?? 0,
    goldenMicsReceived: user.goldenMicBalance,
  };
}

router.post("/auth/me", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };

  const defaultUsername = `user_${clerkId.slice(-8)}`;

  const [upserted] = await db
    .insert(usersTable)
    .values({
      clerkId,
      username: body.username ?? defaultUsername,
      displayName: body.displayName ?? body.username ?? defaultUsername,
      avatarUrl: body.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: usersTable.clerkId,
      set: {
        ...(body.username ? { username: sql`excluded.username` } : {}),
        ...(body.displayName ? { displayName: sql`excluded.display_name` } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: sql`excluded.avatar_url` } : {}),
      },
    })
    .returning({ id: usersTable.id });

  const profile = await userWithCounts(upserted.id);
  res.json(profile);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const profile = await userWithCounts(req.userId);

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(profile);
});

export default router;

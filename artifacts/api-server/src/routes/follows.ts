import { Router, type IRouter } from "express";
import { db, usersTable, followsTable } from "@workspace/db";
import { eq, and, lt, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.post("/follows/:userId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);

  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  if (targetId === req.userId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, targetId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const result = await db
    .insert(followsTable)
    .values({ followerId: req.userId, followingId: targetId })
    .onConflictDoNothing()
    .returning({ id: followsTable.id });

  const statusCode = result.length > 0 ? 201 : 409;
  res.status(statusCode).json({ following: true });
});

router.delete("/follows/:userId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);

  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  await db
    .delete(followsTable)
    .where(and(eq(followsTable.followerId, req.userId), eq(followsTable.followingId, targetId)));

  res.status(200).json({ following: false });
});

router.get("/users/:username/followers", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.username) ? req.params.username[0] : req.params.username;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, raw))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  const conditions = [eq(followsTable.followingId, user.id)];
  if (cursor && !isNaN(cursor)) conditions.push(lt(followsTable.id, cursor));

  const rows = await db
    .select({
      followId: followsTable.id,
      user: {
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        bio: usersTable.bio,
      },
    })
    .from(followsTable)
    .innerJoin(usersTable, eq(followsTable.followerId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(followsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].followId : null;

  res.json({ items: items.map((r) => r.user), nextCursor });
});

router.get("/users/:username/following", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.username) ? req.params.username[0] : req.params.username;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, raw))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  const conditions = [eq(followsTable.followerId, user.id)];
  if (cursor && !isNaN(cursor)) conditions.push(lt(followsTable.id, cursor));

  const rows = await db
    .select({
      followId: followsTable.id,
      user: {
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        bio: usersTable.bio,
      },
    })
    .from(followsTable)
    .innerJoin(usersTable, eq(followsTable.followingId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(followsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].followId : null;

  res.json({ items: items.map((r) => r.user), nextCursor });
});

export default router;

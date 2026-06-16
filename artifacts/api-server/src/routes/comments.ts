import { Router, type IRouter } from "express";
import { db, postsTable, commentsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/posts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  const conditions = [
    eq(commentsTable.postId, postId),
    isNull(commentsTable.deletedAt),
  ];

  if (cursor && !isNaN(cursor)) {
    const { lt } = await import("drizzle-orm");
    conditions.push(lt(commentsTable.id, cursor));
  }

  const rows = await db
    .select({
      id: commentsTable.id,
      postId: commentsTable.postId,
      body: commentsTable.body,
      createdAt: commentsTable.createdAt,
      creator: {
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      },
    })
    .from(commentsTable)
    .innerJoin(usersTable, eq(commentsTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(commentsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
});

router.post("/posts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const body = (req.body as { body?: string }).body;

  if (!body || typeof body !== "string" || body.trim().length === 0) {
    res.status(400).json({ error: "Comment body is required" });
    return;
  }

  if (body.length > 500) {
    res.status(400).json({ error: "Comment body must be 500 characters or fewer" });
    return;
  }

  const [post] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(eq(postsTable.id, postId), isNull(postsTable.deletedAt)))
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [comment] = await db
    .insert(commentsTable)
    .values({ userId: req.userId, postId, body: body.trim() })
    .returning();

  const [creator] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId))
    .limit(1);

  res.status(201).json({ ...comment, creator });
});

router.delete("/comments/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const commentId = parseInt(raw, 10);

  if (isNaN(commentId)) {
    res.status(400).json({ error: "Invalid comment id" });
    return;
  }

  const [existing] = await db
    .select({ userId: commentsTable.userId, deletedAt: commentsTable.deletedAt })
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId))
    .limit(1);

  if (!existing || existing.deletedAt !== null) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }

  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .update(commentsTable)
    .set({ deletedAt: new Date() })
    .where(eq(commentsTable.id, commentId));

  res.sendStatus(204);
});

export default router;

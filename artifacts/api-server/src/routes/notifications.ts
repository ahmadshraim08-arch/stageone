import { Router, type IRouter } from "express";
import { db, notificationsTable, usersTable, postsTable } from "@workspace/db";
import { eq, desc, isNull, and, lt } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(limitRaw ?? "30", 10) || 30, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  const conditions = [eq(notificationsTable.userId, req.userId)];
  if (cursor && !isNaN(cursor)) conditions.push(lt(notificationsTable.id, cursor));

  const actorsTable = usersTable;
  const rows = await db
    .select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      postId: notificationsTable.postId,
      postTitle: postsTable.title,
      postThumbnailUrl: postsTable.thumbnailUrl,
      createdAt: notificationsTable.createdAt,
      readAt: notificationsTable.readAt,
      actor: {
        id: actorsTable.id,
        username: actorsTable.username,
        displayName: actorsTable.displayName,
        avatarUrl: actorsTable.avatarUrl,
      },
    })
    .from(notificationsTable)
    .leftJoin(actorsTable, eq(notificationsTable.actorId, actorsTable.id))
    .leftJoin(postsTable, eq(notificationsTable.postId, postsTable.id))
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
});

router.post(
  "/notifications/read",
  requireAuth,
  async (req, res): Promise<void> => {
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, req.userId),
          isNull(notificationsTable.readAt),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;

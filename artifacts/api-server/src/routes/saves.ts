import { Router, type IRouter } from "express";
import { db, postsTable, savesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.post("/posts/:id/save", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
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

  await db
    .insert(savesTable)
    .values({ userId: req.userId, postId })
    .onConflictDoNothing();

  res.status(200).json({ saved: true });
});

router.delete("/posts/:id/save", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  await db
    .delete(savesTable)
    .where(and(eq(savesTable.userId, req.userId), eq(savesTable.postId, postId)));

  res.status(200).json({ saved: false });
});

router.get("/users/me/saved", requireAuth, async (req, res): Promise<void> => {
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  const conditions = [
    eq(savesTable.userId, req.userId),
    isNull(postsTable.deletedAt),
  ];

  if (cursor && !isNaN(cursor)) {
    const { lt } = await import("drizzle-orm");
    conditions.push(lt(savesTable.id, cursor));
  }

  const rows = await db
    .select({
      saveId: savesTable.id,
      savedAt: savesTable.createdAt,
      id: postsTable.id,
      userId: postsTable.userId,
      videoUrl: postsTable.videoUrl,
      thumbnailUrl: postsTable.thumbnailUrl,
      title: postsTable.title,
      caption: postsTable.caption,
      performanceType: postsTable.performanceType,
      genre: postsTable.genre,
      language: postsTable.language,
      musixmatchTrackId: postsTable.musixmatchTrackId,
      trackTitle: postsTable.trackTitle,
      trackArtist: postsTable.trackArtist,
      lyricSectionId: postsTable.lyricSectionId,
      rightsConfirmed: postsTable.rightsConfirmed,
      goldenMicCount: postsTable.goldenMicCount,
      createdAt: postsTable.createdAt,
      creator: {
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      },
    })
    .from(savesTable)
    .innerJoin(postsTable, eq(savesTable.postId, postsTable.id))
    .innerJoin(usersTable, eq(postsTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(savesTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].saveId : null;

  res.json({
    items: items.map(({ saveId, savedAt, ...post }) => ({ ...post, savedAt })),
    nextCursor,
  });
});

export default router;

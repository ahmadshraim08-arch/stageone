import { Router, type IRouter } from "express";
import { db, postsTable, savesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, desc, lt, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { signVideoGetUrl } from "../lib/objectStorage";

const router: IRouter = Router();

async function freshenVideoUrl(videoUrl: string, videoObjectKey: string | null): Promise<string> {
  if (!videoObjectKey) return videoUrl;
  try {
    const slash = videoObjectKey.indexOf("/");
    if (slash === -1) return videoUrl;
    return await signVideoGetUrl(videoObjectKey.slice(0, slash), videoObjectKey.slice(slash + 1));
  } catch {
    return videoUrl;
  }
}

async function freshenThumbnailUrl(
  thumbnailUrl: string | null,
  thumbnailObjectKey: string | null,
): Promise<string | null> {
  if (!thumbnailObjectKey || !thumbnailUrl) return thumbnailUrl ?? null;
  try {
    const slash = thumbnailObjectKey.indexOf("/");
    if (slash === -1) return thumbnailUrl;
    return await signVideoGetUrl(thumbnailObjectKey.slice(0, slash), thumbnailObjectKey.slice(slash + 1));
  } catch {
    return thumbnailUrl;
  }
}

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
  const viewerId = req.userId;
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 50);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  try {
    const conditions = [
      eq(savesTable.userId, viewerId),
      isNull(postsTable.deletedAt),
    ];
    if (cursor !== undefined && !isNaN(cursor)) conditions.push(lt(savesTable.id, cursor));

    const rows = await db
      .select({
        saveId: savesTable.id,
        id: postsTable.id,
        userId: postsTable.userId,
        videoUrl: postsTable.videoUrl,
        videoObjectKey: postsTable.videoObjectKey,
        thumbnailUrl: postsTable.thumbnailUrl,
        thumbnailObjectKey: postsTable.thumbnailObjectKey,
        title: postsTable.title,
        caption: postsTable.caption,
        performanceType: postsTable.performanceType,
        genre: postsTable.genre,
        genreDetectionSource: postsTable.genreDetectionSource,
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
        likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.post_id = ${postsTable.id})`,
        commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.post_id = ${postsTable.id} AND comments.deleted_at IS NULL)`,
        savesCount: sql<number>`(SELECT COUNT(*) FROM saves WHERE saves.post_id = ${postsTable.id})`,
        viewerHasLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${postsTable.id} AND likes.user_id = ${viewerId})`,
        viewerHasSaved: sql<boolean>`true`,
        viewerIsFollowing: sql<boolean>`false`,
      })
      .from(savesTable)
      .innerJoin(postsTable, eq(savesTable.postId, postsTable.id))
      .innerJoin(usersTable, eq(postsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(savesTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(items[items.length - 1].saveId) : null;

    const signedItems = await Promise.all(
      items.map(async ({ saveId: _saveId, ...item }) => ({
        ...item,
        videoUrl: await freshenVideoUrl(item.videoUrl, item.videoObjectKey),
        thumbnailUrl: await freshenThumbnailUrl(item.thumbnailUrl, item.thumbnailObjectKey),
      })),
    );

    res.json({ items: signedItems, nextCursor });
  } catch (err) {
    req.log.error({ err }, "GET /users/me/saved failed");
    res.status(500).json({ error: "Could not load your saved posts" });
  }
});

export default router;

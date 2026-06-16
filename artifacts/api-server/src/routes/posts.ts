import { Router, type IRouter } from "express";
import { db, postsTable, usersTable, likesTable, followsTable, goldenMicTransactionsTable } from "@workspace/db";
import { eq, desc, isNull, and, lt, inArray, sql, gte } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/posts", optionalAuth, async (req, res): Promise<void> => {
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const userIdRaw = req.query.userId as string | undefined;
  const feed = req.query.feed as string | undefined;

  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;
  const filterUserId = userIdRaw ? parseInt(userIdRaw, 10) : undefined;
  const viewerId = req.userIdOptional;

  const conditions = [isNull(postsTable.deletedAt)];
  if (filterUserId && !isNaN(filterUserId)) conditions.push(eq(postsTable.userId, filterUserId));
  if (cursor && !isNaN(cursor)) conditions.push(lt(postsTable.id, cursor));

  if (feed === "following" && viewerId !== undefined) {
    conditions.push(
      inArray(
        postsTable.userId,
        db.select({ id: followsTable.followingId }).from(followsTable).where(eq(followsTable.followerId, viewerId)),
      ),
    );
  }

  const rows = await db
    .select({
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
      likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.post_id = ${postsTable.id})`,
      commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.post_id = ${postsTable.id} AND comments.deleted_at IS NULL)`,
      savesCount: sql<number>`(SELECT COUNT(*) FROM saves WHERE saves.post_id = ${postsTable.id})`,
      viewerHasLiked: viewerId !== undefined
        ? sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${postsTable.id} AND likes.user_id = ${viewerId})`
        : sql<boolean>`false`,
      viewerHasSaved: viewerId !== undefined
        ? sql<boolean>`EXISTS(SELECT 1 FROM saves WHERE saves.post_id = ${postsTable.id} AND saves.user_id = ${viewerId})`
        : sql<boolean>`false`,
      viewerIsFollowing: viewerId !== undefined
        ? sql<boolean>`EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = ${viewerId} AND follows.following_id = ${postsTable.userId})`
        : sql<boolean>`false`,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(postsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
});

router.post("/posts", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as {
    videoUrl?: string;
    thumbnailUrl?: string;
    title?: string;
    caption?: string;
    performanceType?: string;
    genre?: string;
    language?: string;
    musixmatchTrackId?: string;
    trackTitle?: string;
    trackArtist?: string;
    lyricSectionId?: string;
    rightsConfirmed?: boolean;
  };

  if (!body.videoUrl || !body.title || !body.performanceType) {
    res.status(400).json({ error: "videoUrl, title, and performanceType are required" });
    return;
  }

  const [post] = await db
    .insert(postsTable)
    .values({
      userId: req.userId,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl ?? null,
      title: body.title,
      caption: body.caption ?? null,
      performanceType: body.performanceType,
      genre: body.genre ?? null,
      language: body.language ?? null,
      musixmatchTrackId: body.musixmatchTrackId ?? null,
      trackTitle: body.trackTitle ?? null,
      trackArtist: body.trackArtist ?? null,
      lyricSectionId: body.lyricSectionId ?? null,
      rightsConfirmed: body.rightsConfirmed ?? false,
    })
    .returning();

  res.status(201).json(post);
});

router.delete("/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [existing] = await db
    .select({ userId: postsTable.userId, deletedAt: postsTable.deletedAt })
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1);

  if (!existing || existing.deletedAt !== null) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .update(postsTable)
    .set({ deletedAt: new Date() })
    .where(eq(postsTable.id, postId));

  res.sendStatus(204);
});

router.get("/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const viewerId = req.userId;

  const rows = await db
    .select({
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
      likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.post_id = ${postsTable.id})`,
      commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.post_id = ${postsTable.id} AND comments.deleted_at IS NULL)`,
      savesCount: sql<number>`(SELECT COUNT(*) FROM saves WHERE saves.post_id = ${postsTable.id})`,
      viewerHasLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${postsTable.id} AND likes.user_id = ${viewerId})`,
      viewerHasSaved: sql<boolean>`EXISTS(SELECT 1 FROM saves WHERE saves.post_id = ${postsTable.id} AND saves.user_id = ${viewerId})`,
      viewerIsFollowing: sql<boolean>`EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = ${viewerId} AND follows.following_id = ${postsTable.userId})`,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.userId, usersTable.id))
    .where(and(eq(postsTable.id, postId), isNull(postsTable.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(rows[0]);
});

router.post("/posts/:id/like", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [post] = await db
    .select({ id: postsTable.id, userId: postsTable.userId })
    .from(postsTable)
    .where(and(eq(postsTable.id, postId), isNull(postsTable.deletedAt)))
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const result = await db
    .insert(likesTable)
    .values({ userId: req.userId, postId })
    .onConflictDoNothing()
    .returning();

  // Only notify on a new like (skip if already liked / conflict)
  if (result.length > 0) {
    void createNotification("like", post.userId, req.userId, postId);
  }

  const [{ likesCount }] = await db
    .select({ likesCount: sql<number>`COUNT(*)` })
    .from(likesTable)
    .where(eq(likesTable.postId, postId));

  res.status(200).json({ liked: true, likesCount });
});

router.delete("/posts/:id/like", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  await db
    .delete(likesTable)
    .where(and(eq(likesTable.userId, req.userId), eq(likesTable.postId, postId)));

  const [{ likesCount }] = await db
    .select({ likesCount: sql<number>`COUNT(*)` })
    .from(likesTable)
    .where(eq(likesTable.postId, postId));

  res.status(200).json({ liked: false, likesCount });
});

router.post("/posts/:id/golden-mic", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const amountRaw = (req.body as { amount?: number }).amount;
  const amount = typeof amountRaw === "number" ? Math.floor(amountRaw) : 1;

  if (amount < 1) {
    res.status(400).json({ error: "Amount must be at least 1" });
    return;
  }

  type TxResult =
    | { error: string; status: number }
    | { goldenMicCount: number; senderBalance: number };

  const result: TxResult = await db.transaction(async (tx) => {
    const [post] = await tx
      .select({ id: postsTable.id, userId: postsTable.userId })
      .from(postsTable)
      .where(and(eq(postsTable.id, postId), isNull(postsTable.deletedAt)))
      .limit(1);

    if (!post) return { error: "Post not found", status: 404 };
    if (post.userId === req.userId) return { error: "Cannot send Golden Mics to your own post", status: 400 };

    const deducted = await tx
      .update(usersTable)
      .set({ goldenMicBalance: sql`golden_mic_balance - ${amount}` })
      .where(and(eq(usersTable.id, req.userId), gte(usersTable.goldenMicBalance, amount)))
      .returning({ goldenMicBalance: usersTable.goldenMicBalance });

    if (deducted.length === 0) {
      return { error: "Insufficient Golden Mic balance", status: 402 };
    }

    await tx
      .update(usersTable)
      .set({ goldenMicBalance: sql`golden_mic_balance + ${amount}` })
      .where(eq(usersTable.id, post.userId));

    const [updatedPost] = await tx
      .update(postsTable)
      .set({ goldenMicCount: sql`golden_mic_count + ${amount}` })
      .where(eq(postsTable.id, postId))
      .returning({ goldenMicCount: postsTable.goldenMicCount });

    await tx.insert(goldenMicTransactionsTable).values({
      fromUserId: req.userId,
      toUserId: post.userId,
      postId,
      amount,
    });

    return {
      goldenMicCount: updatedPost.goldenMicCount,
      senderBalance: deducted[0].goldenMicBalance,
    };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json(result);
});

export default router;

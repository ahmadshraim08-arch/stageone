import { Router, type IRouter } from "express";
import { db, postsTable, usersTable, likesTable, followsTable, goldenMicTransactionsTable, postViewsTable } from "@workspace/db";
import { eq, desc, isNull, and, lt, inArray, sql, gte } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

function encodeCursor(score: number, id: number): string {
  return `${score.toFixed(8)}:${id}`;
}

function decodeCursor(raw: string): { score: number; id: number } | null {
  if (raw.includes(":")) {
    const colonIdx = raw.lastIndexOf(":");
    const scoreStr = raw.slice(0, colonIdx);
    const idStr = raw.slice(colonIdx + 1);
    const score = parseFloat(scoreStr);
    const id = parseInt(idStr, 10);
    if (!isNaN(score) && !isNaN(id)) return { score, id };
  }
  const id = parseInt(raw, 10);
  if (!isNaN(id)) return { score: 1.0, id };
  return null;
}

// ---------------------------------------------------------------------------
// Personalized ranked feed via raw SQL (for-you feed, signed-in or guest)
// ---------------------------------------------------------------------------

type FeedRow = {
  id: number;
  userId: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  caption: string | null;
  performanceType: string;
  genre: string | null;
  language: string | null;
  musixmatchTrackId: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  lyricSectionId: string | null;
  rightsConfirmed: boolean;
  goldenMicCount: number;
  createdAt: Date;
  creator: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  viewerIsFollowing: boolean;
  score: number;
};

async function fetchPersonalizedFeed(
  viewerId: number | undefined,
  limit: number,
  cursor: { score: number; id: number } | null,
): Promise<FeedRow[]> {
  const viewerIdSql = viewerId !== undefined ? sql`${viewerId}` : sql`NULL::int`;

  const cursorCondition = cursor
    ? sql`WHERE f.score < ${cursor.score} OR (f.score = ${cursor.score} AND f.id < ${cursor.id})`
    : sql``;

  const viewerHasLikedExpr = viewerId !== undefined
    ? sql`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = p.id AND likes.user_id = ${viewerId})`
    : sql`false`;

  const viewerHasSavedExpr = viewerId !== undefined
    ? sql`EXISTS(SELECT 1 FROM saves WHERE saves.post_id = p.id AND saves.user_id = ${viewerId})`
    : sql`false`;

  const viewerIsFollowingExpr = viewerId !== undefined
    ? sql`EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = ${viewerId} AND follows.following_id = p.user_id)`
    : sql`false`;

  const result = await db.execute(sql`
    WITH
    user_views AS (
      SELECT
        genre,
        watch_duration_ms * EXP(
          -GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)), 0) / 86400.0
        ) AS decayed_ms
      FROM post_views
      WHERE user_id = ${viewerIdSql}
      ORDER BY created_at DESC
      LIMIT 500
    ),
    genre_totals AS (
      SELECT genre, SUM(decayed_ms) AS genre_ms
      FROM user_views
      WHERE genre IS NOT NULL
      GROUP BY genre
    ),
    total_watch AS (
      SELECT
        COALESCE(SUM(genre_ms), 0) AS total_ms,
        COUNT(DISTINCT genre)        AS genre_count
      FROM genre_totals
    ),
    genre_affinity AS (
      SELECT
        gt.genre,
        gt.genre_ms / NULLIF(tw.total_ms, 0) AS affinity
      FROM genre_totals gt
      CROSS JOIN total_watch tw
    ),
    f AS (
      SELECT
        p.id,
        p.user_id,
        p.video_url,
        p.thumbnail_url,
        p.title,
        p.caption,
        p.performance_type,
        p.genre,
        p.language,
        p.musixmatch_track_id,
        p.track_title,
        p.track_artist,
        p.lyric_section_id,
        p.rights_confirmed,
        p.golden_mic_count,
        p.created_at,
        u.id              AS creator_id,
        u.username        AS creator_username,
        u.display_name    AS creator_display_name,
        u.avatar_url      AS creator_avatar_url,
        (SELECT COUNT(*) FROM likes    WHERE likes.post_id    = p.id)::int                                           AS likes_count,
        (SELECT COUNT(*) FROM comments WHERE comments.post_id = p.id AND comments.deleted_at IS NULL)::int          AS comments_count,
        (SELECT COUNT(*) FROM saves    WHERE saves.post_id    = p.id)::int                                           AS saves_count,
        (${viewerHasLikedExpr})      AS viewer_has_liked,
        (${viewerHasSavedExpr})      AS viewer_has_saved,
        (${viewerIsFollowingExpr})   AS viewer_is_following,
        (
          COALESCE(
            ga.affinity,
            CASE
              WHEN (SELECT total_ms FROM total_watch) > 0
                THEN LEAST(1.0, 1.0 / NULLIF((SELECT genre_count FROM total_watch)::float, 0))
              ELSE 1.0
            END
          ) * 0.5
          + (1.0 / (1.0 + GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 604800.0, 0))) * 0.3
          + LEAST(1.0, (
              (SELECT COUNT(*) FROM likes WHERE likes.post_id = p.id) +
              (SELECT COUNT(*) FROM saves WHERE saves.post_id = p.id) +
              p.golden_mic_count * 2
            )::float / 50.0) * 0.2
        ) AS score
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN genre_affinity ga ON p.genre = ga.genre
      WHERE p.deleted_at IS NULL
    )
    SELECT * FROM f
    ${cursorCondition}
    ORDER BY f.score DESC, f.id DESC
    LIMIT ${limit + 1}
  `);

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r["id"]),
    userId: Number(r["user_id"]),
    videoUrl: r["video_url"] as string,
    thumbnailUrl: (r["thumbnail_url"] as string | null) ?? null,
    title: r["title"] as string,
    caption: (r["caption"] as string | null) ?? null,
    performanceType: r["performance_type"] as string,
    genre: (r["genre"] as string | null) ?? null,
    language: (r["language"] as string | null) ?? null,
    musixmatchTrackId: (r["musixmatch_track_id"] as string | null) ?? null,
    trackTitle: (r["track_title"] as string | null) ?? null,
    trackArtist: (r["track_artist"] as string | null) ?? null,
    lyricSectionId: (r["lyric_section_id"] as string | null) ?? null,
    rightsConfirmed: Boolean(r["rights_confirmed"]),
    goldenMicCount: Number(r["golden_mic_count"]),
    createdAt: r["created_at"] as Date,
    creator: {
      id: Number(r["creator_id"]),
      username: r["creator_username"] as string,
      displayName: r["creator_display_name"] as string,
      avatarUrl: (r["creator_avatar_url"] as string | null) ?? null,
    },
    likesCount: Number(r["likes_count"]),
    commentsCount: Number(r["comments_count"]),
    savesCount: Number(r["saves_count"]),
    viewerHasLiked: Boolean(r["viewer_has_liked"]),
    viewerHasSaved: Boolean(r["viewer_has_saved"]),
    viewerIsFollowing: Boolean(r["viewer_is_following"]),
    score: Number(r["score"]),
  }));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/posts", optionalAuth, async (req, res): Promise<void> => {
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const userIdRaw = req.query.userId as string | undefined;
  const feed = req.query.feed as string | undefined;

  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const filterUserId = userIdRaw ? parseInt(userIdRaw, 10) : undefined;
  const viewerId = req.userIdOptional;

  const usePersonalized = !filterUserId && feed !== "following";

  if (usePersonalized) {
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

    const rows = await fetchPersonalizedFeed(viewerId, limit, cursor);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.score, lastItem.id) : null;

    res.json({ items, nextCursor });
    return;
  }

  // Chronological path: following feed or user-specific feed
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

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
  const nextCursor = hasMore ? String(items[items.length - 1].id) : null;

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

router.get("/posts/:id", optionalAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const viewerId = req.userIdOptional;

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
    .where(and(eq(postsTable.id, postId), isNull(postsTable.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// View tracking
// ---------------------------------------------------------------------------

const MAX_WATCH_DURATION_MS = 65_000;

router.post("/posts/:id/view", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const body = req.body as { watchDurationMs?: unknown };
  const rawMs = typeof body.watchDurationMs === "number" ? body.watchDurationMs : 0;
  const watchDurationMs = Math.max(0, Math.min(Math.round(rawMs), MAX_WATCH_DURATION_MS));

  const [post] = await db
    .select({ id: postsTable.id, genre: postsTable.genre })
    .from(postsTable)
    .where(and(eq(postsTable.id, postId), isNull(postsTable.deletedAt)))
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  await Promise.all([
    db.insert(postViewsTable).values({
      userId: req.userId,
      postId,
      watchDurationMs,
      genre: post.genre,
    }),
    db
      .update(postsTable)
      .set({ viewCount: sql`view_count + 1` })
      .where(eq(postsTable.id, postId)),
  ]);

  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

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

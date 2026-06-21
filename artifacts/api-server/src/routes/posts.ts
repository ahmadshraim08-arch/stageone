import { Router, type IRouter } from "express";
import { db, postsTable, usersTable, likesTable, followsTable, goldenMicTransactionsTable, postViewsTable } from "@workspace/db";
import { eq, desc, isNull, and, lt, inArray, sql, gte } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { createNotification } from "../lib/notifications";
import { signVideoGetUrl } from "../lib/objectStorage";
import { generateVideoThumbnail } from "../lib/videoThumbnail";

/**
 * Re-sign a video URL for private-bucket objects.
 * Falls back to the stored URL if objectKey is absent or signing fails.
 */
async function freshenVideoUrl(videoUrl: string, videoObjectKey: string | null): Promise<string> {
  if (!videoObjectKey) return videoUrl;
  try {
    const slash = videoObjectKey.indexOf("/");
    if (slash === -1) return videoUrl;
    const bucket = videoObjectKey.slice(0, slash);
    const objectName = videoObjectKey.slice(slash + 1);
    return await signVideoGetUrl(bucket, objectName);
  } catch {
    return videoUrl;
  }
}

/**
 * Resolve the trusted bucket + video object prefix from the server-controlled
 * PRIVATE_OBJECT_DIR. Returns null if storage is not configured.
 *
 * PRIVATE_OBJECT_DIR example: /replit-objstore-abc123/.private
 *   → expectedBucket    = "replit-objstore-abc123"
 *   → videoObjectPrefix = ".private/videos/"
 */
function getExpectedVideoPrefix(): { expectedBucket: string; videoObjectPrefix: string } | null {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) return null;
  const stripped = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = stripped.indexOf("/");
  const expectedBucket = firstSlash === -1 ? stripped : stripped.slice(0, firstSlash);
  const privatePath = firstSlash === -1 ? "" : stripped.slice(firstSlash + 1);
  const videoObjectPrefix = privatePath ? `${privatePath}/videos/` : "videos/";
  return { expectedBucket, videoObjectPrefix };
}

/**
 * Sign a GET URL for a video object ONLY if its key matches the server-controlled
 * bucket + video prefix. Returns null for any key outside the trusted prefix.
 *
 * Security: thumbnail generation feeds this URL to ffmpeg. Never derive the ffmpeg
 * input from a client-supplied URL — only from a validated, server-minted object key.
 * This prevents SSRF via arbitrary URLs/protocols in the post-creation request.
 */
async function signValidatedVideoGetUrl(videoObjectKey: string): Promise<string | null> {
  const prefix = getExpectedVideoPrefix();
  if (!prefix) return null;
  const slash = videoObjectKey.indexOf("/");
  if (slash === -1) return null;
  const bucket = videoObjectKey.slice(0, slash);
  const objectName = videoObjectKey.slice(slash + 1);
  if (bucket !== prefix.expectedBucket || !objectName.startsWith(prefix.videoObjectPrefix)) {
    return null;
  }
  return await signVideoGetUrl(bucket, objectName);
}

/**
 * Re-sign a stored thumbnail URL for private-bucket objects.
 * Falls back to the stored URL if objectKey is absent or signing fails.
 */
async function freshenThumbnailUrl(
  thumbnailUrl: string | null,
  thumbnailObjectKey: string | null,
): Promise<string | null> {
  if (!thumbnailObjectKey) return thumbnailUrl;
  try {
    const slash = thumbnailObjectKey.indexOf("/");
    if (slash === -1) return thumbnailUrl;
    const bucket = thumbnailObjectKey.slice(0, slash);
    const objectName = thumbnailObjectKey.slice(slash + 1);
    return await signVideoGetUrl(bucket, objectName);
  } catch {
    return thumbnailUrl;
  }
}

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
  videoObjectKey: string | null;
  thumbnailUrl: string | null;
  thumbnailObjectKey: string | null;
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
        p.video_object_key,
        p.thumbnail_url,
        p.thumbnail_object_key,
        p.title,
        p.caption,
        p.performance_type,
        p.genre,
        p.genre_detection_source,
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
    videoObjectKey: (r["video_object_key"] as string | null) ?? null,
    thumbnailUrl: (r["thumbnail_url"] as string | null) ?? null,
    thumbnailObjectKey: (r["thumbnail_object_key"] as string | null) ?? null,
    title: r["title"] as string,
    caption: (r["caption"] as string | null) ?? null,
    performanceType: r["performance_type"] as string,
    genre: (r["genre"] as string | null) ?? null,
    genreDetectionSource: (r["genre_detection_source"] as string | null) ?? null,
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

    const signedItems = await Promise.all(
      items.map(async (item) => ({
        ...item,
        videoUrl: await freshenVideoUrl(item.videoUrl, item.videoObjectKey),
        thumbnailUrl: await freshenThumbnailUrl(item.thumbnailUrl, item.thumbnailObjectKey),
      })),
    );
    res.json({ items: signedItems, nextCursor });
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

  const signedItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      videoUrl: await freshenVideoUrl(item.videoUrl, item.videoObjectKey),
      thumbnailUrl: await freshenThumbnailUrl(item.thumbnailUrl, item.thumbnailObjectKey),
    })),
  );
  res.json({ items: signedItems, nextCursor });
});

router.post("/posts", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as {
    videoUrl?: string;
    videoObjectKey?: string;
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
    lyricSectionLabel?: string;
    lyricSectionStartMs?: number;
    lyricSectionEndMs?: number;
    lyricSectionStartLine?: number;
    lyricSectionEndLine?: number;
    lyricTimingMode?: string;
    lyricTimingOffsetMs?: number;
    lyricTimingAnchors?: Record<string, unknown>[] | null;
    lyricStartWord?: number;
    lyricEndWord?: number;
    rightsConfirmed?: boolean;
    // AI analysis fields
    analysisJobId?: string;
    detectedTrackId?: string;
    songMatchConfidence?: number;
    vocalIsolationUsed?: boolean;
    transcriptionSource?: string;
    cyaniteGenre?: string;
    cyaniteMoods?: string[];
    cyaniteEnergy?: string;
    audioAnalysisSource?: string;
    genreDetectionSource?: string;
    genreConfidence?: number;
    languageDetectionSource?: string;
    languageConfidence?: number;
    creatorOverrodeGenre?: boolean;
    creatorOverrodeLanguage?: boolean;
  };

  if (!body.videoUrl || !body.title || !body.performanceType) {
    res.status(400).json({ error: "videoUrl, title, and performanceType are required" });
    return;
  }

  // Generate a thumbnail by extracting a frame from the uploaded video.
  // Best-effort: never block post creation if ffmpeg/GCS is unavailable.
  // Prefer a client-supplied thumbnailUrl if one was provided.
  let thumbnailUrl: string | null = body.thumbnailUrl ?? null;
  let thumbnailObjectKey: string | null = null;
  if (!thumbnailUrl && body.videoObjectKey) {
    try {
      // Derive the ffmpeg input URL server-side from the validated object key.
      // Never feed the client-supplied videoUrl to ffmpeg (SSRF risk).
      const signedVideoUrl = await signValidatedVideoGetUrl(body.videoObjectKey);
      if (signedVideoUrl) {
        const thumb = await generateVideoThumbnail(signedVideoUrl);
        if (thumb) {
          thumbnailUrl = thumb.signedUrl;
          thumbnailObjectKey = thumb.objectKey;
        }
      } else {
        req.log.warn(
          { videoObjectKey: body.videoObjectKey },
          "Skipping thumbnail — videoObjectKey failed prefix validation",
        );
      }
    } catch (err) {
      req.log.error({ err }, "Thumbnail generation failed — proceeding without thumbnail");
    }
  }

  const [post] = await db
    .insert(postsTable)
    .values({
      userId: req.userId,
      videoUrl: body.videoUrl,
      videoObjectKey: body.videoObjectKey ?? null,
      thumbnailUrl,
      thumbnailObjectKey,
      title: body.title,
      caption: body.caption ?? null,
      performanceType: body.performanceType,
      genre: body.genre ?? null,
      language: body.language ?? null,
      musixmatchTrackId: body.musixmatchTrackId ?? body.detectedTrackId ?? null,
      trackTitle: body.trackTitle ?? null,
      trackArtist: body.trackArtist ?? null,
      lyricSectionId: body.lyricSectionId ?? null,
      lyricSectionLabel: body.lyricSectionLabel ?? null,
      lyricSectionStartMs: body.lyricSectionStartMs ?? null,
      lyricSectionEndMs: body.lyricSectionEndMs ?? null,
      lyricSectionStartLine: body.lyricSectionStartLine ?? null,
      lyricSectionEndLine: body.lyricSectionEndLine ?? null,
      lyricTimingMode: body.lyricTimingMode ?? null,
      lyricTimingOffsetMs: body.lyricTimingOffsetMs ?? null,
      lyricTimingAnchors: body.lyricTimingAnchors ?? null,
      lyricStartWord: body.lyricStartWord ?? null,
      lyricEndWord: body.lyricEndWord ?? null,
      rightsConfirmed: body.rightsConfirmed ?? false,
      // AI analysis fields
      analysisJobId: body.analysisJobId ?? null,
      songMatchConfidence: body.songMatchConfidence ?? null,
      vocalIsolationUsed: body.vocalIsolationUsed ?? null,
      transcriptionSource: body.transcriptionSource ?? null,
      cyaniteGenre: body.cyaniteGenre ?? null,
      cyaniteMoods: body.cyaniteMoods ?? null,
      cyaniteEnergy: body.cyaniteEnergy ?? null,
      audioAnalysisSource: body.audioAnalysisSource ?? null,
      genreDetectionSource: body.genreDetectionSource ?? null,
      genreConfidence: body.genreConfidence ?? null,
      languageDetectionSource: body.languageDetectionSource ?? null,
      languageConfidence: body.languageConfidence ?? null,
      creatorOverrodeGenre: body.creatorOverrodeGenre ?? null,
      creatorOverrodeLanguage: body.creatorOverrodeLanguage ?? null,
    })
    .returning();

  res.status(201).json(post);
});

router.get("/users/me/posts", requireAuth, async (req, res): Promise<void> => {
  const ownerId = req.userId;
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;

  const limit = Math.min(parseInt(limitRaw ?? "50", 10) || 50, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

  const conditions = [isNull(postsTable.deletedAt), eq(postsTable.userId, ownerId)];
  if (cursor !== undefined && !isNaN(cursor)) conditions.push(lt(postsTable.id, cursor));

  const rows = await db
    .select({
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
      viewerHasLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${postsTable.id} AND likes.user_id = ${ownerId})`,
      viewerHasSaved: sql<boolean>`EXISTS(SELECT 1 FROM saves WHERE saves.post_id = ${postsTable.id} AND saves.user_id = ${ownerId})`,
      viewerIsFollowing: sql<boolean>`false`,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(postsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1].id) : null;

  const signedItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      videoUrl: await freshenVideoUrl(item.videoUrl, item.videoObjectKey),
      thumbnailUrl: await freshenThumbnailUrl(item.thumbnailUrl, item.thumbnailObjectKey),
    })),
  );

  res.json({ items: signedItems, nextCursor });
});

router.patch("/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const body = req.body as {
    title?: string;
    caption?: string;
    genre?: string;
    language?: string;
    musixmatchTrackId?: string;
    trackTitle?: string;
    trackArtist?: string;
  };

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

  const updates = {
    ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    ...(body.caption !== undefined ? { caption: body.caption } : {}),
    ...(body.genre !== undefined ? { genre: body.genre } : {}),
    ...(body.language !== undefined ? { language: body.language } : {}),
    ...(body.musixmatchTrackId !== undefined ? { musixmatchTrackId: body.musixmatchTrackId } : {}),
    ...(body.trackTitle !== undefined ? { trackTitle: body.trackTitle } : {}),
    ...(body.trackArtist !== undefined ? { trackArtist: body.trackArtist } : {}),
  };

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  await db.update(postsTable).set(updates).where(eq(postsTable.id, postId));

  // Return the updated post so clients can apply server-confirmed values
  const [updated] = await db
    .select({
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
      viewerHasLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${postsTable.id} AND likes.user_id = ${req.userId})`,
      viewerHasSaved: sql<boolean>`EXISTS(SELECT 1 FROM saves WHERE saves.post_id = ${postsTable.id} AND saves.user_id = ${req.userId})`,
      viewerIsFollowing: sql<boolean>`false`,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.userId, usersTable.id))
    .where(eq(postsTable.id, postId))
    .limit(1);

  res.json({
    ...updated,
    thumbnailUrl: await freshenThumbnailUrl(updated.thumbnailUrl, updated.thumbnailObjectKey),
  });
});

router.delete("/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [existing] = await db
    .select({ userId: postsTable.userId, deletedAt: postsTable.deletedAt, videoObjectKey: postsTable.videoObjectKey })
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

  // Best-effort GCS cleanup — does not block the response
  if (existing.videoObjectKey) {
    void (async () => {
      try {
        const slash = existing.videoObjectKey!.indexOf("/");
        if (slash !== -1) {
          const { objectStorageClient } = await import("../lib/objectStorage");
          const bucketName = existing.videoObjectKey!.slice(0, slash);
          const objectName = existing.videoObjectKey!.slice(slash + 1);
          await objectStorageClient.bucket(bucketName).file(objectName).delete();
        }
      } catch {
        // Non-fatal: object may already be gone or sidecar unavailable
      }
    })();
  }

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

  const row = rows[0];
  res.json({
    ...row,
    videoUrl: await freshenVideoUrl(row.videoUrl, row.videoObjectKey),
    thumbnailUrl: await freshenThumbnailUrl(row.thumbnailUrl, row.thumbnailObjectKey),
  });
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

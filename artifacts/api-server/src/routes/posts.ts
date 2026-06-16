import { Router, type IRouter } from "express";
import { db, postsTable, usersTable } from "@workspace/db";
import { eq, desc, isNull, and, lt } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/posts", async (req, res): Promise<void> => {
  const limitRaw = req.query.limit as string | undefined;
  const cursorRaw = req.query.cursor as string | undefined;
  const userIdRaw = req.query.userId as string | undefined;

  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;
  const filterUserId = userIdRaw ? parseInt(userIdRaw, 10) : undefined;

  const conditions = [isNull(postsTable.deletedAt)];
  if (filterUserId && !isNaN(filterUserId)) conditions.push(eq(postsTable.userId, filterUserId));
  if (cursor && !isNaN(cursor)) conditions.push(lt(postsTable.id, cursor));

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
      createdAt: postsTable.createdAt,
      creator: {
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      },
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

export default router;

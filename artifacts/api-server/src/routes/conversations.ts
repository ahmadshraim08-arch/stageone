import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT
      c.id,
      c.created_at,
      u.id            AS other_user_id,
      u.username      AS other_username,
      u.display_name  AS other_display_name,
      u.avatar_url    AS other_avatar_url,
      lm.body         AS last_message_body,
      lm.sent_at      AS last_message_at,
      COALESCE(unread.cnt, 0)::int AS unread_count
    FROM conversations c
    JOIN conversation_participants cp_me
      ON cp_me.conversation_id = c.id AND cp_me.user_id = ${req.userId}
    JOIN conversation_participants cp_other
      ON cp_other.conversation_id = c.id AND cp_other.user_id != ${req.userId}
    JOIN users u ON u.id = cp_other.user_id
    LEFT JOIN LATERAL (
      SELECT body, sent_at
      FROM messages
      WHERE conversation_id = c.id
      ORDER BY sent_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM messages
      WHERE conversation_id = c.id
        AND sender_id != ${req.userId}
        AND read_at IS NULL
    ) unread ON true
    ORDER BY lm.sent_at DESC NULLS LAST, c.created_at DESC
  `);

  const items = (result.rows as unknown as any[]).map((r) => ({
    id: r.id as number,
    createdAt: r.created_at as string,
    otherUser: {
      id: r.other_user_id as number,
      username: r.other_username as string,
      displayName: r.other_display_name as string,
      avatarUrl: (r.other_avatar_url as string | null) ?? null,
    },
    lastMessage:
      r.last_message_body != null
        ? {
            body: r.last_message_body as string,
            sentAt: r.last_message_at as string,
          }
        : null,
    unreadCount: r.unread_count as number,
  }));

  res.json({ items });
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as { recipientId?: unknown };

  const recipientId = Number(body.recipientId);
  if (!body.recipientId || isNaN(recipientId)) {
    res.status(400).json({ error: "recipientId is required" });
    return;
  }

  if (recipientId === req.userId) {
    res
      .status(400)
      .json({ error: "Cannot create a conversation with yourself" });
    return;
  }

  const [recipient] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, recipientId))
    .limit(1);

  if (!recipient) {
    res.status(404).json({ error: "Recipient user not found" });
    return;
  }

  const lockA = Math.min(req.userId, recipientId);
  const lockB = Math.max(req.userId, recipientId);

  let convId: number;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockA}, ${lockB})`);

    const existing = await tx.execute(sql`
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp1
        ON cp1.conversation_id = c.id AND cp1.user_id = ${req.userId}
      JOIN conversation_participants cp2
        ON cp2.conversation_id = c.id AND cp2.user_id = ${recipientId}
      LIMIT 1
    `);

    const existingRows = existing.rows as unknown as Array<{ id: number }>;
    if (existingRows.length > 0) {
      convId = existingRows[0].id;
      return;
    }

    const [conv] = await tx
      .insert(conversationsTable)
      .values({})
      .returning({ id: conversationsTable.id });

    await tx.insert(conversationParticipantsTable).values([
      { conversationId: conv.id, userId: req.userId },
      { conversationId: conv.id, userId: recipientId },
    ]);

    convId = conv.id;
  });

  res.status(201).json({ id: convId! });
});

async function assertParticipant(
  conversationId: number,
  userId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationParticipantsTable.id })
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, userId),
      ),
    )
    .limit(1);
  return !!row;
}

router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversationId = parseInt(raw, 10);

    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    const isMember = await assertParticipant(conversationId, req.userId);
    if (!isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const limitRaw = req.query.limit as string | undefined;
    const cursorRaw = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(limitRaw ?? "50", 10) || 50, 100);
    const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;

    const conditions = [eq(messagesTable.conversationId, conversationId)];
    if (cursor && !isNaN(cursor)) conditions.push(lt(messagesTable.id, cursor));

    const rows = await db
      .select()
      .from(messagesTable)
      .where(and(...conditions))
      .orderBy(desc(messagesTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({ items, nextCursor });
  },
);

router.post(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversationId = parseInt(raw, 10);

    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    const isMember = await assertParticipant(conversationId, req.userId);
    if (!isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = req.body as {
      type?: string;
      text?: string;
      musicMinuteId?: string;
    };

    const msgType = body.type ?? "text";
    if (msgType !== "text" && msgType !== "music_minute_share") {
      res
        .status(400)
        .json({ error: "type must be 'text' or 'music_minute_share'" });
      return;
    }

    if (msgType === "text" && !body.text?.trim()) {
      res.status(400).json({ error: "text is required for text messages" });
      return;
    }

    if (msgType === "music_minute_share" && !body.musicMinuteId) {
      res
        .status(400)
        .json({ error: "musicMinuteId is required for music_minute_share" });
      return;
    }

    const messageBody = JSON.stringify({
      type: msgType,
      ...(body.text ? { text: body.text } : {}),
      ...(body.musicMinuteId ? { musicMinuteId: body.musicMinuteId } : {}),
    });

    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId,
        senderId: req.userId,
        body: messageBody,
      })
      .returning();

    if (msgType === "music_minute_share") {
      const participants = await db
        .select({ userId: conversationParticipantsTable.userId })
        .from(conversationParticipantsTable)
        .where(
          eq(conversationParticipantsTable.conversationId, conversationId),
        );

      for (const p of participants) {
        if (p.userId !== req.userId) {
          await createNotification(
            "music_minute_share",
            p.userId,
            req.userId,
            null,
          );
        }
      }
    }

    res.status(201).json(message);
  },
);

router.post(
  "/conversations/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversationId = parseInt(raw, 10);

    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    const isMember = await assertParticipant(conversationId, req.userId);
    if (!isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.execute(sql`
      UPDATE messages
      SET read_at = NOW()
      WHERE conversation_id = ${conversationId}
        AND sender_id != ${req.userId}
        AND read_at IS NULL
    `);

    res.sendStatus(204);
  },
);

export default router;

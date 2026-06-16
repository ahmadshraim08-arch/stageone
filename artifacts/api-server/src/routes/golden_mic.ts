import { Router, type IRouter } from "express";
import { db, goldenMicTransactionsTable, postsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.post("/posts/:postId/golden-mic", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  const postId = parseInt(raw, 10);

  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const body = req.body as { amount?: unknown };
  const amount = Number(body.amount ?? 1);

  if (isNaN(amount) || amount < 1 || !Number.isInteger(amount)) {
    res.status(400).json({ error: "amount must be a positive integer" });
    return;
  }

  const [post] = await db
    .select({ id: postsTable.id, userId: postsTable.userId, deletedAt: postsTable.deletedAt })
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1);

  if (!post || post.deletedAt !== null) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (post.userId === req.userId) {
    res.status(400).json({ error: "Cannot give a Golden Mic to your own post" });
    return;
  }

  let insufficientBalance = false;

  await db.transaction(async (tx) => {
    const [sender] = await tx
      .select({ goldenMicBalance: usersTable.goldenMicBalance })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId))
      .limit(1);

    if (!sender || (sender.goldenMicBalance ?? 0) < amount) {
      insufficientBalance = true;
      return;
    }

    await tx
      .update(usersTable)
      .set({ goldenMicBalance: sql`${usersTable.goldenMicBalance} - ${amount}` })
      .where(eq(usersTable.id, req.userId));

    await tx
      .update(usersTable)
      .set({ goldenMicBalance: sql`${usersTable.goldenMicBalance} + ${amount}` })
      .where(eq(usersTable.id, post.userId));

    await tx.insert(goldenMicTransactionsTable).values({
      fromUserId: req.userId,
      toUserId: post.userId,
      postId,
      amount,
    });
  });

  if (insufficientBalance) {
    res.status(402).json({ error: "Insufficient Golden Mic balance" });
    return;
  }

  await createNotification("golden_mic", post.userId, req.userId, postId);

  res.sendStatus(201);
});

export default router;

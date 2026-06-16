import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);

  if (existing) {
    req.userId = existing.id;
    next();
    return;
  }

  const username = `user_${clerkId.slice(-8)}`;
  const [created] = await db
    .insert(usersTable)
    .values({
      clerkId,
      username,
      displayName: username,
    })
    .onConflictDoUpdate({
      target: usersTable.clerkId,
      set: { clerkId },
    })
    .returning({ id: usersTable.id });

  req.userId = created.id;
  next();
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    next();
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);

  if (existing) {
    req.userIdOptional = existing.id;
    next();
    return;
  }

  const username = `user_${clerkId.slice(-8)}`;
  const [created] = await db
    .insert(usersTable)
    .values({
      clerkId,
      username,
      displayName: username,
    })
    .onConflictDoUpdate({
      target: usersTable.clerkId,
      set: { clerkId },
    })
    .returning({ id: usersTable.id });

  req.userIdOptional = created.id;
  next();
}

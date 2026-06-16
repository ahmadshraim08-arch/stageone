/**
 * Analysis job endpoints.
 *
 * POST   /api/analysis/jobs         — create job, start pipeline
 * GET    /api/analysis/jobs/:id     — poll job status (owner only)
 * DELETE /api/analysis/jobs/:id     — cancel job + cleanup
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { runPipeline } from "../lib/analysisPipeline.js";

const router: IRouter = Router();

const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function validateObjectKey(objectKey: string): boolean {
  const privateDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  const stripped = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const slash = stripped.indexOf("/");
  const expectedBucket = slash === -1 ? stripped : stripped.slice(0, slash);
  const privatePath = slash === -1 ? "" : stripped.slice(slash + 1);
  const expectedPrefix = privatePath ? `${privatePath}/videos/` : "videos/";

  const keySlash = objectKey.indexOf("/");
  if (keySlash === -1) return false;
  const bucket = objectKey.slice(0, keySlash);
  const obj = objectKey.slice(keySlash + 1);
  return bucket === expectedBucket && obj.startsWith(expectedPrefix);
}

router.post("/analysis/jobs", requireAuth, async (req, res): Promise<void> => {
  const {
    videoObjectKey,
    performanceType = "cover",
    artistHint,
    titleHint,
  } = req.body as {
    videoObjectKey?: string;
    performanceType?: string;
    artistHint?: string;
    titleHint?: string;
  };

  if (!videoObjectKey || typeof videoObjectKey !== "string") {
    res.status(400).json({ error: "videoObjectKey is required" });
    return;
  }
  if (!validateObjectKey(videoObjectKey)) {
    res.status(400).json({ error: "Invalid videoObjectKey" });
    return;
  }

  const jobId = randomUUID();
  const expiresAt = new Date(Date.now() + JOB_TTL_MS);

  await db.insert(analysisJobsTable).values({
    id: jobId,
    userId: req.userId,
    videoObjectKey,
    stage: "preparing",
    progressPct: 0,
    status: "running",
    retryable: false,
    expiresAt,
  });

  res.status(202).json({ jobId, status: "running", stage: "preparing", progressPct: 0 });

  runPipeline(
    jobId,
    req.userId,
    videoObjectKey,
    performanceType,
    artistHint ?? undefined,
    titleHint ?? undefined,
  ).catch(err => {
    req.log.error({ err, jobId }, "Analysis pipeline uncaught error");
  });
});

router.get("/analysis/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const rows = await db
    .select()
    .from(analysisJobsTable)
    .where(and(eq(analysisJobsTable.id, jobId), eq(analysisJobsTable.userId, req.userId)))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const job = rows[0];

  const resultPayload = job.result
    ? sanitizeResult(job.result as Record<string, unknown>)
    : null;

  res.json({
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    progressPct: job.progressPct,
    retryable: job.retryable,
    stageErrors: job.perStageErrors ?? {},
    result: resultPayload,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
  });
});

router.delete("/analysis/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const rows = await db
    .select({ id: analysisJobsTable.id, status: analysisJobsTable.status })
    .from(analysisJobsTable)
    .where(and(eq(analysisJobsTable.id, jobId), eq(analysisJobsTable.userId, req.userId)))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const job = rows[0];
  if (job.status === "canceled") {
    res.sendStatus(204);
    return;
  }

  await db
    .update(analysisJobsTable)
    .set({ status: "canceled", stage: "canceled" })
    .where(eq(analysisJobsTable.id, jobId));

  res.sendStatus(204);
});

function sanitizeResult(result: Record<string, unknown>): Record<string, unknown> {
  const out = { ...result };
  delete out["transcriptWords"];
  delete out["allLines"];
  return out;
}

export default router;

import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res): Promise<void> => {
  let dbOk = false;
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    dbOk = true;
  } catch (err) {
    req.log.warn({ err }, "DB health check failed");
  }

  const musixmatchConfigured = Boolean(process.env.MUSIXMATCH_API_KEY);

  res.status(dbOk ? 200 : 503).json({
    api: "ok",
    db: dbOk ? "ok" : "error",
    musixmatch: musixmatchConfigured ? "configured" : "not configured",
  });
});

export default router;

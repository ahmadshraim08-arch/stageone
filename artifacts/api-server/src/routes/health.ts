import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/** Quick smoke-test: can we call the sidecar to get a signed URL? */
async function checkStorageHealth(): Promise<{ ok: boolean; code: string }> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    return { ok: false, code: "STORAGE_NOT_CONFIGURED" };
  }
  const stripped = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = stripped.indexOf("/");
  const bucketName = firstSlash === -1 ? stripped : stripped.slice(0, firstSlash);
  const privatePath = firstSlash === -1 ? "" : stripped.slice(firstSlash + 1);
  const objectName = `${privatePath}/health-test-probe.mp4`;
  try {
    const resp = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          object_name: objectName,
          method: "PUT",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!resp.ok) return { ok: false, code: `STORAGE_SIGNING_FAILED:${resp.status}` };
    const body = (await resp.json()) as { signed_url?: string };
    if (!body.signed_url) return { ok: false, code: "STORAGE_SIGNING_FAILED:NO_URL" };
    return { ok: true, code: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, code: `STORAGE_SIDECAR_UNAVAILABLE:${msg.slice(0, 80)}` };
  }
}

/** Quick smoke-test of each partner API: just check whether the key/secret is configured. */
function checkPartnerKeys(): {
  musixmatch: string;
  elevenlabs: string;
  lalalai: string;
  cyanite: string;
} {
  return {
    musixmatch: process.env.MUSIXMATCH_API_KEY ? "configured" : "not_configured",
    elevenlabs: process.env.ELEVENLABS_API_KEY ? "configured" : "not_configured",
    lalalai: process.env.LALALAI_API_KEY ? "configured" : "not_configured",
    cyanite:
      process.env.CYANITE_CLIENT_ID && process.env.CYANITE_CLIENT_SECRET
        ? "configured"
        : "not_configured",
  };
}

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

  const storage = await checkStorageHealth();
  const partners = checkPartnerKeys();

  const ok = dbOk && storage.ok;
  res.status(ok ? 200 : 503).json({
    api: "ok",
    db: dbOk ? "ok" : "error",
    storage: storage.ok ? "ok" : storage.code,
    partners,
  });
});

export default router;

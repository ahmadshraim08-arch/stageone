import { Router, type IRouter } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { objectStorageClient, signVideoGetUrl, signVideoUploadUrl, signAvatarUploadUrl } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);
const ACCEPTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_SIZE_LIMIT },
  fileFilter(_req, file, cb) {
    if (ACCEPTED_IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image type: ${file.mimetype}. Accepted: jpeg, png, webp`));
    }
  },
});

function parsePath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  return {
    bucketName: parts[1],
    objectName: parts.slice(2).join("/"),
  };
}

/**
 * Derive the expected GCS bucket name and the required object-name prefix for
 * server-minted video keys from PRIVATE_OBJECT_DIR.
 *
 * PRIVATE_OBJECT_DIR example: /replit-objstore-abc123/.private
 *   → expectedBucket      = "replit-objstore-abc123"
 *   → videoObjectPrefix   = ".private/videos/"
 *
 * Only keys matching `${expectedBucket}/${videoObjectPrefix}*` are accepted by
 * the confirm endpoint, preventing a client from making arbitrary GCS objects public.
 */
function getVideoObjectKeyPrefix(): { expectedBucket: string; videoObjectPrefix: string } {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not set");
  // Remove leading slash so we can split on the first segment
  const stripped = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = stripped.indexOf("/");
  const expectedBucket = firstSlash === -1 ? stripped : stripped.slice(0, firstSlash);
  const privatePath = firstSlash === -1 ? "" : stripped.slice(firstSlash + 1);
  const videoObjectPrefix = privatePath ? `${privatePath}/videos/` : "videos/";
  return { expectedBucket, videoObjectPrefix };
}

/**
 * Upload a buffer to GCS and return a signed GET URL + stable object key.
 * Bucket has public access prevention enforced — makePublic() is unavailable.
 * Uses a signed URL (7-day TTL, same as videos). Callers should store the
 * objectKey so they can re-sign on read.
 */
async function uploadToGcs(
  buffer: Buffer,
  contentType: string,
  folder: string,
  ext: string,
): Promise<{ signedUrl: string; objectKey: string }> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not set");
  const objectId = randomUUID();
  const { bucketName, objectName } = parsePath(
    `${privateDir}/${folder}/${Date.now()}-${objectId}${ext}`,
  );
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { metadata: { contentType }, resumable: false });
  const signedUrl = await signVideoGetUrl(bucketName, objectName);
  return { signedUrl, objectKey: `${bucketName}/${objectName}` };
}

/**
 * Step 1 of the two-phase direct-to-GCS video upload.
 * Returns a signed GCS PUT URL that the mobile client uses to upload directly,
 * bypassing the Replit reverse proxy entirely (no proxy timeout / no memory buffer).
 */
router.post(
  "/uploads/video/sign",
  requireAuth,
  async (req, res): Promise<void> => {
    const { mimeType, uploadRequestId } = req.body as {
      mimeType?: string;
      uploadRequestId?: string;
    };
    if (!mimeType || !ACCEPTED_VIDEO_MIMES.has(mimeType)) {
      res.status(415).json({
        error: `Unsupported video type: ${mimeType ?? "(missing)"}. Accepted: video/mp4, video/quicktime, video/x-m4v`,
      });
      return;
    }
    try {
      const { signedUrl, objectKey } = await signVideoUploadUrl(mimeType);
      req.log.info(
        { mime: mimeType, uploadRequestId: uploadRequestId ?? "none" },
        "Video upload URL signed",
      );
      res.status(200).json({ signedUrl, objectKey });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const code = !process.env.PRIVATE_OBJECT_DIR
        ? "STORAGE_NOT_CONFIGURED"
        : errMsg.includes("sidecar") || errMsg.includes("127.0.0.1") || errMsg.includes("fetch")
          ? "STORAGE_SIDECAR_UNAVAILABLE"
          : "STORAGE_SIGNING_FAILED";
      req.log.error(
        { err, code, uploadRequestId: uploadRequestId ?? "none" },
        "Failed to sign video upload URL",
      );
      res.status(503).json({
        error: "Couldn't connect to video storage. Please try again.",
        code,
      });
    }
  },
);

/**
 * Step 2 of the two-phase direct-to-GCS video upload.
 * Verifies the object was uploaded, makes it public, and returns the permanent URL.
 *
 * Security: objectKey is validated against the server-controlled PRIVATE_OBJECT_DIR
 * prefix (bucket name + video path prefix) before any GCS operation is performed.
 * This prevents a client from supplying an arbitrary objectKey and making unrelated
 * GCS objects public.
 */
router.post(
  "/uploads/video/confirm",
  requireAuth,
  async (req, res): Promise<void> => {
    const { objectKey, mimeType, uploadRequestId } = req.body as {
      objectKey?: string;
      mimeType?: string;
      uploadRequestId?: string;
    };
    if (!objectKey || typeof objectKey !== "string" || !objectKey.includes("/")) {
      res.status(400).json({ error: "objectKey is required and must be a valid bucket/path string" });
      return;
    }
    if (!mimeType || !ACCEPTED_VIDEO_MIMES.has(mimeType)) {
      res.status(415).json({ error: "mimeType is required and must be a supported video type" });
      return;
    }

    // ── Security: enforce server-controlled prefix before touching GCS ──────────
    let expectedBucket: string;
    let videoObjectPrefix: string;
    try {
      ({ expectedBucket, videoObjectPrefix } = getVideoObjectKeyPrefix());
    } catch (err) {
      req.log.error({ err }, "PRIVATE_OBJECT_DIR not configured — cannot validate objectKey");
      res.status(503).json({ error: "Storage unavailable. Please try again." });
      return;
    }

    const firstSlash = objectKey.indexOf("/");
    const clientBucket = objectKey.slice(0, firstSlash);
    const clientObjectName = objectKey.slice(firstSlash + 1);

    if (clientBucket !== expectedBucket || !clientObjectName.startsWith(videoObjectPrefix)) {
      req.log.warn(
        { clientBucket, clientObjectName, expectedBucket, videoObjectPrefix, uploadRequestId: uploadRequestId ?? "none" },
        "Rejected confirm — objectKey does not match expected prefix",
      );
      res.status(400).json({ error: "Invalid objectKey" });
      return;
    }

    try {
      const bucket = objectStorageClient.bucket(clientBucket);
      const file = bucket.file(clientObjectName);

      // Retry file.exists() up to 4 times (GCS is eventually consistent after a PUT)
      const RETRY_DELAYS_MS = [500, 1_000, 2_000, 3_000];
      let exists = false;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        const [found] = await file.exists();
        if (found) { exists = true; break; }
        if (attempt < RETRY_DELAYS_MS.length) {
          req.log.info(
            { uploadRequestId: uploadRequestId ?? "none", attempt },
            "Object not yet visible — retrying",
          );
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
      }
      if (!exists) {
        res.status(404).json({
          error: "Upload not found. The upload may not have completed — please retry.",
          code: "UPLOAD_OBJECT_NOT_FOUND",
        });
        return;
      }

      const [metadata] = await file.getMetadata();
      const sizeBytes = Number(metadata.size ?? 0);
      if (sizeBytes === 0) {
        res.status(422).json({
          error: "Upload appears empty. Please try again.",
          code: "UPLOAD_OBJECT_EMPTY",
        });
        return;
      }

      // Bucket has public access prevention enforced — makePublic() is unavailable.
      // Generate a signed GET URL (7-day TTL) for playback instead.
      const videoUrl = await signVideoGetUrl(clientBucket, clientObjectName);

      req.log.info(
        {
          sizeBytes,
          sizeMb: (sizeBytes / 1_048_576).toFixed(2),
          mime: mimeType,
          uploadRequestId: uploadRequestId ?? "none",
        },
        "Video upload confirmed",
      );
      res.status(200).json({ videoUrl, objectKey, thumbnailUrl: null });
    } catch (err) {
      req.log.error({ err, uploadRequestId: uploadRequestId ?? "none" }, "Failed to confirm video upload");
      res.status(503).json({ error: "Couldn't verify your upload. Please try again.", code: "UPLOAD_CONFIRM_FAILED" });
    }
  },
);

/**
 * Step 1 of the two-phase direct-to-GCS avatar upload.
 * Returns a signed GCS PUT URL the mobile client uses to upload directly,
 * bypassing the Replit reverse proxy (mirrors the video sign flow).
 */
router.post(
  "/uploads/avatar/sign",
  requireAuth,
  async (req, res): Promise<void> => {
    const { mimeType } = req.body as { mimeType?: string };
    if (!mimeType || !ACCEPTED_IMAGE_MIMES.has(mimeType)) {
      res.status(415).json({
        error: `Unsupported image type: ${mimeType ?? "(missing)"}. Accepted: jpeg, png, webp`,
      });
      return;
    }
    try {
      const { signedUrl, objectKey } = await signAvatarUploadUrl(mimeType);
      req.log.info({ mime: mimeType }, "Avatar upload URL signed");
      res.status(200).json({ signedUrl, objectKey });
    } catch (err) {
      req.log.error({ err }, "Failed to sign avatar upload URL");
      res.status(503).json({ error: "Couldn't connect to storage. Please try again." });
    }
  },
);

router.post(
  "/uploads/avatar",
  requireAuth,
  (req, res, next) => {
    avatarUpload.single("avatar")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Image exceeds 5 MB limit" });
        return;
      }
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Upload error" });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({
        error: "No image file provided. Send a multipart/form-data request with field 'avatar'.",
      });
      return;
    }

    try {
      const ext =
        req.file.mimetype === "image/png"
          ? ".png"
          : req.file.mimetype === "image/webp"
            ? ".webp"
            : ".jpg";
      const { signedUrl, objectKey } = await uploadToGcs(
        req.file.buffer,
        req.file.mimetype,
        "avatars",
        ext,
      );
      req.log.info(
        { size: req.file.size, mime: req.file.mimetype, objectKey },
        "Avatar uploaded to object storage",
      );
      res.status(201).json({ avatarUrl: signedUrl, avatarObjectKey: objectKey });
    } catch (err) {
      req.log.error({ err }, "Failed to upload avatar to object storage");
      res.status(503).json({ error: "Couldn't upload your photo. Please try again." });
    }
  },
);

export default router;

import { Router, type IRouter } from "express";
import multer from "multer";
import { objectStorageClient, signVideoUploadUrl } from "../lib/objectStorage";
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

async function uploadToGcs(
  buffer: Buffer,
  contentType: string,
  folder: string,
  ext: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not set");
  const { bucketName, objectName } = parsePath(`${privateDir}/${folder}/${Date.now()}${ext}`);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { metadata: { contentType }, resumable: false });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
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
    const { mimeType } = req.body as { mimeType?: string };
    if (!mimeType || !ACCEPTED_VIDEO_MIMES.has(mimeType)) {
      res.status(415).json({
        error: `Unsupported video type: ${mimeType ?? "(missing)"}. Accepted: video/mp4, video/quicktime, video/x-m4v`,
      });
      return;
    }
    try {
      const { signedUrl, objectKey } = await signVideoUploadUrl(mimeType);
      req.log.info({ mime: mimeType }, "Video upload URL signed");
      res.status(200).json({ signedUrl, objectKey });
    } catch (err) {
      req.log.error({ err }, "Failed to sign video upload URL");
      res.status(503).json({ error: "Storage unavailable. Please try again." });
    }
  },
);

/**
 * Step 2 of the two-phase direct-to-GCS video upload.
 * Verifies the object was uploaded, makes it public, and returns the permanent URL.
 */
router.post(
  "/uploads/video/confirm",
  requireAuth,
  async (req, res): Promise<void> => {
    const { objectKey, mimeType } = req.body as { objectKey?: string; mimeType?: string };
    if (!objectKey || typeof objectKey !== "string" || !objectKey.includes("/")) {
      res.status(400).json({ error: "objectKey is required and must be a valid bucket/path string" });
      return;
    }
    if (!mimeType || !ACCEPTED_VIDEO_MIMES.has(mimeType)) {
      res.status(415).json({ error: "mimeType is required and must be a supported video type" });
      return;
    }
    try {
      const slashIdx = objectKey.indexOf("/");
      const bucketName = objectKey.slice(0, slashIdx);
      const objectName = objectKey.slice(slashIdx + 1);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).json({ error: "Uploaded video not found in storage. The upload may not have completed — please retry." });
        return;
      }

      await file.makePublic();

      const [metadata] = await file.getMetadata();
      const videoUrl = `https://storage.googleapis.com/${bucketName}/${objectName}`;
      req.log.info({ size: metadata.size, mime: mimeType }, "Video upload confirmed and made public");
      res.status(200).json({ videoUrl, thumbnailUrl: null });
    } catch (err) {
      req.log.error({ err }, "Failed to confirm video upload");
      res.status(503).json({ error: "Storage unavailable. Please try again." });
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
      res.status(400).json({ error: "No image file provided. Send a multipart/form-data request with field 'avatar'." });
      return;
    }

    try {
      const ext = req.file.mimetype === "image/png" ? ".png" : req.file.mimetype === "image/webp" ? ".webp" : ".jpg";
      const avatarUrl = await uploadToGcs(req.file.buffer, req.file.mimetype, "avatars", ext);
      req.log.info({ size: req.file.size, mime: req.file.mimetype }, "Avatar uploaded to object storage");
      res.status(201).json({ avatarUrl });
    } catch (err) {
      req.log.error({ err }, "Failed to upload avatar to object storage");
      res.status(503).json({ error: "Storage unavailable. Please try again." });
    }
  },
);

export default router;

import { Router, type IRouter } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const VIDEO_SIZE_LIMIT = 200 * 1024 * 1024; // 200 MB
const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024;   // 5 MB

const ACCEPTED_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);
const ACCEPTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_SIZE_LIMIT },
  fileFilter(_req, file, cb) {
    if (ACCEPTED_VIDEO_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported video type: ${file.mimetype}. Accepted: mp4, quicktime`));
    }
  },
});

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

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not set");
  return dir;
}

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
  const privateDir = getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateDir}/${folder}/${objectId}${ext}`;
  const { bucketName, objectName } = parsePath(fullPath);

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });

  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

router.post(
  "/uploads/video",
  requireAuth,
  (req, res, next) => {
    videoUpload.single("video")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Video exceeds 200 MB limit" });
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
      res.status(400).json({ error: "No video file provided. Send a multipart/form-data request with field 'video'." });
      return;
    }

    try {
      const ext = req.file.mimetype === "video/quicktime" ? ".mov" : ".mp4";
      const videoUrl = await uploadToGcs(req.file.buffer, req.file.mimetype, "videos", ext);
      req.log.info({ size: req.file.size, mime: req.file.mimetype }, "Video uploaded to object storage");
      res.status(201).json({ videoUrl, thumbnailUrl: null });
    } catch (err) {
      req.log.error({ err }, "Failed to upload video to object storage");
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

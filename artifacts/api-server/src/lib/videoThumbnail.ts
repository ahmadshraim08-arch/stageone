/**
 * Thumbnail generation from a signed video URL using ffmpeg.
 * Extracts a single frame (~1 second in) and uploads it to GCS as a JPEG.
 * Best-effort: returns null on any failure so post creation is never blocked.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";
import { rm, readFile, stat } from "fs/promises";
import { randomUUID } from "crypto";
import { FFMPEG } from "./audioExtract";
import { uploadThumbnailToGcs } from "./objectStorage";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

const THUMBNAIL_WIDTH = 480;

/**
 * Run ffmpeg to grab a frame from the video at `seekSec` seconds.
 * Uses input seeking (`-ss` before `-i`) so only a small portion of the
 * remote video is fetched. Returns the temp file path or null if no output.
 */
async function grabFrame(signedVideoUrl: string, seekSec: number, outPath: string): Promise<boolean> {
  try {
    await execFileAsync(
      FFMPEG,
      [
        "-y",
        "-ss", String(seekSec),
        "-i", signedVideoUrl,
        "-frames:v", "1",
        "-an", "-sn", "-dn",
        "-vf", `scale=${THUMBNAIL_WIDTH}:-2`,
        "-q:v", "3",
        outPath,
      ],
      { timeout: 45_000 },
    );
  } catch {
    return false;
  }
  try {
    const info = await stat(outPath);
    return info.size > 0;
  } catch {
    return false;
  }
}

/**
 * Generate a thumbnail for a video and store it in GCS.
 * @param signedVideoUrl A signed GET URL ffmpeg can read directly.
 * @returns The stored object key + signed URL, or null on failure.
 */
export async function generateVideoThumbnail(
  signedVideoUrl: string,
): Promise<{ objectKey: string; signedUrl: string } | null> {
  const outPath = join(tmpdir(), `stageone-thumb-${randomUUID()}.jpg`);

  try {
    // Try ~1s in first; fall back to the very first frame for ultra-short clips.
    let ok = await grabFrame(signedVideoUrl, 1, outPath);
    if (!ok) ok = await grabFrame(signedVideoUrl, 0, outPath);
    if (!ok) {
      logger.warn("Thumbnail generation produced no frame");
      return null;
    }

    const buffer = await readFile(outPath);
    const result = await uploadThumbnailToGcs(buffer);
    return result;
  } catch (err) {
    logger.error({ err }, "Failed to generate/upload video thumbnail");
    return null;
  } finally {
    await rm(outPath, { force: true }).catch(() => {});
  }
}

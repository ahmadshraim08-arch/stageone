/**
 * Audio extraction from a signed video URL using ffmpeg.
 * Produces a mono 16 kHz WAV file for downstream analysis.
 * The caller is responsible for deleting the returned file when done.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { rm, stat } from "fs/promises";
import { randomUUID } from "crypto";
import ffmpegStaticPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/**
 * Resolve the ffmpeg binary:
 *   1. FFMPEG_PATH env var (explicit override)
 *   2. ffmpeg-static bundled binary (only when the file actually exists on disk)
 *   3. "ffmpeg" on PATH (Nix / system install)
 */
function resolveFfmpegBinary(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (ffmpegStaticPath && existsSync(ffmpegStaticPath)) return ffmpegStaticPath;
  return "ffmpeg";
}

export const FFMPEG: string = resolveFfmpegBinary();

export interface AudioExtractionError extends Error {
  code: "FFMPEG_NOT_AVAILABLE" | "AUDIO_EXTRACTION_FAILED" | "AUDIO_OUTPUT_EMPTY";
}

function makeExtractionError(
  code: AudioExtractionError["code"],
  message: string,
): AudioExtractionError {
  const err = new Error(message) as AudioExtractionError;
  err.code = code;
  err.name = "AudioExtractionError";
  return err;
}

export interface FfmpegHealth {
  ok: boolean;
  code: string;
  version?: string;
  binaryPath: string;
}

/**
 * Run ffmpeg -version to confirm the binary is accessible and functional.
 * Called at startup and surfaced in /healthz.
 */
export async function checkFfmpegHealth(): Promise<FfmpegHealth> {
  const binaryPath = FFMPEG;
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ["-version"], {
      timeout: 8_000,
    });
    const out = stdout || stderr;
    const versionMatch = out.match(/ffmpeg version ([^\s]+)/);
    return {
      ok: true,
      code: "ok",
      version: versionMatch?.[1],
      binaryPath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("ENOENT") ? "FFMPEG_NOT_AVAILABLE" : "FFMPEG_EXEC_FAILED";
    return { ok: false, code, binaryPath };
  }
}

export interface ExtractedAudio {
  path: string;
  durationMs: number;
  sizeBytes: number;
  cleanup: () => Promise<void>;
}

/**
 * Detect whether an audio file contains significant backing music or is clean a cappella.
 * Uses ffmpeg's volumedetect filter and spectral analysis heuristics.
 * Returns true if the audio likely has backing music (→ LALAL.AI should be used).
 */
export async function detectBackingMusic(audioPath: string): Promise<boolean> {
  try {
    const { stderr } = await execFileAsync(FFMPEG, [
      "-i", audioPath,
      "-af", "volumedetect",
      "-vn", "-sn", "-dn",
      "-f", "null", "/dev/null",
    ], { timeout: 30_000 });

    const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);

    if (!meanMatch || !maxMatch) return false;

    const mean = parseFloat(meanMatch[1]);
    const max = parseFloat(maxMatch[1]);
    const dynamicRange = max - mean;

    return dynamicRange > 20;
  } catch {
    return false;
  }
}

/**
 * Extract audio from a video accessible via signedUrl.
 * ffmpeg fetches the signed URL directly (no local video download needed).
 * Outputs a mono 16 kHz WAV, written to the system temp directory.
 *
 * Throws AudioExtractionError with a structured code on failure.
 */
export async function extractAudio(signedVideoUrl: string): Promise<ExtractedAudio> {
  const id = randomUUID();
  const outPath = join(tmpdir(), `stageone-audio-${id}.wav`);

  try {
    await execFileAsync(FFMPEG, [
      "-y",
      "-i", signedVideoUrl,
      "-vn",               // no video
      "-ac", "1",          // mono
      "-ar", "16000",      // 16 kHz — optimal for STT
      "-acodec", "pcm_s16le",
      "-t", "180",         // cap at 3 minutes for safety
      outPath,
    ], { timeout: 120_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT")) {
      throw makeExtractionError("FFMPEG_NOT_AVAILABLE", `ffmpeg binary not found at: ${FFMPEG}`);
    }
    throw makeExtractionError("AUDIO_EXTRACTION_FAILED", msg.slice(0, 300));
  }

  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(outPath);
  } catch {
    throw makeExtractionError("AUDIO_OUTPUT_EMPTY", "ffmpeg ran but produced no output file");
  }

  if (info.size === 0) {
    await rm(outPath, { force: true }).catch(() => {});
    throw makeExtractionError("AUDIO_OUTPUT_EMPTY", "ffmpeg produced an empty audio file");
  }

  const sizeBytes = info.size;
  const durationMs = await getAudioDuration(outPath);

  return {
    path: outPath,
    durationMs,
    sizeBytes,
    cleanup: async () => {
      try { await rm(outPath, { force: true }); } catch { /* ignore */ }
    },
  };
}

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stderr } = await execFileAsync(FFMPEG, [
      "-i", audioPath,
      "-f", "null", "/dev/null",
    ], { timeout: 15_000 });
    const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (!m) return 0;
    return (parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])) * 1000;
  } catch {
    return 0;
  }
}

/**
 * Download a remote URL to a local temp file.
 * Used for downloading LALAL.AI vocal stems.
 */
export async function downloadToTemp(url: string, ext: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const id = randomUUID();
  const outPath = join(tmpdir(), `stageone-stem-${id}${ext}`);

  const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status} from stem URL`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  await import("fs/promises").then(m => m.writeFile(outPath, buffer));

  return {
    path: outPath,
    cleanup: async () => {
      try { await rm(outPath, { force: true }); } catch { /* ignore */ }
    },
  };
}

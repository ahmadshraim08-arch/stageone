/**
 * Analysis pipeline orchestrator.
 *
 * PRIMARY PATH: Download video → ElevenLabs direct video transcription.
 *   No FFmpeg required. Works with .mov and .mp4 from iPhone.
 *
 * FALLBACK PATH (only if primary fails with a retryable error):
 *   FFmpeg audio extraction → optional LALAL.AI vocal isolation → ElevenLabs WAV.
 *
 * All errors are logged with a safe job reference (AN-XXXXXXXX).
 * Temporary files are always deleted in finally blocks.
 */

import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { signVideoGetUrl } from "./objectStorage.js";
import {
  extractAudio,
  detectBackingMusic,
  downloadToTemp,
  downloadVideoToTemp,
  checkFfmpegHealth,
  type AudioExtractionError,
} from "./audioExtract.js";
import * as lalalai from "./lalalai.js";
import * as elevenlabs from "./elevenlabs.js";
import * as cyanite from "./cyanite.js";
import { identifySong } from "./musixmatchMatcher.js";
import { alignTiming } from "./timingAlignment.js";
import type { TranscriptWord } from "./elevenlabs.js";
import type { LyricLine } from "./musixmatchMatcher.js";
import type { TimingAnchor, TimingMode } from "./timingAlignment.js";

export interface AnalysisResult {
  jobRef?: string;

  vocalIsolationUsed: boolean;
  isolationStatus: "used" | "skipped" | "failed";

  transcriptionSource: "elevenlabs_direct" | "elevenlabs_isolated" | "skipped";
  detectedLanguage?: string;
  transcriptWords?: TranscriptWord[];

  detectionSource?: "musixmatch_transcript_search";
  detectedTrackId?: string;
  detectedTrackTitle?: string;
  detectedTrackArtist?: string;
  detectedAlbumArt?: string;
  songMatchConfidence?: number;
  topCandidates?: Array<{
    trackId: string;
    trackTitle: string;
    artistName: string;
    albumArt?: string;
    score: number;
  }>;

  startLineIndex?: number;
  endLineIndex?: number;
  startWordIndex?: number;
  endWordIndex?: number;
  lyricRangeConfidence?: number;
  lyricsMode?: "richsync" | "subtitle" | "plain";
  allLines?: LyricLine[];

  timingMode?: TimingMode;
  timingAnchors?: TimingAnchor[];
  timingOffsetMs?: number;
  syncConfidence?: number;

  musixmatchGenre?: string;

  cyaniteGenre?: string;
  cyaniteMoods?: string[];
  cyaniteEnergy?: string;

  fatalError?: string;
  fatalErrorCode?: string;
  stageErrors: Record<string, string>;
}

type Stage =
  | "retrieving_video"
  | "transcribing_video"
  | "preparing_audio_fallback"
  | "isolating_vocals"
  | "transcribing_audio_fallback"
  | "searching_musixmatch"
  | "matching_lyrics"
  | "analyzing_audio"
  | "aligning_timing"
  | "ready"
  | "failed"
  | "canceled"
  // Legacy stage names (kept for old in-flight jobs)
  | "preparing"
  | "transcribing";

async function setStage(
  jobId: string,
  stage: Stage,
  progressPct: number,
  extra?: { perStageErrors?: Record<string, string> },
): Promise<void> {
  await db
    .update(analysisJobsTable)
    .set({
      stage,
      progressPct,
      ...(extra?.perStageErrors ? { perStageErrors: extra.perStageErrors } : {}),
    })
    .where(eq(analysisJobsTable.id, jobId));
}

async function isCanceled(jobId: string): Promise<boolean> {
  const rows = await db
    .select({ status: analysisJobsTable.status })
    .from(analysisJobsTable)
    .where(eq(analysisJobsTable.id, jobId))
    .limit(1);
  return rows[0]?.status === "canceled";
}

function parseObjectKey(objectKey: string): { bucket: string; object: string } {
  const slash = objectKey.indexOf("/");
  if (slash === -1) throw new Error(`Invalid objectKey: ${objectKey}`);
  return { bucket: objectKey.slice(0, slash), object: objectKey.slice(slash + 1) };
}

/** Short user-facing reference code for locating this job in logs. */
function makeJobRef(jobId: string): string {
  return `AN-${jobId.slice(0, 8).toUpperCase()}`;
}

/** Infer video extension and MIME type from the stored object key. */
function inferVideoMime(objectKey: string): { ext: string; mimeType: string } {
  if (objectKey.endsWith(".mov")) return { ext: ".mov", mimeType: "video/quicktime" };
  if (objectKey.endsWith(".m4v")) return { ext: ".m4v", mimeType: "video/x-m4v" };
  return { ext: ".mp4", mimeType: "video/mp4" };
}

/**
 * Map a structured error code to a user-readable message.
 * The raw code is also stored so developers can locate the log entry.
 */
function errorCodeToUserMessage(code: string): string {
  const messages: Record<string, string> = {
    ANALYSIS_VIDEO_NOT_FOUND: "The uploaded video could not be found. Please try again.",
    ELEVENLABS_AUTH_FAILED: "Audio transcription service authentication failed. Please contact support.",
    ELEVENLABS_INSUFFICIENT_CREDITS: "Audio transcription service is temporarily unavailable.",
    ELEVENLABS_RATE_LIMITED: "Audio transcription service is rate-limited. Please retry in a moment.",
    ELEVENLABS_NOT_CONFIGURED: "Audio transcription is not configured on this server.",
    ELEVENLABS_TRANSCRIPTION_EMPTY: "We heard the performance but couldn't detect enough clear words to identify the song. Search manually.",
    FFMPEG_NOT_AVAILABLE: "Audio processing is unavailable and direct transcription failed. Please retry or search manually.",
    FFMPEG_EXTRACTION_FAILED: "Audio extraction failed. Please retry.",
    MUSIXMATCH_SEARCH_FAILED: "Song matching failed. Please search manually.",
    PIPELINE_ERROR: "An unexpected error occurred. Please retry.",
  };
  return messages[code] ?? "We couldn't analyze the audio. You can retry or search for the song manually.";
}

function isTerminalError(code: string): boolean {
  return [
    "ELEVENLABS_AUTH_FAILED",
    "ELEVENLABS_INSUFFICIENT_CREDITS",
    "ELEVENLABS_NOT_CONFIGURED",
    "ANALYSIS_VIDEO_NOT_FOUND",
  ].includes(code);
}

function isRetryable(code: string): boolean {
  return !isTerminalError(code);
}

async function markFailed(
  jobId: string,
  result: AnalysisResult,
  errorCode: string,
): Promise<void> {
  const userMessage = errorCodeToUserMessage(errorCode);
  result.fatalError = userMessage;
  result.fatalErrorCode = errorCode;
  await db
    .update(analysisJobsTable)
    .set({
      stage: "failed",
      status: "failed",
      retryable: isRetryable(errorCode),
      perStageErrors: { ...result.stageErrors, _errorCode: errorCode },
      result: result as unknown as Record<string, unknown>,
    })
    .where(eq(analysisJobsTable.id, jobId))
    .catch(() => {});
}

/**
 * Run the full analysis pipeline for a job.
 * Fire-and-forget from the route handler — all errors are caught and persisted in the job.
 */
export async function runPipeline(
  jobId: string,
  _userId: number,
  videoObjectKey: string,
  performanceType: string,
  artistHint?: string,
  titleHint?: string,
): Promise<void> {
  const jobRef = makeJobRef(jobId);
  const stageErrors: Record<string, string> = {};
  const result: AnalysisResult = {
    jobRef,
    vocalIsolationUsed: false,
    isolationStatus: "skipped",
    transcriptionSource: "skipped",
    stageErrors,
  };

  let videoCleanup: (() => Promise<void>) | null = null;
  let audioCleanup: (() => Promise<void>) | null = null;
  let stemCleanup: (() => Promise<void>) | null = null;

  try {
    // ── Stage: retrieving_video ─────────────────────────────────────────────
    await setStage(jobId, "retrieving_video", 5);
    if (await isCanceled(jobId)) return;

    const { bucket, object } = parseObjectKey(videoObjectKey);
    const { ext, mimeType } = inferVideoMime(videoObjectKey);

    let signedUrl: string;
    try {
      signedUrl = await signVideoGetUrl(bucket, object);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stageErrors["retrieving_video"] = `ANALYSIS_VIDEO_NOT_FOUND: ${msg.slice(0, 200)}`;
      logger.error({ jobRef, objectKey: videoObjectKey, err }, "[analysis] failed to sign video URL");
      await markFailed(jobId, result, "ANALYSIS_VIDEO_NOT_FOUND");
      return;
    }

    logger.info(
      { jobRef, ext, mimeType, objectKey: `${bucket}/...${object.slice(-20)}` },
      "[analysis] video URL obtained",
    );

    if (await isCanceled(jobId)) return;

    // ── Stage: transcribing_video (PRIMARY — no FFmpeg needed) ─────────────
    await setStage(jobId, "transcribing_video", 20);

    let transcriptWords: TranscriptWord[] = [];
    let directTranscriptFailed = false;
    let directTranscriptErrorCode = "";
    let videoPath: string | null = null;

    if (!elevenlabs.isConfigured()) {
      stageErrors["transcribing_video"] = "ELEVENLABS_NOT_CONFIGURED";
      directTranscriptFailed = true;
      directTranscriptErrorCode = "ELEVENLABS_NOT_CONFIGURED";
      logger.warn({ jobRef }, "[analysis] ElevenLabs not configured, will attempt FFmpeg fallback");
    } else {
      try {
        logger.info({ jobRef, ext, mimeType }, "[analysis] downloading video for direct ElevenLabs transcription");

        const downloaded = await downloadVideoToTemp(signedUrl, ext);
        videoCleanup = downloaded.cleanup;
        videoPath = downloaded.path;

        logger.info(
          { jobRef, sizeBytes: downloaded.sizeBytes, mimeType },
          "[analysis] video downloaded, sending to ElevenLabs",
        );

        const tx = await elevenlabs.transcribeAudio(videoPath, undefined, mimeType);

        logger.info(
          { jobRef, language: tx.language, wordCount: tx.words.length },
          "[analysis] ElevenLabs direct video transcription completed",
        );

        result.detectedLanguage = tx.language ?? undefined;
        result.transcriptWords = tx.words;
        result.transcriptionSource = "elevenlabs_direct";
        transcriptWords = tx.words;

        if (tx.words.length === 0) {
          stageErrors["transcribing_video"] = "ELEVENLABS_TRANSCRIPTION_EMPTY: no words detected";
          logger.warn({ jobRef }, "[analysis] ElevenLabs returned empty transcript for video");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof elevenlabs.ElevenLabsError
            ? err.code
            : "ELEVENLABS_TRANSCRIPTION_FAILED";

        stageErrors["transcribing_video"] = `${code}: ${msg.slice(0, 200)}`;
        logger.error(
          {
            jobRef,
            code,
            httpStatus: err instanceof elevenlabs.ElevenLabsError ? err.httpStatus : undefined,
            mimeType,
            ext,
          },
          "[analysis] direct video transcription failed",
        );

        if (isTerminalError(code)) {
          await markFailed(jobId, result, code);
          return;
        }

        directTranscriptFailed = true;
        directTranscriptErrorCode = code;
      }
    }

    if (await isCanceled(jobId)) return;

    // ── FALLBACK PATH: FFmpeg audio extraction ─────────────────────────────
    let audioPath: string | null = null;

    if (directTranscriptFailed) {
      await setStage(jobId, "preparing_audio_fallback", 38, { perStageErrors: stageErrors });

      const ffmpegHealth = await checkFfmpegHealth();
      logger.info(
        { jobRef, ffmpegOk: ffmpegHealth.ok, ffmpegCode: ffmpegHealth.code, ffmpegVersion: ffmpegHealth.version },
        "[analysis] FFmpeg availability check",
      );

      if (!ffmpegHealth.ok) {
        stageErrors["preparing_audio_fallback"] = `FFMPEG_NOT_AVAILABLE: ${ffmpegHealth.code}`;
        logger.error({ jobRef, ffmpegHealth }, "[analysis] FFmpeg not available for fallback — both paths exhausted");
        await markFailed(jobId, result, directTranscriptErrorCode || "FFMPEG_NOT_AVAILABLE");
        return;
      }

      try {
        const extracted = await extractAudio(signedUrl);
        audioPath = extracted.path;
        audioCleanup = extracted.cleanup;
        logger.info(
          { jobRef, sizeBytes: extracted.sizeBytes, durationMs: extracted.durationMs },
          "[analysis] FFmpeg audio extraction succeeded",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as AudioExtractionError).code ?? "FFMPEG_EXTRACTION_FAILED";
        stageErrors["preparing_audio_fallback"] = `${code}: ${msg.slice(0, 200)}`;
        logger.error({ jobRef, code, err }, "[analysis] FFmpeg extraction failed");
        await markFailed(jobId, result, code);
        return;
      }

      if (await isCanceled(jobId)) return;

      // ── Optional: isolating_vocals (cover + LALAL.AI configured) ────────
      let transcriptionAudioPath = audioPath;

      if (performanceType === "cover" && lalalai.isConfigured()) {
        const needsIsolation = await detectBackingMusic(audioPath).catch(() => true);
        if (needsIsolation) {
          await setStage(jobId, "isolating_vocals", 48, { perStageErrors: stageErrors });
          try {
            const vocalUrl = await lalalai.isolateVocals(audioPath);
            const stemFile = await downloadToTemp(vocalUrl, ".mp3");
            stemCleanup = stemFile.cleanup;
            transcriptionAudioPath = stemFile.path;
            result.vocalIsolationUsed = true;
            result.isolationStatus = "used";
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            stageErrors["isolating_vocals"] = msg;
            result.isolationStatus = "failed";
          }
        }
      }

      if (await isCanceled(jobId)) return;

      // ── Stage: transcribing_audio_fallback ───────────────────────────────
      await setStage(jobId, "transcribing_audio_fallback", 55, { perStageErrors: stageErrors });

      if (elevenlabs.isConfigured()) {
        try {
          const tx = await elevenlabs.transcribeAudio(transcriptionAudioPath);
          logger.info(
            { jobRef, language: tx.language, wordCount: tx.words.length },
            "[analysis] FFmpeg+ElevenLabs fallback transcription completed",
          );
          result.detectedLanguage = tx.language ?? undefined;
          result.transcriptWords = tx.words;
          result.transcriptionSource = result.vocalIsolationUsed
            ? "elevenlabs_isolated"
            : "elevenlabs_direct";
          transcriptWords = tx.words;

          if (tx.words.length === 0) {
            stageErrors["transcribing_audio_fallback"] =
              "ELEVENLABS_TRANSCRIPTION_EMPTY: no words detected in extracted audio";
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const code =
            err instanceof elevenlabs.ElevenLabsError
              ? err.code
              : "ELEVENLABS_TRANSCRIPTION_FAILED";
          stageErrors["transcribing_audio_fallback"] = `${code}: ${msg.slice(0, 200)}`;
          logger.error({ jobRef, code }, "[analysis] FFmpeg fallback transcription also failed");
        }
      } else {
        stageErrors["transcribing_audio_fallback"] = "ELEVENLABS_NOT_CONFIGURED";
      }
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: searching_musixmatch / matching_lyrics (cover only) ─────────
    if (performanceType === "cover" && transcriptWords.length >= 5) {
      await setStage(jobId, "searching_musixmatch", 65, { perStageErrors: stageErrors });
      logger.info(
        { jobRef, wordCount: transcriptWords.length, artistHint, titleHint },
        "[analysis] starting Musixmatch song identification",
      );

      try {
        const match = await identifySong(transcriptWords, artistHint, titleHint);
        result.detectionSource = "musixmatch_transcript_search";
        result.songMatchConfidence = match.confidence;
        result.topCandidates = match.topCandidates;
        result.detectedTrackId = match.trackId;
        result.detectedTrackTitle = match.trackTitle;
        result.detectedTrackArtist = match.artistName;
        result.detectedAlbumArt = match.albumArt;
        result.musixmatchGenre = match.musixmatchGenre;

        logger.info(
          {
            jobRef,
            trackTitle: match.trackTitle,
            artistName: match.artistName,
            confidence: match.confidence,
            candidateCount: match.topCandidates?.length ?? 0,
          },
          "[analysis] Musixmatch identification completed",
        );

        if (await isCanceled(jobId)) return;

        await setStage(jobId, "matching_lyrics", 78, { perStageErrors: stageErrors });

        if (match.lyricRange) {
          result.startLineIndex = match.lyricRange.startLineIndex;
          result.endLineIndex = match.lyricRange.endLineIndex;
          result.startWordIndex = match.lyricRange.startWordIndex;
          result.endWordIndex = match.lyricRange.endWordIndex;
          result.lyricRangeConfidence = match.lyricRange.confidence;
          result.lyricsMode = match.lyricRange.lyricsMode;
          result.allLines = match.lyricRange.lines;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stageErrors["searching_musixmatch"] = `MUSIXMATCH_SEARCH_FAILED: ${msg.slice(0, 200)}`;
        logger.error({ jobRef, err }, "[analysis] Musixmatch search failed");
      }
    } else if (performanceType === "cover" && transcriptWords.length < 5) {
      stageErrors["searching_musixmatch"] =
        `ELEVENLABS_TRANSCRIPTION_EMPTY: only ${transcriptWords.length} word(s) detected — need ≥ 5 for song matching`;
      logger.warn(
        { jobRef, wordCount: transcriptWords.length },
        "[analysis] too few transcript words for Musixmatch",
      );
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: analyzing_audio (Cyanite — WAV only) ────────────────────────
    if (audioPath) {
      await setStage(jobId, "analyzing_audio", 88, { perStageErrors: stageErrors });
      if (cyanite.isConfigured()) {
        try {
          const cy = await cyanite.analyzeAudio(audioPath);
          result.cyaniteGenre = cy.genre;
          result.cyaniteMoods = cy.moods;
          result.cyaniteEnergy = cy.energy;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stageErrors["analyzing_audio"] = msg;
        }
      } else {
        stageErrors["analyzing_audio"] =
          "Cyanite not configured (CYANITE_CLIENT_ID / CYANITE_CLIENT_SECRET missing)";
      }
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: aligning_timing ─────────────────────────────────────────────
    await setStage(jobId, "aligning_timing", 95, { perStageErrors: stageErrors });

    if (
      transcriptWords.length > 0 &&
      result.allLines &&
      result.startLineIndex !== undefined &&
      result.endLineIndex !== undefined &&
      result.lyricsMode
    ) {
      try {
        const timing = alignTiming(
          transcriptWords,
          result.allLines,
          result.startLineIndex,
          result.endLineIndex,
          result.lyricsMode,
        );
        result.timingMode = timing.timingMode;
        result.timingAnchors = timing.timingAnchors;
        result.timingOffsetMs = timing.timingOffsetMs;
        result.syncConfidence = timing.syncConfidence;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stageErrors["aligning_timing"] = msg;
      }
    }

    // ── Stage: ready ───────────────────────────────────────────────────────
    logger.info(
      { jobRef, stageErrorCount: Object.keys(stageErrors).length, transcriptWordCount: transcriptWords.length },
      "[analysis] pipeline completed",
    );

    await db
      .update(analysisJobsTable)
      .set({
        stage: "ready",
        status: "ready",
        progressPct: 100,
        perStageErrors: Object.keys(stageErrors).length > 0 ? stageErrors : null,
        result: result as unknown as Record<string, unknown>,
      })
      .where(eq(analysisJobsTable.id, jobId));
  } catch (outerErr) {
    const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    logger.error({ jobRef, err: outerErr }, "[analysis] unhandled pipeline error");
    result.stageErrors["pipeline"] = msg.slice(0, 300);
    await markFailed(jobId, result, "PIPELINE_ERROR");
  } finally {
    await videoCleanup?.().catch(() => {});
    await audioCleanup?.().catch(() => {});
    await stemCleanup?.().catch(() => {});
  }
}

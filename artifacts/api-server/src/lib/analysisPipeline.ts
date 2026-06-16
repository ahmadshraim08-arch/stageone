/**
 * Analysis pipeline orchestrator.
 *
 * Runs all partner integrations sequentially, updating job progress after each stage.
 * Each partner failure is isolated — the job continues with degraded results.
 * Temporary files are always deleted in finally blocks.
 */

import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { signVideoGetUrl } from "./objectStorage.js";
import { extractAudio, detectBackingMusic, downloadToTemp } from "./audioExtract.js";
import * as lalalai from "./lalalai.js";
import * as elevenlabs from "./elevenlabs.js";
import * as cyanite from "./cyanite.js";
import { identifySong } from "./musixmatchMatcher.js";
import { alignTiming } from "./timingAlignment.js";
import type { TranscriptWord } from "./elevenlabs.js";
import type { LyricLine } from "./musixmatchMatcher.js";
import type { TimingAnchor, TimingMode } from "./timingAlignment.js";

export interface AnalysisResult {
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

  stageErrors: Record<string, string>;
}

type Stage =
  | "preparing"
  | "isolating_vocals"
  | "transcribing"
  | "searching_musixmatch"
  | "matching_lyrics"
  | "analyzing_audio"
  | "aligning_timing"
  | "ready"
  | "failed"
  | "canceled";

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

/**
 * Parse objectKey (bucket/path) into bucket name and object name.
 */
function parseObjectKey(objectKey: string): { bucket: string; object: string } {
  const slash = objectKey.indexOf("/");
  if (slash === -1) throw new Error(`Invalid objectKey: ${objectKey}`);
  return { bucket: objectKey.slice(0, slash), object: objectKey.slice(slash + 1) };
}

/**
 * Run the full analysis pipeline for a job.
 * Fires-and-forgets from the route handler — all errors are caught and stored in the job.
 */
export async function runPipeline(
  jobId: string,
  _userId: number,
  videoObjectKey: string,
  performanceType: string,
  artistHint?: string,
  titleHint?: string,
): Promise<void> {
  const stageErrors: Record<string, string> = {};
  const result: AnalysisResult = {
    vocalIsolationUsed: false,
    isolationStatus: "skipped",
    transcriptionSource: "skipped",
    stageErrors,
  };

  let audioCleanup: (() => Promise<void>) | null = null;
  let stemCleanup: (() => Promise<void>) | null = null;

  try {
    // ── Stage: preparing ───────────────────────────────────────────────────
    await setStage(jobId, "preparing", 5);
    if (await isCanceled(jobId)) return;

    const { bucket, object } = parseObjectKey(videoObjectKey);
    const signedUrl = await signVideoGetUrl(bucket, object);

    let audioPath: string;
    try {
      const extracted = await extractAudio(signedUrl);
      audioPath = extracted.path;
      audioCleanup = extracted.cleanup;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stageErrors["preparing"] = msg;
      await markFailed(
        jobId,
        result,
        "We couldn't analyze the audio. Please retry or search for your song manually.",
      );
      return;
    }
    await setStage(jobId, "preparing", 12, { perStageErrors: stageErrors });

    if (await isCanceled(jobId)) return;

    // ── Stage: isolating_vocals ────────────────────────────────────────────
    let transcriptionAudioPath = audioPath;

    if (performanceType === "cover" && lalalai.isConfigured()) {
      const needsIsolation = await detectBackingMusic(audioPath).catch(() => true);
      if (needsIsolation) {
        await setStage(jobId, "isolating_vocals", 18, { perStageErrors: stageErrors });
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
      } else {
        result.isolationStatus = "skipped";
      }
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: transcribing ────────────────────────────────────────────────
    await setStage(jobId, "transcribing", 28, { perStageErrors: stageErrors });

    let transcriptWords: TranscriptWord[] = [];

    if (elevenlabs.isConfigured()) {
      try {
        const tx = await elevenlabs.transcribeAudio(transcriptionAudioPath);
        result.detectedLanguage = tx.language ?? undefined;
        result.transcriptWords = tx.words;
        result.transcriptionSource = result.vocalIsolationUsed
          ? "elevenlabs_isolated"
          : "elevenlabs_direct";
        transcriptWords = tx.words;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stageErrors["transcribing"] = msg;
        result.transcriptionSource = "skipped";
      }
    } else {
      stageErrors["transcribing"] = "ELEVENLABS_API_KEY not configured";
      result.transcriptionSource = "skipped";
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: searching_musixmatch / matching_lyrics (cover only) ─────────
    if (performanceType === "cover" && transcriptWords.length >= 5) {
      await setStage(jobId, "searching_musixmatch", 42, { perStageErrors: stageErrors });
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

        if (await isCanceled(jobId)) return;

        await setStage(jobId, "matching_lyrics", 58, { perStageErrors: stageErrors });

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
        stageErrors["searching_musixmatch"] = msg;
      }
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: analyzing_audio (Cyanite) ───────────────────────────────────
    await setStage(jobId, "analyzing_audio", 70, { perStageErrors: stageErrors });

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
      stageErrors["analyzing_audio"] = "Cyanite not configured (CYANITE_CLIENT_ID / CYANITE_CLIENT_SECRET missing)";
    }

    if (await isCanceled(jobId)) return;

    // ── Stage: aligning_timing ─────────────────────────────────────────────
    await setStage(jobId, "aligning_timing", 85, { perStageErrors: stageErrors });

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
    result.stageErrors["pipeline"] = msg.slice(0, 300);
    await markFailed(
      jobId,
      result,
      "We couldn't complete the analysis. Please retry or search for your song manually.",
    );
  } finally {
    await audioCleanup?.().catch(() => {});
    await stemCleanup?.().catch(() => {});
  }
}

async function markFailed(
  jobId: string,
  result: AnalysisResult,
  errorMessage: string,
): Promise<void> {
  await db
    .update(analysisJobsTable)
    .set({
      stage: "failed",
      status: "failed",
      retryable: true,
      perStageErrors: result.stageErrors,
      result: { ...result as unknown as Record<string, unknown>, fatalError: errorMessage },
    })
    .where(eq(analysisJobsTable.id, jobId))
    .catch(() => {});
}

/**
 * Timing alignment: anchor ElevenLabs transcript timestamps to Musixmatch timestamps.
 *
 * Produces:
 * - timingMode: richsync_aligned | subtitle_aligned | linear_scaled | offset_only | plain
 * - timingAnchors: compact array of (videoMs, lyricMs, word, confidence)
 * - timingOffsetMs: single global offset (fallback)
 * - syncConfidence: 0–1
 */

import type { TranscriptWord } from "./elevenlabs.js";
import type { LyricLine } from "./musixmatchMatcher.js";

export type TimingMode =
  | "richsync_aligned"
  | "subtitle_aligned"
  | "linear_scaled"
  | "offset_only"
  | "plain";

export interface TimingAnchor {
  videoMs: number;
  lyricMs: number;
  word: string;
  confidence: number;
}

export interface TimingResult {
  timingMode: TimingMode;
  timingAnchors: TimingAnchor[];
  timingOffsetMs: number;
  syncConfidence: number;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function phoneticallyClose(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.length === 0 || nb.length === 0) return false;
  if (na.startsWith(nb.slice(0, 4)) || nb.startsWith(na.slice(0, 4))) return true;
  return false;
}

/**
 * Align transcript words to RichSync word-level timestamps.
 * For each RichSync word, find the best matching transcript word near the expected position.
 */
function alignToRichSync(
  transcriptWords: TranscriptWord[],
  lyricLines: LyricLine[],
  startLine: number,
  endLine: number,
): TimingAnchor[] {
  const anchors: TimingAnchor[] = [];
  const rangeLines = lyricLines.slice(startLine, endLine + 1);

  const richWords: Array<{ text: string; lyricMs: number }> = [];
  for (const line of rangeLines) {
    for (const w of line.words) {
      if (w.text.trim()) richWords.push({ text: w.text, lyricMs: w.startMs });
    }
  }

  if (richWords.length === 0) return anchors;

  let txIdx = 0;
  for (const rw of richWords) {
    if (txIdx >= transcriptWords.length) break;
    const tw = transcriptWords[txIdx];
    if (phoneticallyClose(rw.text, tw.w)) {
      anchors.push({
        videoMs: tw.s,
        lyricMs: rw.lyricMs,
        word: rw.text,
        confidence: 0.9,
      });
      txIdx++;
    } else {
      const nearby = transcriptWords.slice(Math.max(0, txIdx - 2), txIdx + 4);
      const match = nearby.findIndex(w => phoneticallyClose(rw.text, w.w));
      if (match >= 0) {
        const tw2 = nearby[match];
        anchors.push({
          videoMs: tw2.s,
          lyricMs: rw.lyricMs,
          word: rw.text,
          confidence: 0.7,
        });
        txIdx = Math.max(0, txIdx - 2) + match + 1;
      }
    }
  }

  return anchors;
}

/**
 * Align transcript to subtitle line timestamps.
 * Each subtitle line gets one anchor from its first matched transcript word.
 */
function alignToSubtitles(
  transcriptWords: TranscriptWord[],
  lyricLines: LyricLine[],
  startLine: number,
  endLine: number,
): TimingAnchor[] {
  const anchors: TimingAnchor[] = [];
  const rangeLines = lyricLines.slice(startLine, endLine + 1);

  const txText = transcriptWords.map(w => normalize(w.w));

  for (const line of rangeLines) {
    if (line.startMs === null) continue;
    const lineWords = line.text.split(/\s+/).map(normalize).filter(w => w.length > 3);
    if (lineWords.length === 0) continue;

    for (const lw of lineWords) {
      const idx = txText.findIndex(tw => tw.startsWith(lw.slice(0, 4)) || lw.startsWith(tw.slice(0, 4)));
      if (idx >= 0) {
        anchors.push({
          videoMs: transcriptWords[idx].s,
          lyricMs: line.startMs,
          word: line.text.split(/\s+/)[0],
          confidence: 0.6,
        });
        break;
      }
    }
  }

  return anchors;
}

/**
 * Compute global timing offset from a set of anchors.
 * Uses median offset to be robust against outliers.
 */
function computeGlobalOffset(anchors: TimingAnchor[]): number {
  if (anchors.length === 0) return 0;
  const offsets = anchors.map(a => a.videoMs - a.lyricMs).sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  return offsets.length % 2 === 0
    ? Math.round((offsets[mid - 1] + offsets[mid]) / 2)
    : offsets[mid];
}

/**
 * Compute sync confidence from anchor quality and spread.
 */
function computeSyncConfidence(anchors: TimingAnchor[]): number {
  if (anchors.length === 0) return 0;
  if (anchors.length === 1) return 0.3;

  const avgConfidence = anchors.reduce((s, a) => s + a.confidence, 0) / anchors.length;

  const offsets = anchors.map(a => a.videoMs - a.lyricMs);
  const mean = offsets.reduce((s, o) => s + o, 0) / offsets.length;
  const variance = offsets.reduce((s, o) => s + (o - mean) ** 2, 0) / offsets.length;
  const stdDev = Math.sqrt(variance);

  const consistencyScore = Math.max(0, 1 - stdDev / 5000);

  return Math.min(avgConfidence * 0.6 + consistencyScore * 0.4, 1);
}

/**
 * Main timing alignment function.
 * Tries RichSync, then subtitle, then linear scale, then plain.
 */
export function alignTiming(
  transcriptWords: TranscriptWord[],
  lyricLines: LyricLine[],
  startLine: number,
  endLine: number,
  lyricsMode: "richsync" | "subtitle" | "plain",
): TimingResult {
  if (transcriptWords.length === 0 || lyricLines.length === 0) {
    return { timingMode: "plain", timingAnchors: [], timingOffsetMs: 0, syncConfidence: 0 };
  }

  if (lyricsMode === "richsync") {
    const anchors = alignToRichSync(transcriptWords, lyricLines, startLine, endLine);
    if (anchors.length >= 3) {
      const offsetMs = computeGlobalOffset(anchors);
      const syncConf = computeSyncConfidence(anchors);
      return {
        timingMode: "richsync_aligned",
        timingAnchors: anchors.slice(0, 50),
        timingOffsetMs: offsetMs,
        syncConfidence: syncConf,
      };
    }
    if (anchors.length >= 1) {
      return {
        timingMode: "offset_only",
        timingAnchors: anchors,
        timingOffsetMs: computeGlobalOffset(anchors),
        syncConfidence: 0.3,
      };
    }
  }

  if (lyricsMode === "subtitle" || lyricsMode === "richsync") {
    const anchors = alignToSubtitles(transcriptWords, lyricLines, startLine, endLine);
    if (anchors.length >= 2) {
      const offsetMs = computeGlobalOffset(anchors);
      const syncConf = computeSyncConfidence(anchors);

      if (anchors.length >= 4 && syncConf > 0.5) {
        return { timingMode: "subtitle_aligned", timingAnchors: anchors, timingOffsetMs: offsetMs, syncConfidence: syncConf };
      }
      return { timingMode: "linear_scaled", timingAnchors: anchors, timingOffsetMs: offsetMs, syncConfidence: syncConf * 0.7 };
    }

    if (anchors.length === 1) {
      return { timingMode: "offset_only", timingAnchors: anchors, timingOffsetMs: computeGlobalOffset(anchors), syncConfidence: 0.2 };
    }
  }

  if (transcriptWords.length >= 2 && lyricLines[startLine]?.startMs !== null) {
    const videoStart = transcriptWords[0].s;
    const lyricStart = lyricLines[startLine].startMs!;
    const anchor: TimingAnchor = { videoMs: videoStart, lyricMs: lyricStart, word: transcriptWords[0].w, confidence: 0.4 };
    return { timingMode: "offset_only", timingAnchors: [anchor], timingOffsetMs: videoStart - lyricStart, syncConfidence: 0.15 };
  }

  return { timingMode: "plain", timingAnchors: [], timingOffsetMs: 0, syncConfidence: 0 };
}

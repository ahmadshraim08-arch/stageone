/**
 * ElevenLabs speech-to-text client (Scribe model).
 * Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text
 * Supports word-level timestamps, language detection, and singing.
 * Accepts both audio (wav, mp3) and video (mp4, mov) files directly.
 */

import { readFile } from "fs/promises";
import path from "path";

const BASE = "https://api.elevenlabs.io/v1";

export interface TranscriptWord {
  w: string;    // word text (normalized)
  s: number;    // start ms (relative to start of submitted audio)
  e: number;    // end ms
  c?: number;   // confidence 0–1 (when available)
}

export interface TranscriptResult {
  text: string;
  language: string | null;
  words: TranscriptWord[];
}

/**
 * Structured error thrown by ElevenLabs calls.
 * Carries a machine-readable code and the HTTP status for caller logic.
 */
export class ElevenLabsError extends Error {
  code: string;
  httpStatus: number;
  providerMessage: string;

  constructor(code: string, httpStatus: number, providerMessage: string) {
    super(`${code}: HTTP ${httpStatus} — ${providerMessage.slice(0, 200)}`);
    this.name = "ElevenLabsError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.providerMessage = providerMessage;
    Object.setPrototypeOf(this, ElevenLabsError.prototype);
  }
}

function getKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new ElevenLabsError("ELEVENLABS_NOT_CONFIGURED", 0, "ELEVENLABS_API_KEY is not set");
  return k;
}

function httpStatusToCode(status: number): string {
  if (status === 400) return "ELEVENLABS_BAD_REQUEST";
  if (status === 401) return "ELEVENLABS_AUTH_FAILED";
  if (status === 402) return "ELEVENLABS_INSUFFICIENT_CREDITS";
  if (status === 413) return "ELEVENLABS_FILE_TOO_LARGE";
  if (status === 429) return "ELEVENLABS_RATE_LIMITED";
  if (status >= 500) return "ELEVENLABS_PROVIDER_ERROR";
  return "ELEVENLABS_TRANSCRIPTION_FAILED";
}

/**
 * Infer MIME type and a safe filename from the file path.
 * Supports both audio (wav, mp3) and video (mp4, mov, m4v) files.
 */
function inferMediaInfo(filePath: string, mimeTypeOverride?: string): { mime: string; filename: string } {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
  };
  const mime = mimeTypeOverride ?? mimeMap[ext] ?? "audio/wav";
  const filenameMap: Record<string, string> = {
    ".mp3": "audio.mp3",
    ".wav": "audio.wav",
    ".ogg": "audio.ogg",
    ".flac": "audio.flac",
    ".m4a": "audio.m4a",
    ".aac": "audio.aac",
    ".mp4": "video.mp4",
    ".mov": "video.mov",
    ".m4v": "video.m4v",
    ".webm": "video.webm",
  };
  const filename = filenameMap[ext] ?? "audio.wav";
  return { mime, filename };
}

const FILLER_REGEX = /^(um+|uh+|ah+|oh+|mm+|hmm+|er+)$/i;

/**
 * Transcribe an audio or video file using ElevenLabs Scribe.
 * Accepts .wav, .mp3, .mp4, .mov, .m4v, and other supported formats.
 * Requests word-level timestamps and automatic language detection.
 *
 * @param filePath     Path to a local audio or video file
 * @param languageHint Optional BCP-47 language code (e.g. "en", "es")
 * @param mimeOverride Override the MIME type (default: inferred from extension)
 */
export async function transcribeAudio(
  filePath: string,
  languageHint?: string,
  mimeOverride?: string,
): Promise<TranscriptResult> {
  const apiKey = getKey();
  const { mime, filename } = inferMediaInfo(filePath, mimeOverride);

  const buf = await readFile(filePath);
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append("audio", blob, filename);
  form.append("model_id", "scribe_v1");
  form.append("timestamps_granularity", "word");
  if (languageHint) form.append("language_code", languageHint);

  const resp = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });

  if (!resp.ok) {
    const rawText = await resp.text().catch(() => resp.status.toString());
    const sanitized = rawText.slice(0, 300).replace(/["\n\r]/g, " ");
    throw new ElevenLabsError(httpStatusToCode(resp.status), resp.status, sanitized);
  }

  const data = await resp.json() as {
    text?: string;
    language_code?: string;
    words?: Array<{
      text?: string;
      type?: string;
      start?: number;
      end?: number;
      speaker_id?: string;
    }>;
  };

  const raw = data.words ?? [];
  const words: TranscriptWord[] = [];

  for (const w of raw) {
    if (w.type !== "word") continue;
    const text = (w.text ?? "").trim();
    if (!text) continue;
    if (FILLER_REGEX.test(text)) continue;

    const startMs = Math.round((w.start ?? 0) * 1000);
    const endMs   = Math.round((w.end   ?? 0) * 1000);
    if (endMs <= startMs) continue;

    words.push({ w: text, s: startMs, e: endMs });
  }

  return {
    text: data.text ?? words.map(w => w.w).join(" "),
    language: data.language_code ?? null,
    words,
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

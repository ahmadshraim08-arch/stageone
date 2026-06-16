/**
 * ElevenLabs speech-to-text client (Scribe model).
 * Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text
 * Supports word-level timestamps, language detection, and singing.
 */

import { readFile } from "fs/promises";

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

function getKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not set");
  return k;
}

const FILLER_REGEX = /^(um+|uh+|ah+|oh+|mm+|hmm+|er+)$/i;

/**
 * Transcribe an audio file using ElevenLabs Scribe.
 * Requests word-level timestamps.
 * Returns compact word array with ms timestamps.
 */
export async function transcribeAudio(
  audioPath: string,
  languageHint?: string,
): Promise<TranscriptResult> {
  const apiKey = getKey();
  const buf = await readFile(audioPath);

  const mime = audioPath.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append("audio", blob, audioPath.endsWith(".mp3") ? "audio.mp3" : "audio.wav");
  form.append("model_id", "scribe_v1");
  form.append("timestamps_granularity", "word");
  if (languageHint) form.append("language_code", languageHint);

  const resp = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.status.toString());
    throw new Error(`ElevenLabs STT failed: HTTP ${resp.status} — ${text.slice(0, 300)}`);
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

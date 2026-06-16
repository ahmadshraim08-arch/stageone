/**
 * Musixmatch API helper for StageOne mobile.
 * All responses are in-memory cached per session (Map keyed by trackId / trackId+lang).
 * Never stores lyric text — only fetches and returns it.
 */

// ---------------------------------------------------------------------------
// Types — mirrors the API server's exported shapes (can't import across packages)
// ---------------------------------------------------------------------------

export type LyricSource = "musixmatch" | "demo" | "unavailable";
export type LyricMode   = "richsync" | "subtitle" | "plain" | "demo";
export type TimingMode  = "richsync" | "subtitle" | "manual" | "demo";

export interface LyricWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  index: number;
  text: string;
  startMs: number | null;
  endMs: number | null;
  words: LyricWord[];
}

export interface LyricsResponse {
  source: LyricSource;
  mode: LyricMode;
  trackId: string;
  durationMs: number | null;
  hasSync: boolean;
  hasRichsync: boolean;
  language: string | null;
  copyright: string | null;
  available: boolean;
  reason?: string;
  lines: LyricLine[];
}

export interface Segment {
  id: string;
  label: string;
  startMs: number | null;
  endMs: number | null;
  startLineIndex: number;
  endLineIndex: number;
  lineCount: number;
}

export interface SegmentsResponse {
  source: LyricSource;
  trackId: string;
  timingMode: TimingMode;
  hasSync: boolean;
  segments: Segment[];
  reason: string | null;
}

export interface TranslationResponse {
  source: LyricSource;
  trackId: string;
  targetLanguage: string;
  lines: LyricLine[] | null;
  availableLanguages: string[];
}

export interface MoodResponse {
  source: "musixmatch" | "derived";
  trackId: string;
  moodTags: string[];
  primaryMood: string;
  accentColor: string;
  meaning?: string;
  rating?: string;
}

export interface RichsyncWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface RichsyncLine {
  text: string;
  startMs: number;
  endMs: number;
  words: RichsyncWord[];
}

export interface RichsyncResponse {
  source: LyricSource;
  trackId: string;
  durationMs: number | null;
  hasRichsync: boolean;
  lines: RichsyncLine[];
}

export interface TrackResult {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name?: string;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

function apiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api/musixmatch`;
  return `/api/musixmatch`;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const lyricsCache    = new Map<string, LyricsResponse>();
const segmentsCache  = new Map<string, SegmentsResponse>();
const translationCache = new Map<string, TranslationResponse | null>();
const moodCache      = new Map<string, MoodResponse>();
const richsyncCache  = new Map<string, RichsyncResponse>();
const searchCache    = new Map<string, { tracks: TrackResult[]; source: string }>();

const SEARCH_CACHE_MAX = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchLyrics(trackId: string): Promise<LyricsResponse | null> {
  const key = trackId;
  if (lyricsCache.has(key)) return lyricsCache.get(key)!;
  try {
    const data = await apiFetch<LyricsResponse>(`/lyrics/${encodeURIComponent(trackId)}`);
    lyricsCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

export async function fetchSegments(trackId: string): Promise<SegmentsResponse | null> {
  const key = trackId;
  if (segmentsCache.has(key)) return segmentsCache.get(key)!;
  try {
    const data = await apiFetch<SegmentsResponse>(`/segments/${encodeURIComponent(trackId)}`);
    segmentsCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Returns null if the translation is unavailable (lines === null) or on fetch error.
 * Caches the full TranslationResponse including null-lines variants so we don't re-probe.
 */
export async function fetchTranslation(
  trackId: string,
  lang: string,
): Promise<TranslationResponse | null> {
  const key = `${trackId}:${lang}`;
  if (translationCache.has(key)) return translationCache.get(key) ?? null;
  try {
    const data = await apiFetch<TranslationResponse>(
      `/translate/${encodeURIComponent(trackId)}/${encodeURIComponent(lang)}`,
    );
    translationCache.set(key, data);
    return data;
  } catch {
    translationCache.set(key, null);
    return null;
  }
}

export async function fetchMood(trackId: string): Promise<MoodResponse | null> {
  const key = trackId;
  if (moodCache.has(key)) return moodCache.get(key)!;
  try {
    const data = await apiFetch<MoodResponse>(`/mood/${encodeURIComponent(trackId)}`);
    moodCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch word-level richsync data for a track.
 * When hasRichsync=true, each line contains per-word start/end timing.
 * When hasRichsync=false, each line has a single word entry (line-level only).
 * Falls back to null on fetch error.
 */
export async function fetchRichsync(trackId: string): Promise<RichsyncResponse | null> {
  const key = trackId;
  if (richsyncCache.has(key)) return richsyncCache.get(key)!;
  try {
    const data = await apiFetch<RichsyncResponse>(`/richsync/${encodeURIComponent(trackId)}`);
    richsyncCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Probe a set of candidate languages for a given track and return only those
 * where lines !== null. Used by the lyric overlay to populate language pills
 * dynamically without hardcoding.
 */
export async function probeAvailableTranslations(
  trackId: string,
  candidates: string[] = ["es", "ar", "fr", "pt"],
): Promise<string[]> {
  const results = await Promise.all(
    candidates.map(async (lang) => {
      const r = await fetchTranslation(trackId, lang);
      return r?.lines !== null ? lang : null;
    }),
  );
  return results.filter((l): l is string => l !== null);
}

/**
 * Search for tracks by query string. Results are cached per trimmed query for
 * the lifetime of the session (up to SEARCH_CACHE_MAX entries, LRU-evicted).
 * Returns tracks plus source ("musixmatch" | "demo") so callers can label results.
 */
export async function searchTracks(
  query: string,
): Promise<{ tracks: TrackResult[]; source: string }> {
  const key = query.trim().toLowerCase();
  if (!key) return { tracks: [], source: "demo" };
  if (searchCache.has(key)) {
    const cached = searchCache.get(key)!;
    searchCache.delete(key);
    searchCache.set(key, cached);
    return cached;
  }
  const data = await apiFetch<{ tracks: TrackResult[]; source: string }>(
    `/search?q=${encodeURIComponent(key)}`,
  );
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  const result = { tracks: data.tracks ?? [], source: data.source ?? "musixmatch" };
  searchCache.set(key, result);
  return result;
}

/** Clear all caches (useful for testing). */
export function clearCache(): void {
  lyricsCache.clear();
  segmentsCache.clear();
  translationCache.clear();
  moodCache.clear();
  richsyncCache.clear();
  searchCache.clear();
}

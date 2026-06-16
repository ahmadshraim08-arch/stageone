/**
 * Musixmatch song identification from an ElevenLabs transcript.
 *
 * Strategy:
 * 1. Build 3–5 distinctive phrase queries from the transcript words.
 * 2. Search Musixmatch with each phrase via track.search.
 * 3. Collect candidate tracks with a score based on consecutive phrase matches.
 * 4. For the top candidate fetch RichSync → subtitles → plain lyrics.
 * 5. Align the transcript to the official lyrics to detect the performed range.
 */

import type { TranscriptWord } from "./elevenlabs.js";

const BASE = "https://api.musixmatch.com/ws/1.1";

function getKey(): string {
  const k = process.env.MUSIXMATCH_API_KEY;
  if (!k) throw new Error("MUSIXMATCH_API_KEY is not set");
  return k;
}

async function mxFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("apikey", getKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!resp.ok) throw new Error(`Musixmatch HTTP ${resp.status}`);
  return resp.json();
}

function mxStatus(data: unknown): number {
  return (data as { message?: { header?: { status_code?: number } } })?.message?.header?.status_code ?? -1;
}

function mxBody(data: unknown): unknown {
  return (data as { message?: { body?: unknown } })?.message?.body;
}

// ─── Common word filter ──────────────────────────────────────────────────────

const COMMON = new Set([
  "the","a","an","i","you","he","she","it","we","they","me","him","her","us","them",
  "is","are","was","were","be","been","being","do","does","did","have","has","had",
  "will","would","can","could","should","may","might","shall",
  "and","but","or","nor","for","so","yet","of","in","on","at","to","by","up","as",
  "if","not","no","my","your","his","its","our","their",
  "that","this","these","those","what","who","which","when","where","how",
  "yeah","oh","ooh","ah","na","la","da","hey","now","just","like","go","get",
  "love","baby","girl","boy","come","know","feel","want","need","make","take","give",
  "say","see","look","come","good","time","day","night","way","life","heart","mind",
]);

function isDistinctive(word: string): boolean {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length < 4) return false;
  return !COMMON.has(lower);
}

// ─── Phrase building ─────────────────────────────────────────────────────────

interface SearchPhrase {
  query: string;
  words: string[];
}

function buildSearchPhrases(words: TranscriptWord[]): SearchPhrase[] {
  const distinctiveIndices: number[] = [];
  for (let i = 0; i < words.length; i++) {
    if (isDistinctive(words[i].w)) distinctiveIndices.push(i);
  }

  if (distinctiveIndices.length < 3) {
    const chunk = words.slice(0, Math.min(20, words.length));
    return [{ query: chunk.map(w => w.w).join(" "), words: chunk.map(w => w.w) }];
  }

  const phrases: SearchPhrase[] = [];
  const step = Math.max(1, Math.floor(distinctiveIndices.length / 5));

  for (let s = 0; s < distinctiveIndices.length && phrases.length < 5; s += step) {
    const start = distinctiveIndices[s];
    const end = Math.min(words.length, start + 8);
    const slice = words.slice(start, end);
    const text = slice.map(w => w.w).join(" ");
    if (text.length < 10) continue;
    phrases.push({ query: text, words: slice.map(w => w.w) });
  }

  return phrases;
}

// ─── Candidate scoring ───────────────────────────────────────────────────────

export interface SongCandidate {
  trackId: string;
  trackTitle: string;
  artistName: string;
  albumArt?: string;
  score: number;
  matchedPhrases: number;
  hasLyrics: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function phraseMatchScore(transcriptWords: string[], officialText: string): number {
  const norm = normalize(officialText);
  const target = transcriptWords.map(w => normalize(w)).join(" ");
  if (norm.includes(target)) return 1.0;

  let matched = 0;
  for (const w of transcriptWords) {
    if (norm.includes(normalize(w))) matched++;
  }
  return matched / transcriptWords.length;
}

interface MxTrack {
  track: {
    track_id: number;
    track_name: string;
    artist_name: string;
    album_coverart_100x100?: string;
    has_lyrics?: number;
    album_name?: string;
  };
}

async function searchPhrase(phrase: SearchPhrase): Promise<Map<string, { track: MxTrack["track"]; hits: number }>> {
  const results = new Map<string, { track: MxTrack["track"]; hits: number }>();
  try {
    const data = await mxFetch("track.search", {
      q_lyrics: phrase.query,
      s_track_rating: "desc",
      f_has_lyrics: "1",
      page_size: "10",
    });
    if (mxStatus(data) !== 200) return results;
    const body = mxBody(data) as { track_list?: MxTrack[] } | null;
    for (const item of body?.track_list ?? []) {
      const t = item.track;
      const id = String(t.track_id);
      const score = phraseMatchScore(phrase.words, t.track_name + " " + t.artist_name);
      const existing = results.get(id);
      if (existing) {
        existing.hits++;
      } else {
        results.set(id, { track: t, hits: 1 });
      }
    }
  } catch { /* ignore per-phrase errors */ }
  return results;
}

// ─── Lyric range detection ───────────────────────────────────────────────────

export interface LyricLine {
  index: number;
  text: string;
  startMs: number | null;
  endMs: number | null;
  words: Array<{ text: string; startMs: number; endMs: number }>;
}

export interface LyricRangeResult {
  startLineIndex: number;
  endLineIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  lyricsMode: "richsync" | "subtitle" | "plain";
  confidence: number;
  lines: LyricLine[];
}

async function fetchLyrics(trackId: string): Promise<{ lines: LyricLine[]; mode: "richsync" | "subtitle" | "plain" } | null> {
  try {
    const rsData = await mxFetch("track.richsync.get", { track_id: trackId, f_sync_adapted: "1" });
    if (mxStatus(rsData) === 200) {
      const body = mxBody(rsData) as { richsync?: { richsync_body?: string } } | null;
      const raw = body?.richsync?.richsync_body;
      if (raw) {
        const lines = parseRichSync(raw);
        if (lines.length > 0) return { lines, mode: "richsync" };
      }
    }
  } catch { /* fall through */ }

  try {
    const subData = await mxFetch("track.subtitle.get", { track_id: trackId });
    if (mxStatus(subData) === 200) {
      const body = mxBody(subData) as { subtitle?: { subtitle_body?: string } } | null;
      const raw = body?.subtitle?.subtitle_body;
      if (raw) {
        const lines = parseSubtitle(raw);
        if (lines.length > 0) return { lines, mode: "subtitle" };
      }
    }
  } catch { /* fall through */ }

  try {
    const lyrData = await mxFetch("track.lyrics.get", { track_id: trackId });
    if (mxStatus(lyrData) === 200) {
      const body = mxBody(lyrData) as { lyrics?: { lyrics_body?: string } } | null;
      const raw = body?.lyrics?.lyrics_body;
      if (raw) {
        const lines = parsePlainLyrics(raw);
        if (lines.length > 0) return { lines, mode: "plain" };
      }
    }
  } catch { /* fall through */ }

  return null;
}

function parseRichSync(body: string): LyricLine[] {
  try {
    const items = JSON.parse(body) as Array<{ ts: number; te: number; l: Array<{ c: string; o: number }> }>;
    return items.map((item, index) => ({
      index,
      text: item.l.map(w => w.c).join("").trim(),
      startMs: Math.round(item.ts * 1000),
      endMs: Math.round(item.te * 1000),
      words: item.l.map(w => ({
        text: w.c.trim(),
        startMs: Math.round((item.ts + w.o) * 1000),
        endMs: Math.round((item.ts + w.o + 0.3) * 1000),
      })).filter(w => w.text),
    })).filter(l => l.text);
  } catch {
    return [];
  }
}

function parseSubtitle(body: string): LyricLine[] {
  try {
    const items = JSON.parse(body) as Array<{ text: string; time: { total: number } }>;
    return items.map((item, index) => ({
      index,
      text: item.text.trim(),
      startMs: Math.round(item.time.total * 1000),
      endMs: null,
      words: [],
    })).filter(l => l.text);
  } catch {
    const lines = body.split("\n").filter(l => l.trim());
    return lines.map((text, index) => ({ index, text: text.trim(), startMs: null, endMs: null, words: [] }));
  }
}

function parsePlainLyrics(body: string): LyricLine[] {
  return body
    .split("\n")
    .map((l, i) => l.trim())
    .filter(l => l && !l.startsWith("****"))
    .map((text, index) => ({ index, text, startMs: null, endMs: null, words: [] }));
}

/**
 * Detect which lyric range of the official lyrics corresponds to the transcript.
 * Uses a sliding-window overlap approach to find the best-matching set of consecutive lines.
 */
function detectLyricRange(
  transcriptWords: TranscriptWord[],
  lines: LyricLine[],
): { startLine: number; endLine: number; confidence: number } {
  if (lines.length === 0) return { startLine: 0, endLine: 0, confidence: 0 };

  const transcriptText = normalize(transcriptWords.map(w => w.w).join(" "));
  const windowSizes = [4, 6, 8, 10, 12];

  let bestStart = 0;
  let bestEnd = Math.min(lines.length - 1, 5);
  let bestScore = 0;

  for (const windowSize of windowSizes) {
    for (let start = 0; start <= lines.length - windowSize; start++) {
      const end = Math.min(start + windowSize - 1, lines.length - 1);
      const windowText = normalize(lines.slice(start, end + 1).map(l => l.text).join(" "));

      const score = computeOverlapScore(transcriptText, windowText);
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
        bestEnd = end;
      }
    }
  }

  if (lines.length <= 6) {
    return { startLine: 0, endLine: lines.length - 1, confidence: Math.min(bestScore * 1.2, 1) };
  }

  return { startLine: bestStart, endLine: bestEnd, confidence: Math.min(bestScore, 1) };
}

function computeOverlapScore(a: string, b: string): number {
  const aWords = new Set(a.split(" ").filter(w => w.length > 3));
  const bWords = new Set(b.split(" ").filter(w => w.length > 3));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let overlap = 0;
  for (const w of aWords) { if (bWords.has(w)) overlap++; }
  return (2 * overlap) / (aWords.size + bWords.size);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface SongMatchResult {
  topCandidates: SongCandidate[];
  confidence: number;
  trackId?: string;
  trackTitle?: string;
  artistName?: string;
  albumArt?: string;
  musixmatchGenre?: string;
  lyricRange?: LyricRangeResult;
}

export async function identifySong(
  words: TranscriptWord[],
  artistHint?: string,
  titleHint?: string,
): Promise<SongMatchResult> {
  if (!process.env.MUSIXMATCH_API_KEY) {
    return { topCandidates: [], confidence: 0 };
  }

  const phrases = buildSearchPhrases(words);
  const aggregated = new Map<string, { track: MxTrack["track"]; hits: number }>();

  await Promise.all(
    phrases.map(p => searchPhrase(p).then(results => {
      for (const [id, val] of results) {
        const existing = aggregated.get(id);
        if (existing) {
          existing.hits += val.hits;
        } else {
          aggregated.set(id, val);
        }
      }
    })),
  );

  if (titleHint || artistHint) {
    try {
      const searchParams: Record<string, string> = { f_has_lyrics: "1", page_size: "5" };
      if (titleHint) searchParams.q_track = titleHint;
      if (artistHint) searchParams.q_artist = artistHint;
      const data = await mxFetch("track.search", searchParams);
      if (mxStatus(data) === 200) {
        const body = mxBody(data) as { track_list?: MxTrack[] } | null;
        for (const item of body?.track_list ?? []) {
          const id = String(item.track.track_id);
          const existing = aggregated.get(id);
          if (existing) { existing.hits += 3; }
          else { aggregated.set(id, { track: item.track, hits: 3 }); }
        }
      }
    } catch { /* ignore */ }
  }

  const ranked: SongCandidate[] = Array.from(aggregated.entries())
    .map(([id, val]) => ({
      trackId: id,
      trackTitle: val.track.track_name,
      artistName: val.track.artist_name,
      albumArt: val.track.album_coverart_100x100,
      score: val.hits,
      matchedPhrases: val.hits,
      hasLyrics: (val.track.has_lyrics ?? 0) > 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (ranked.length === 0) {
    return { topCandidates: [], confidence: 0 };
  }

  const top = ranked[0];
  const maxPossible = phrases.length;
  const confidence = Math.min(top.score / maxPossible, 1);

  const [lyricsData, musixmatchGenre] = await Promise.all([
    fetchLyrics(top.trackId),
    fetchTrackGenre(top.trackId),
  ]);

  let lyricRange: LyricRangeResult | undefined;
  if (lyricsData) {
    const rangeResult = detectLyricRange(words, lyricsData.lines);
    const { startLine, endLine } = rangeResult;
    const rangeLines = lyricsData.lines.slice(startLine, endLine + 1);
    const firstWord = rangeLines[0]?.words[0]?.text ?? rangeLines[0]?.text ?? "";
    const lastLine = rangeLines[rangeLines.length - 1];
    const lastWord = lastLine?.words[lastLine.words.length - 1]?.text ?? lastLine?.text ?? "";

    lyricRange = {
      startLineIndex: startLine,
      endLineIndex: endLine,
      startWordIndex: 0,
      endWordIndex: 0,
      lyricsMode: lyricsData.mode,
      confidence: rangeResult.confidence,
      lines: lyricsData.lines,
    };
  }

  return {
    topCandidates: ranked,
    confidence,
    trackId: top.trackId,
    trackTitle: top.trackTitle,
    artistName: top.artistName,
    albumArt: top.albumArt,
    musixmatchGenre: musixmatchGenre ?? undefined,
    lyricRange,
  };
}

/**
 * Fetch the primary genre name for a track from Musixmatch.
 * Returns null if not available or on any error.
 */
async function fetchTrackGenre(trackId: string): Promise<string | null> {
  try {
    const data = await mxFetch("track.get", { track_id: trackId });
    if (mxStatus(data) !== 200) return null;
    const body = mxBody(data) as {
      track?: {
        primary_genres?: {
          music_genre_list?: Array<{
            music_genre?: { music_genre_name?: string };
          }>;
        };
      };
    } | null;
    const genreName = body?.track?.primary_genres?.music_genre_list?.[0]?.music_genre?.music_genre_name;
    return genreName ? String(genreName) : null;
  } catch {
    return null;
  }
}

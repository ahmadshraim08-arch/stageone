import { Router } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Types — exported at the bottom of this file for the mobile layer to import
// ---------------------------------------------------------------------------

export type LyricSource = "musixmatch" | "demo" | "unavailable";
export type LyricMode  = "richsync" | "subtitle" | "plain" | "demo";
export type TimingMode = "richsync" | "subtitle" | "manual" | "demo";

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
  lines: LyricLine[] | null;    // null = translation not available for this language
  availableLanguages: string[]; // empty when Musixmatch 401; demo tracks list known langs
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

// ---------------------------------------------------------------------------
// Track catalogue — real Musixmatch IDs for search; demo tracks for lyrics
// ---------------------------------------------------------------------------

interface CatalogueTrack {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string;
  genre?: string;
}

const CATALOGUE: CatalogueTrack[] = [
  { track_id: "demo_001", track_name: "Neon Mornings", artist_name: "StageOne Artists", album_name: "Demo Sessions Vol. 1", genre: "Pop" },
  { track_id: "demo_002", track_name: "Echo in the Rain", artist_name: "StageOne Artists", album_name: "Demo Sessions Vol. 1", genre: "Indie" },
  { track_id: "demo_003", track_name: "Thousand Lights", artist_name: "StageOne Artists", album_name: "Demo Sessions Vol. 1", genre: "Pop" },
  { track_id: "12345", track_name: "Golden Hour", artist_name: "JVKE", album_name: "this is what falling in love feels like", genre: "Pop" },
  { track_id: "67890", track_name: "Fix You", artist_name: "Coldplay", album_name: "X&Y", genre: "Rock" },
  { track_id: "11111", track_name: "Starlight", artist_name: "Taylor Swift", album_name: "Taylor Swift", genre: "Pop" },
  { track_id: "22222", track_name: "Blinding Lights", artist_name: "The Weeknd", album_name: "After Hours", genre: "Pop" },
  { track_id: "33333", track_name: "Someone Like You", artist_name: "Adele", album_name: "21", genre: "Soul" },
  { track_id: "44444", track_name: "Shallow", artist_name: "Lady Gaga & Bradley Cooper", album_name: "A Star Is Born", genre: "Pop" },
  { track_id: "55555", track_name: "Perfect", artist_name: "Ed Sheeran", album_name: "Divide", genre: "Singer-Songwriter" },
  { track_id: "66666", track_name: "Bohemian Rhapsody", artist_name: "Queen", album_name: "A Night at the Opera", genre: "Rock" },
  { track_id: "77777", track_name: "Hallelujah", artist_name: "Leonard Cohen", album_name: "Various Positions", genre: "Singer-Songwriter" },
  { track_id: "88888", track_name: "Try Again", artist_name: "Aaliyah", album_name: "Romeo Must Die", genre: "R&B" },
  { track_id: "99999", track_name: "Home", artist_name: "Michael Bublé", album_name: "It's Time", genre: "Jazz" },
  { track_id: "10001", track_name: "Stay", artist_name: "The Kid LAROI & Justin Bieber", album_name: "F*CK LOVE 3", genre: "Pop" },
  { track_id: "10002", track_name: "As It Was", artist_name: "Harry Styles", album_name: "Harry's House", genre: "Pop" },
  { track_id: "10003", track_name: "Levitating", artist_name: "Dua Lipa", album_name: "Future Nostalgia", genre: "Pop" },
  { track_id: "10004", track_name: "Flowers", artist_name: "Miley Cyrus", album_name: "Endless Summer Vacation", genre: "Pop" },
];

// ---------------------------------------------------------------------------
// Demo lyric data — original placeholder lyrics, manually timed (not BPM-derived)
// Section breaks are gaps ≥ 2600 ms between consecutive lines.
// ---------------------------------------------------------------------------

interface RawLine {
  text: string;
  startMs: number | null;
  endMs: number | null;
}

interface DemoTrack {
  genre: string;
  durationMs: number;
  lines: RawLine[];
  translations: Partial<Record<string, RawLine[]>>;
}

const DEMO_TRACKS: Record<string, DemoTrack> = {
  demo_001: {
    genre: "Pop",
    durationMs: 176000,
    lines: [
      { text: "Looking out across the skyline, everything feels new",           startMs: 0,     endMs: 4900 },
      { text: "Morning breaks through windowpanes and I begin with you",        startMs: 5000,  endMs: 9900 },
      { text: "Something in this moment calls me by my name",                   startMs: 10000, endMs: 14900 },
      { text: "Nothing stays the way it was and I am glad it came",             startMs: 15000, endMs: 19900 },
      // 2600 ms gap → new section
      { text: "So I take a breath and I begin",                                 startMs: 22500, endMs: 27400 },
      { text: "Counting all the colors in the wind",                            startMs: 27500, endMs: 31900 },
      { text: "There is something waiting on the other side",                   startMs: 32000, endMs: 36900 },
      { text: "Of all the walls I built to run and hide",                       startMs: 37000, endMs: 41400 },
      // 2600 ms gap → new section
      { text: "Neon mornings, open skies",                                      startMs: 44000, endMs: 48400 },
      { text: "I can feel it as it rises",                                      startMs: 48500, endMs: 53400 },
      { text: "Neon mornings, no goodbyes",                                     startMs: 53500, endMs: 58400 },
      { text: "Only where the moment takes me",                                 startMs: 58500, endMs: 63900 },
    ],
    translations: {
      es: [
        { text: "Contemplando el horizonte, todo parece nuevo",                 startMs: 0,     endMs: 4900 },
        { text: "La mañana rompe el vidrio y comienzo contigo",                 startMs: 5000,  endMs: 9900 },
        { text: "Algo en este instante llama por mi nombre",                    startMs: 10000, endMs: 14900 },
        { text: "Nada sigue como era y me alegra que así sea",                  startMs: 15000, endMs: 19900 },
        { text: "Entonces tomo aire y vuelvo a comenzar",                       startMs: 22500, endMs: 27400 },
        { text: "Contando los colores que el viento puede dar",                 startMs: 27500, endMs: 31900 },
        { text: "Hay algo que me espera al otro lado aquí",                     startMs: 32000, endMs: 36900 },
        { text: "De todo lo que construí para no ver así",                      startMs: 37000, endMs: 41400 },
        { text: "Mañanas de neón, cielos abiertos",                             startMs: 44000, endMs: 48400 },
        { text: "Puedo sentir cómo todo va subiendo",                           startMs: 48500, endMs: 53400 },
        { text: "Mañanas de neón, sin despedidas",                              startMs: 53500, endMs: 58400 },
        { text: "Solo donde el momento me lleve",                               startMs: 58500, endMs: 63900 },
      ],
      ar: [
        { text: "أنظر عبر الأفق وكل شيء يبدو جديداً",                          startMs: 0,     endMs: 4900 },
        { text: "يخترق الصباح النوافذ وأبدأ معك",                              startMs: 5000,  endMs: 9900 },
        { text: "شيء في هذه اللحظة ينادي باسمي",                               startMs: 10000, endMs: 14900 },
        { text: "لا شيء يبقى كما كان وأنا سعيد بذلك",                          startMs: 15000, endMs: 19900 },
        { text: "فأخذت نفساً عميقاً وبدأت من جديد",                             startMs: 22500, endMs: 27400 },
        { text: "أعد كل الألوان في مهب الريح",                                  startMs: 27500, endMs: 31900 },
        { text: "هناك شيء ينتظرني على الجانب الآخر",                            startMs: 32000, endMs: 36900 },
        { text: "من كل ما بنيت للاختباء والهروب",                               startMs: 37000, endMs: 41400 },
        { text: "صباحات النيون والسماء مفتوحة",                                 startMs: 44000, endMs: 48400 },
        { text: "أشعر بها وهي تعلو",                                            startMs: 48500, endMs: 53400 },
        { text: "صباحات النيون بلا وداع",                                       startMs: 53500, endMs: 58400 },
        { text: "فقط أينما تأخذني اللحظة",                                      startMs: 58500, endMs: 63900 },
      ],
    },
  },

  demo_002: {
    genre: "Soul",
    durationMs: 204000,
    lines: [
      { text: "Rain on the window, shadows on the wall",                        startMs: 0,     endMs: 5400 },
      { text: "I hear your voice somewhere inside the hall",                    startMs: 5500,  endMs: 10900 },
      { text: "We spoke in silences that filled the room",                      startMs: 11000, endMs: 15900 },
      { text: "Like clouds that gather just before the bloom",                  startMs: 16000, endMs: 21400 },
      // 2600 ms gap → new section
      { text: "And I am still finding echoes everywhere",                       startMs: 24000, endMs: 28900 },
      { text: "In every song and every breath of air",                          startMs: 29000, endMs: 33900 },
      { text: "You left a kind of light that stays behind",                     startMs: 34000, endMs: 38900 },
      { text: "The kind that lives inside a searching mind",                    startMs: 39000, endMs: 44400 },
      // 2600 ms gap → new section
      { text: "Echo in the rain, I hear you calling",                           startMs: 47000, endMs: 51900 },
      { text: "Every time I feel the world is falling",                         startMs: 52000, endMs: 56900 },
      { text: "Echo in the rain, you carry me through",                         startMs: 57000, endMs: 61900 },
      { text: "There is nowhere that I go that is not you",                     startMs: 62000, endMs: 66900 },
    ],
    translations: {
      es: [
        { text: "Lluvia en la ventana, sombras en la pared",                    startMs: 0,     endMs: 5400 },
        { text: "Escucho tu voz en algún lugar del pasillo",                    startMs: 5500,  endMs: 10900 },
        { text: "Hablamos en silencios que llenaban la habitación",             startMs: 11000, endMs: 15900 },
        { text: "Como nubes que se juntan justo antes del florecer",            startMs: 16000, endMs: 21400 },
        { text: "Y aún encuentro ecos en todas partes",                         startMs: 24000, endMs: 28900 },
        { text: "En cada canción y cada soplo de aire",                         startMs: 29000, endMs: 33900 },
        { text: "Dejaste un tipo de luz que se queda atrás",                    startMs: 34000, endMs: 38900 },
        { text: "La que vive dentro de una mente que busca",                    startMs: 39000, endMs: 44400 },
        { text: "Eco en la lluvia, te escucho llamar",                          startMs: 47000, endMs: 51900 },
        { text: "Cada vez que siento que el mundo cae",                         startMs: 52000, endMs: 56900 },
        { text: "Eco en la lluvia, me llevas contigo",                          startMs: 57000, endMs: 61900 },
        { text: "No hay lugar al que vaya donde no estés",                      startMs: 62000, endMs: 66900 },
      ],
    },
  },

  demo_003: {
    genre: "Indie",
    durationMs: 189000,
    lines: [
      { text: "Standing at the edge of everything I have known",               startMs: 0,     endMs: 5400 },
      { text: "The road ahead is long but I am not alone",                     startMs: 5500,  endMs: 10900 },
      { text: "Every star above was placed for nights like these",              startMs: 11000, endMs: 15900 },
      { text: "To guide us through the dark and bring us to our knees",        startMs: 16000, endMs: 20900 },
      // 2600 ms gap → new section
      { text: "I have been the one who waits beside the shore",                startMs: 23500, endMs: 28400 },
      { text: "Trading questions for the answers I am looking for",            startMs: 28500, endMs: 33400 },
      { text: "But maybe all the searching is the point itself",               startMs: 33500, endMs: 38400 },
      { text: "A thousand lights to find before I find myself",                startMs: 38500, endMs: 43400 },
      // 2600 ms gap → new section
      { text: "Thousand lights above, thousand lights below",                  startMs: 46000, endMs: 50900 },
      { text: "In between is where the rivers learn to flow",                  startMs: 51000, endMs: 55900 },
      { text: "Thousand lights remind me what I came here for",                startMs: 56000, endMs: 60900 },
      { text: "To find the voice that I have never found before",              startMs: 61000, endMs: 65900 },
    ],
    translations: {},
  },
};

// Generic fallback lines for non-demo tracks (no copyrighted content)
const GENERIC_DEMO_LINES: RawLine[] = [
  { text: "The stage is set and the lights are low",                           startMs: 0,     endMs: 4900 },
  { text: "I step into the moment and let the music flow",                     startMs: 5000,  endMs: 9900 },
  { text: "Every note I sing is something new to find",                        startMs: 10000, endMs: 14900 },
  { text: "A story only music leaves behind",                                  startMs: 15000, endMs: 19900 },
  { text: "Rise and let your voice be heard tonight",                          startMs: 22500, endMs: 27400 },
  { text: "StageOne is where your story finds its light",                      startMs: 27500, endMs: 31900 },
];

// ---------------------------------------------------------------------------
// Helpers — Musixmatch API callers and parsers
// ---------------------------------------------------------------------------

type MxStatus = { status_code: number };

function mxStatus(data: unknown): number {
  return (data as { message?: { header?: MxStatus } })?.message?.header?.status_code ?? -1;
}

function mxBody(data: unknown): Record<string, unknown> {
  return (data as { message?: { body?: Record<string, unknown> } })?.message?.body ?? {};
}

async function mxFetch(path: string, apiKey: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `https://api.musixmatch.com/ws/1.1/${path}&apikey=${apiKey}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  return { status: mxStatus(data), body: mxBody(data) };
}

// Parse Musixmatch subtitle_body JSON into RawLine[]
function parseSubtitleBody(raw: string): RawLine[] {
  try {
    const parsed = JSON.parse(raw) as Array<{
      text: string;
      time: { total: number };
    }>;
    return parsed
      .filter((item) => item.text.trim() !== "")
      .map((item, idx, arr) => {
        const startMs = Math.round(item.time.total * 1000);
        const nextStartMs = arr[idx + 1] ? Math.round(arr[idx + 1].time.total * 1000) : startMs + 5000;
        return { text: item.text, startMs, endMs: nextStartMs - 100 };
      });
  } catch {
    return [];
  }
}

// Parse plain lyrics_body text (no timing)
function parsePlainLyrics(raw: string): RawLine[] {
  return raw
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith("****") && !t.startsWith("This Lyrics"))
    .map((text) => ({ text, startMs: null, endMs: null }));
}

// Convert RawLine[] to LyricLine[] by adding index and words.
// For synced lines (startMs/endMs set), words is a single-word entry spanning the line.
// For plain lines (null timing), words is empty.
function toIndexedLines(raws: RawLine[]): LyricLine[] {
  return raws.map((r, i) => ({
    index: i,
    text: r.text,
    startMs: r.startMs,
    endMs: r.endMs,
    words: r.startMs !== null && r.endMs !== null
      ? [{ text: r.text, startMs: r.startMs, endMs: r.endMs }]
      : [],
  }));
}

// Segment label helpers
function timedSegLabel(s: number, total: number): string {
  if (total === 1) return "Full Song";
  if (s === 0) return "Opening";
  if (s === total - 1) return "Closing";
  return `Section ${s + 1}`;
}
function plainSegLabel(s: number, total: number): string {
  if (total === 1) return "Selected Section";
  return ["Opening Lines", "Middle Section", "Closing Lines"][s] ?? `Section ${s + 1}`;
}

// Derive segments from lines.
// – Timed lines  → group by ≥ 2000 ms silence gaps; each segment carries real startMs/endMs.
// – Plain lines  → split into ≤ 3 equal groups; startMs/endMs are null.
// Never returns startMs === 0 and endMs === 0 (the old broken placeholder).
export function deriveSegments(lines: LyricLine[]): Segment[] {
  if (lines.length === 0) return [];

  const timed = lines.filter((l) => l.startMs !== null && l.endMs !== null);

  if (timed.length >= 2) {
    // Find section break-points (gaps ≥ 2 s)
    const breaks: number[] = [];
    for (let i = 1; i < timed.length; i++) {
      const gap = (timed[i].startMs ?? 0) - (timed[i - 1].endMs ?? 0);
      if (gap >= 2000) breaks.push(i);
    }
    const boundaries = [0, ...breaks, timed.length];
    const total = boundaries.length - 1;
    return boundaries.slice(0, -1).map((si, s) => {
      const ei = boundaries[s + 1] - 1;
      const seg = timed.slice(si, ei + 1);
      // Map back to original line indexes
      const startLineIndex = lines.indexOf(seg[0]);
      const endLineIndex   = lines.indexOf(seg[seg.length - 1]);
      return {
        id: `seg_${s}`,
        label: timedSegLabel(s, total),
        startMs: seg[0].startMs,
        endMs:   seg[seg.length - 1].endMs,
        startLineIndex: startLineIndex >= 0 ? startLineIndex : si,
        endLineIndex:   endLineIndex   >= 0 ? endLineIndex   : ei,
        lineCount: seg.length,
      };
    });
  }

  if (timed.length === 1) {
    const l = timed[0];
    const idx = lines.indexOf(l);
    return [{
      id: "seg_0",
      label: "Full Song",
      startMs: l.startMs,
      endMs: l.endMs,
      startLineIndex: idx >= 0 ? idx : 0,
      endLineIndex:   idx >= 0 ? idx : 0,
      lineCount: 1,
    }];
  }

  // Plain / no timing — split into ≤ 3 equal sections
  const n = lines.length;
  const sectionCount = n <= 4 ? 1 : n <= 10 ? 2 : 3;
  const chunk = Math.ceil(n / sectionCount);
  return Array.from({ length: sectionCount }, (_, s) => {
    const startLineIndex = s * chunk;
    const endLineIndex   = Math.min((s + 1) * chunk - 1, n - 1);
    return {
      id: `seg_${s}`,
      label: plainSegLabel(s, sectionCount),
      startMs: null,
      endMs: null,
      startLineIndex,
      endLineIndex,
      lineCount: endLineIndex - startLineIndex + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// getLyrics — unified resolver with priority chain:
//   1. RichSync (word-level timing)
//   2. Subtitles (line-level timing)   — skipped when body is empty (plan restriction)
//   3. Plain lyrics (no timing)
//   4. Demo / generic fallback
//   5. source:"unavailable" when everything fails for a real track
//
// Never returns hasSync:true with lines:[] — either real lines are present
// or we fall to the next tier.
// ---------------------------------------------------------------------------
async function getLyrics(trackId: string, apiKey: string | undefined): Promise<LyricsResponse> {
  const demo = DEMO_TRACKS[trackId];

  if (apiKey) {
    // ── Step 1: track metadata ──────────────────────────────────────────────
    let durationMs: number | null = null;
    let language: string | null   = null;
    try {
      const trackResult = await mxFetch(`track.get?track_id=${trackId}`, apiKey);
      if (trackResult.status === 200) {
        const track = trackResult.body.track as Record<string, unknown> | undefined;
        const sec   = track?.track_length as number | undefined;
        durationMs  = sec != null ? Math.round(sec * 1000) : null;
        language    = (track?.lyrics_language as string | undefined) ?? null;
      }
    } catch { /* non-fatal — carry on without duration */ }

    // ── Step 2: RichSync ────────────────────────────────────────────────────
    try {
      const richResult = await mxFetch(`track.richsync.get?track_id=${trackId}`, apiKey);
      if (richResult.status === 200) {
        const richObj  = richResult.body.richsync as Record<string, unknown> | undefined;
        const richBody = richObj?.richsync_body as string | undefined;
        if (richBody) {
          const parsed = parseRichsyncBody(richBody);
          if (parsed.length > 0) {
            const copyright = (richObj?.richsync_copyright_notice as string | undefined) ?? null;
            const lines: LyricLine[] = parsed.map((l, i) => ({
              index: i,
              text:  l.text,
              startMs: l.startMs,
              endMs:   l.endMs,
              words:   l.words,
            }));
            return {
              source: "musixmatch", mode: "richsync", trackId, durationMs,
              hasSync: true, hasRichsync: true, language, copyright, available: true, lines,
            };
          }
        }
      }
      // 404 = no richsync for this track; 403 = plan; empty body → fall through
    } catch { /* fall through */ }

    // ── Step 3: Subtitles ───────────────────────────────────────────────────
    try {
      const subResult = await mxFetch(`track.subtitle.get?track_id=${trackId}`, apiKey);
      if (subResult.status === 200) {
        const subObj  = subResult.body.subtitle as Record<string, unknown> | undefined;
        const subBody = subObj?.subtitle_body as string | undefined;
        if (subBody) {
          const parsed = parseSubtitleBody(subBody);
          if (parsed.length > 0) {
            const copyright = (subObj?.subtitle_copyright_notice as string | undefined) ?? null;
            return {
              source: "musixmatch", mode: "subtitle", trackId, durationMs,
              hasSync: true, hasRichsync: false, language, copyright, available: true,
              lines: toIndexedLines(parsed),
            };
          }
          // body exists but parsed to 0 lines (empty string on restricted plan) → fall through
        }
      }
    } catch { /* fall through */ }

    // ── Step 4: Plain lyrics ─────────────────────────────────────────────────
    try {
      const plainResult = await mxFetch(`track.lyrics.get?track_id=${trackId}`, apiKey);
      if (plainResult.status === 200) {
        const lyrObj    = plainResult.body.lyrics as Record<string, unknown> | undefined;
        const lyrBody   = lyrObj?.lyrics_body as string | undefined;
        const copyright = (lyrObj?.lyrics_copyright_notice as string | undefined) ?? null;
        if (lyrBody) {
          const parsed = parsePlainLyrics(lyrBody);
          if (parsed.length > 0) {
            return {
              source: "musixmatch", mode: "plain", trackId, durationMs,
              hasSync: false, hasRichsync: false, language, copyright, available: true,
              lines: toIndexedLines(parsed),
            };
          }
        }
      }
    } catch { /* fall through */ }

    // ── All Musixmatch methods failed for this real track ───────────────────
    return {
      source: "unavailable", mode: "plain", trackId, durationMs,
      hasSync: false, hasRichsync: false, language: null, copyright: null,
      available: false, reason: "No usable lyric body was returned for this track.",
      lines: [],
    };
  }

  // ── Demo / no-API-key fallback ────────────────────────────────────────────
  const rawLines  = demo?.lines ?? GENERIC_DEMO_LINES;
  const demoMs    = demo?.durationMs ?? null;
  const demoLines = toIndexedLines(rawLines);
  return {
    source: "demo", mode: "demo", trackId, durationMs: demoMs,
    hasSync: true, hasRichsync: false, language: null, copyright: null,
    available: true, lines: demoLines,
  };
}

// ---------------------------------------------------------------------------
// Mood mapping table (local — no Musixmatch endpoint)
// ---------------------------------------------------------------------------

interface MoodEntry {
  tags: string[];
  primaryMood: string;
  accentColor: string;
}

const GENRE_TO_MOOD: Record<string, MoodEntry> = {
  Pop:         { tags: ["joy", "energy", "optimism"],           primaryMood: "joy",           accentColor: "#EC4899" },
  Soul:        { tags: ["longing", "heartfelt", "warmth"],      primaryMood: "heartfelt",     accentColor: "#A855F7" },
  "R&B":       { tags: ["passion", "longing", "confidence"],    primaryMood: "passion",       accentColor: "#F97316" },
  "R&B/Soul":  { tags: ["passion", "longing", "heartfelt"],     primaryMood: "longing",       accentColor: "#6366F1" },
  Rock:        { tags: ["power", "resilience", "freedom"],      primaryMood: "power",         accentColor: "#EF4444" },
  "Indie":     { tags: ["reflection", "wonder", "authenticity"],primaryMood: "reflection",    accentColor: "#14B8A6" },
  "Indie Rock":{ tags: ["reflection", "wonder", "authenticity"],primaryMood: "wonder",        accentColor: "#3B82F6" },
  Country:     { tags: ["nostalgia", "heartbreak", "hope"],     primaryMood: "nostalgia",     accentColor: "#F59E0B" },
  Jazz:        { tags: ["sophistication", "melancholy", "warmth"],primaryMood: "melancholy",  accentColor: "#8B5CF6" },
  Gospel:      { tags: ["faith", "uplifting", "community"],     primaryMood: "uplifting",     accentColor: "#10B981" },
  "Hip-Hop":   { tags: ["confidence", "struggle", "triumph"],   primaryMood: "confidence",    accentColor: "#A855F7" },
  Electronic:  { tags: ["energy", "euphoria", "escapism"],      primaryMood: "energy",        accentColor: "#F59E0B" },
  Acoustic:    { tags: ["intimacy", "vulnerability", "serenity"],primaryMood: "intimacy",     accentColor: "#8B5CF6" },
  Classical:   { tags: ["elegance", "emotion", "depth"],        primaryMood: "elegance",      accentColor: "#6366F1" },
  "Latin Pop": { tags: ["passion", "joy", "celebration"],       primaryMood: "celebration",   accentColor: "#F97316" },
};

const DEFAULT_MOOD: MoodEntry = {
  tags: ["expression", "feeling", "connection"],
  primaryMood: "expression",
  accentColor: "#A855F7",
};

const MOOD_ACCENT_COLORS: Record<string, string> = {
  Love: "#EC4899",
  Heartbreak: "#6366F1",
  Joy: "#F59E0B",
  Empowerment: "#A855F7",
  Angst: "#EF4444",
  Reflection: "#14B8A6",
  Inspiration: "#10B981",
  Nostalgia: "#8B5CF6",
  Despair: "#3B82F6",
  Celebration: "#F97316",
  Anger: "#EF4444",
  Peace: "#10B981",
  Solitude: "#6366F1",
  Adventure: "#F59E0B",
  "Social Commentary": "#A855F7",
  Hope: "#10B981",
  Spirituality: "#8B5CF6",
  Freedom: "#14B8A6",
  Party: "#EC4899",
  Nature: "#10B981",
};

function isKnownTrack(trackId: string): boolean {
  return CATALOGUE.some((t) => t.track_id === trackId);
}

function moodForGenre(genre: string): MoodEntry {
  if (GENRE_TO_MOOD[genre]) return GENRE_TO_MOOD[genre];
  const key = Object.keys(GENRE_TO_MOOD).find((k) => genre.toLowerCase().includes(k.toLowerCase()));
  return key ? GENRE_TO_MOOD[key] : DEFAULT_MOOD;
}

function parseRichsyncBody(raw: string): RichsyncLine[] {
  try {
    const parsed = JSON.parse(raw) as Array<{
      ts: number;
      te: number;
      l: Array<{ c: string; o: number }>;
    }>;
    return parsed
      .filter((entry) => entry.l.some((w) => w.c.trim() !== "" && w.c !== "♫"))
      .map((entry) => {
        const lineStartMs = Math.round(entry.ts * 1000);
        const lineEndMs = Math.round(entry.te * 1000);
        const words: RichsyncWord[] = entry.l
          .filter((w) => w.c.trim() !== "" && w.c !== "♫")
          .map((w, i, arr) => {
            const wordStartMs = Math.round((entry.ts + w.o) * 1000);
            const nextOffset = arr[i + 1]?.o;
            const wordEndMs =
              nextOffset !== undefined
                ? Math.round((entry.ts + nextOffset) * 1000)
                : lineEndMs;
            return { text: w.c, startMs: wordStartMs, endMs: wordEndMs };
          });
        const text = entry.l.map((w) => w.c).join("").trim();
        return { text, startMs: lineStartMs, endMs: lineEndMs, words };
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/search
// ---------------------------------------------------------------------------

router.get("/musixmatch/search", async (req, res) => {
  const q = (req.query.q as string)?.trim() ?? "";
  if (!q) return res.json({ tracks: [], source: "demo" });

  const apiKey = process.env.MUSIXMATCH_API_KEY;
  if (apiKey) {
    try {
      const result = await mxFetch(
        `track.search?q_track_artist=${encodeURIComponent(q)}&page_size=15&page=1&s_track_rating=desc&f_has_lyrics=1`,
        apiKey,
      );
      if (result.status === 200) {
        const trackList = (result.body.track_list as Array<Record<string, Record<string, unknown>>>) ?? [];
        const tracks = trackList.map((item) => {
          const t = item.track;
          const genreList = (t.primary_genres as Record<string, unknown>)?.music_genre_list as
            | Array<{ music_genre: { music_genre_name: string } }>
            | undefined;
          const genre = genreList?.[0]?.music_genre?.music_genre_name || undefined;
          return {
            track_id: String(t.track_id),
            track_name: t.track_name,
            artist_name: t.artist_name,
            album_name: t.album_name,
            ...(genre ? { genre } : {}),
          };
        });
        return res.json({ tracks, source: "musixmatch" });
      }
    } catch (err) {
      req.log.warn({ err }, "Musixmatch search error, falling back to demo");
    }
  }

  const lower = q.toLowerCase();
  const filtered = CATALOGUE.filter(
    (t) =>
      t.track_name.toLowerCase().includes(lower) ||
      t.artist_name.toLowerCase().includes(lower) ||
      t.album_name.toLowerCase().includes(lower),
  );
  return res.json({ tracks: filtered.length > 0 ? filtered : CATALOGUE.slice(0, 8), source: "demo" });
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/track/:trackId
// ---------------------------------------------------------------------------

router.get("/musixmatch/track/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  if (apiKey) {
    try {
      const result = await mxFetch(`track.get?track_id=${trackId}`, apiKey);
      if (result.status === 200) {
        return res.json({ track: result.body.track, source: "musixmatch" });
      }
    } catch (err) {
      req.log.warn({ err }, "Musixmatch track.get error");
    }
  }

  const entry = CATALOGUE.find((t) => t.track_id === trackId);
  if (entry) return res.json({ track: entry, source: "demo" });
  return res.status(404).json({ error: "track_not_found" });
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/richsync/:trackId
// Returns word-level timing when available (hasRichsync=true), otherwise
// line-level data wrapped in the same shape (hasRichsync=false).
// Uses getLyrics() so the full richsync → subtitle → plain fallback chain
// is applied consistently.
// ---------------------------------------------------------------------------

router.get("/musixmatch/richsync/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  const lyricResult = await getLyrics(trackId, apiKey).catch((): LyricsResponse => ({
    source: "demo", mode: "demo", trackId, durationMs: null,
    hasSync: true, hasRichsync: false, language: null, copyright: null, available: true,
    lines: toIndexedLines(GENERIC_DEMO_LINES),
  }));

  if (lyricResult.source === "demo" && !isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }
  if (lyricResult.source === "unavailable" || lyricResult.lines.length === 0) {
    return res.status(404).json({ error: "track_not_found" });
  }

  // Build RichsyncResponse from the resolved lyrics.
  // When mode="richsync" lines already carry per-word timing from getLyrics.
  // When mode="subtitle" or "plain", wrap each line as a single-word entry.
  const richLines: RichsyncLine[] = lyricResult.lines
    .filter((l) => l.startMs !== null && l.endMs !== null)
    .map((l) => ({
      text: l.text,
      startMs: l.startMs as number,
      endMs:   l.endMs   as number,
      words: l.words.length > 0
        ? l.words
        : [{ text: l.text, startMs: l.startMs as number, endMs: l.endMs as number }],
    }));

  if (richLines.length === 0 && lyricResult.mode !== "richsync") {
    // Plain lyrics have no timing — return 404 for richsync endpoint
    return res.status(404).json({ error: "no_richsync_available" });
  }

  const response: RichsyncResponse = {
    source: lyricResult.source as LyricSource,
    trackId,
    durationMs: lyricResult.durationMs,
    hasRichsync: lyricResult.hasRichsync,
    lines: richLines,
  };
  return res.json(response);
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/lyrics/:trackId
// ---------------------------------------------------------------------------

router.get("/musixmatch/lyrics/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  const result = await getLyrics(trackId, apiKey).catch((): LyricsResponse => ({
    source: "demo", mode: "demo", trackId, durationMs: null,
    hasSync: true, hasRichsync: false, language: null, copyright: null, available: true,
    lines: toIndexedLines(GENERIC_DEMO_LINES),
  }));

  if (result.source === "demo" && !isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }
  return res.json(result);
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/segments/:trackId
// ---------------------------------------------------------------------------

router.get("/musixmatch/segments/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  const lyricResult = await getLyrics(trackId, apiKey).catch((): LyricsResponse => ({
    source: "demo", mode: "demo", trackId, durationMs: null,
    hasSync: true, hasRichsync: false, language: null, copyright: null, available: true,
    lines: toIndexedLines(GENERIC_DEMO_LINES),
  }));

  if (lyricResult.source === "demo" && !isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }

  // Unavailable or empty — return clear state, no segments
  if (lyricResult.source === "unavailable" || lyricResult.lines.length === 0) {
    const response: SegmentsResponse = {
      source: "unavailable", trackId, timingMode: "manual",
      hasSync: false, segments: [],
      reason: lyricResult.reason ?? "No usable lyrics available for this track.",
    };
    return res.json(response);
  }

  const segments = deriveSegments(lyricResult.lines);
  const timingMode: TimingMode =
    lyricResult.mode === "richsync" ? "richsync"
    : lyricResult.mode === "subtitle" ? "subtitle"
    : lyricResult.mode === "demo"     ? "demo"
    : "manual";

  const response: SegmentsResponse = {
    source: lyricResult.source as LyricSource,
    trackId,
    timingMode,
    hasSync: lyricResult.hasSync,
    segments,
    reason: null,
  };
  return res.json(response);
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/translate/:trackId/:lang
// ---------------------------------------------------------------------------

router.get("/musixmatch/translate/:trackId/:lang", async (req, res) => {
  const { trackId, lang } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  // Try real Musixmatch translation
  if (apiKey) {
    try {
      // Step 1 — get source language and track metadata from track.get
      let srcLang: string | undefined;
      const trackResult = await mxFetch(`track.get?track_id=${trackId}`, apiKey);

      if (trackResult.status === 200) {
        const track = trackResult.body.track as Record<string, unknown> | undefined;
        srcLang = track?.lyrics_language as string | undefined;

        // Step 2 — request the translation
        const translResult = await mxFetch(
          `track.lyrics.translation.get?track_id=${trackId}&selected_language=${lang}`,
          apiKey,
        );

        if (translResult.status === 200) {
          const lyricsBody = (translResult.body.lyrics as Record<string, unknown>)?.lyrics_body as string | undefined;

          // availableLanguages built dynamically: source language + target if translation succeeded
          const availableLanguages = [
            ...(srcLang ? [srcLang] : []),
            ...(lyricsBody ? [lang] : []),
          ].filter((v, i, a) => a.indexOf(v) === i);

          if (lyricsBody) {
            const originalResult = await getLyrics(trackId, apiKey).catch(() => null);
            const translRaw = parsePlainLyrics(lyricsBody);

            let alignedLines: LyricLine[];
            const origLines = originalResult?.lines ?? [];
            if (originalResult?.hasSync && translRaw.length === origLines.length) {
              alignedLines = origLines.map((orig, i) => ({
                index: i,
                text: translRaw[i].text,
                startMs: orig.startMs,
                endMs: orig.endMs,
                words: [],
              }));
            } else {
              alignedLines = translRaw.map((r, i) => ({
                index: i, text: r.text, startMs: null, endMs: null, words: [],
              }));
            }

            const response: TranslationResponse = {
              source: "musixmatch",
              trackId,
              targetLanguage: lang,
              lines: alignedLines,
              availableLanguages,
            };
            return res.json(response);
          }

          // 200 from translation but no body content
          const response: TranslationResponse = {
            source: "musixmatch",
            trackId,
            targetLanguage: lang,
            lines: null,
            availableLanguages: srcLang ? [srcLang] : [],
          };
          return res.json(response);
        }

        // Translation returned non-200 (language not available for this track)
        const response: TranslationResponse = {
          source: "musixmatch",
          trackId,
          targetLanguage: lang,
          lines: null,
          availableLanguages: srcLang ? [srcLang] : [],
        };
        return res.json(response);
      }

      // track.get returned non-200 → fall through to demo
    } catch (err) {
      req.log.warn({ err }, "Musixmatch translation error");
    }
  }

  // Demo fallback — unknown tracks get 404 in demo mode
  if (!isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }

  // Demo tracks have pre-built translations.
  // Spec: availableLanguages must be [] when Musixmatch returns 401.
  const demo = DEMO_TRACKS[trackId];
  if (demo?.translations[lang]) {
    const response: TranslationResponse = {
      source: "demo",
      trackId,
      targetLanguage: lang,
      lines: toIndexedLines(demo.translations[lang]!),
      availableLanguages: [], // empty per spec when Musixmatch 401
    };
    return res.json(response);
  }

  // Translation not available for this language
  const response: TranslationResponse = {
    source: "demo",
    trackId,
    targetLanguage: lang,
    lines: null,
    availableLanguages: [], // empty per spec when Musixmatch 401
  };
  return res.json(response);
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/mood/:trackId
// ---------------------------------------------------------------------------

router.get("/musixmatch/mood/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  if (apiKey) {
    // Step 1 — Try real mood/theme data from Musixmatch Analysis API
    try {
      const analysisResult = await mxFetch(
        `track.lyrics.analysis.get?track_id=${trackId}`,
        apiKey,
      );
      if (analysisResult.status === 200) {
        const body = analysisResult.body;
        const analysisObj = (
          (body.lyrics_analysis ?? body.analysis) as Record<string, unknown> | undefined
        );
        if (analysisObj) {
          const rawMoods = analysisObj.moods as
            | Array<string | { mood: string } | Record<string, unknown>>
            | undefined;
          const moodStrings = rawMoods
            ? rawMoods
                .map((m) =>
                  typeof m === "string"
                    ? m
                    : typeof m === "object" && "mood" in m
                      ? String(m.mood ?? "")
                      : "",
                )
                .filter(Boolean)
            : [];
          if (moodStrings.length > 0) {
            const primaryMood = moodStrings[0];
            const accentColor = MOOD_ACCENT_COLORS[primaryMood] ?? DEFAULT_MOOD.accentColor;
            const meaning = analysisObj.meaning as string | undefined;
            const rating = analysisObj.rating as string | undefined;
            const response: MoodResponse = {
              source: "musixmatch",
              trackId,
              moodTags: moodStrings,
              primaryMood,
              accentColor,
              ...(meaning ? { meaning } : {}),
              ...(rating ? { rating } : {}),
            };
            return res.json(response);
          }
        }
      }
      // 403 = Analysis API not on this plan — fall through to genre-based
    } catch (err) {
      req.log.warn({ err }, "Musixmatch track.lyrics.analysis.get error, falling back");
    }

    // Step 2 — Fall back: derive mood from genre via track.get
    try {
      const result = await mxFetch(`track.get?track_id=${trackId}`, apiKey);
      if (result.status === 200) {
        const track = result.body.track as Record<string, unknown> | undefined;
        const genreList = (track?.primary_genres as Record<string, unknown>)
          ?.music_genre_list as
          | Array<{ music_genre: { music_genre_name: string } }>
          | undefined;
        const genre = genreList?.[0]?.music_genre?.music_genre_name ?? "";
        const mood = moodForGenre(genre);
        const response: MoodResponse = {
          source: "derived",
          trackId,
          moodTags: mood.tags,
          primaryMood: mood.primaryMood,
          accentColor: mood.accentColor,
        };
        return res.json(response);
      }
    } catch (err) {
      req.log.warn({ err }, "Musixmatch track.get error in mood route");
    }
  }

  // Demo / no-API-key fallback — only serve known tracks
  if (!isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }
  const genre = DEMO_TRACKS[trackId]?.genre ?? "";
  const mood = moodForGenre(genre);
  const response: MoodResponse = {
    source: "derived",
    trackId,
    moodTags: mood.tags,
    primaryMood: mood.primaryMood,
    accentColor: mood.accentColor,
  };
  return res.json(response);
});

export default router;

// ---------------------------------------------------------------------------
// Exported TypeScript contract — mirrored in mobile lib/musixmatch.ts
// ---------------------------------------------------------------------------
//
// LyricsResponse      → GET /api/musixmatch/lyrics/:trackId
// SegmentsResponse    → GET /api/musixmatch/segments/:trackId
// TranslationResponse → GET /api/musixmatch/translate/:trackId/:lang
// MoodResponse        → GET /api/musixmatch/mood/:trackId
//                        source:"musixmatch" when track.lyrics.analysis.get succeeds
//                        source:"derived"    when falling back to genre-based local mapping
// RichsyncResponse    → GET /api/musixmatch/richsync/:trackId
//                        hasRichsync:true  — word-level timing from track.richsync.get
//                        hasRichsync:false — line-level subtitle data in same shape
// ---------------------------------------------------------------------------

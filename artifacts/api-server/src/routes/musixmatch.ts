import { Router } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Types — exported at the bottom of this file for the mobile layer to import
// ---------------------------------------------------------------------------

export type LyricSource = "musixmatch" | "demo";

export interface LyricLine {
  text: string;
  startMs: number | null;
  endMs: number | null;
}

export interface LyricsResponse {
  source: LyricSource;
  trackId: string;
  durationMs: number | null;
  hasSync: boolean;
  lines: LyricLine[];
}

export interface Segment {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  lineCount: number;
}

export interface SegmentsResponse {
  source: LyricSource;
  trackId: string;
  segments: Segment[];
}

export interface TranslationResponse {
  source: LyricSource;
  trackId: string;
  targetLanguage: string;
  lines: LyricLine[] | null;    // null = translation not available for this language
  availableLanguages: string[]; // empty when Musixmatch 401; demo tracks list known langs
}

export interface MoodResponse {
  source: "derived";
  trackId: string;
  moodTags: string[];
  primaryMood: string;
  accentColor: string;
}

// ---------------------------------------------------------------------------
// Track catalogue — real Musixmatch IDs for search; demo tracks for lyrics
// ---------------------------------------------------------------------------

interface CatalogueTrack {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string;
}

const CATALOGUE: CatalogueTrack[] = [
  { track_id: "demo_001", track_name: "Neon Mornings", artist_name: "StageOne Artists", album_name: "Demo Sessions Vol. 1" },
  { track_id: "demo_002", track_name: "Echo in the Rain", artist_name: "StageOne Artists", album_name: "Demo Sessions Vol. 1" },
  { track_id: "demo_003", track_name: "Thousand Lights", artist_name: "StageOne Artists", album_name: "Demo Sessions Vol. 1" },
  { track_id: "12345", track_name: "Golden Hour", artist_name: "JVKE", album_name: "this is what falling in love feels like" },
  { track_id: "67890", track_name: "Fix You", artist_name: "Coldplay", album_name: "X&Y" },
  { track_id: "11111", track_name: "Starlight", artist_name: "Taylor Swift", album_name: "Taylor Swift" },
  { track_id: "22222", track_name: "Blinding Lights", artist_name: "The Weeknd", album_name: "After Hours" },
  { track_id: "33333", track_name: "Someone Like You", artist_name: "Adele", album_name: "21" },
  { track_id: "44444", track_name: "Shallow", artist_name: "Lady Gaga & Bradley Cooper", album_name: "A Star Is Born" },
  { track_id: "55555", track_name: "Perfect", artist_name: "Ed Sheeran", album_name: "Divide" },
  { track_id: "66666", track_name: "Bohemian Rhapsody", artist_name: "Queen", album_name: "A Night at the Opera" },
  { track_id: "77777", track_name: "Hallelujah", artist_name: "Leonard Cohen", album_name: "Various Positions" },
  { track_id: "88888", track_name: "Try Again", artist_name: "Aaliyah", album_name: "Romeo Must Die" },
  { track_id: "99999", track_name: "Home", artist_name: "Michael Bublé", album_name: "It's Time" },
  { track_id: "10001", track_name: "Stay", artist_name: "The Kid LAROI & Justin Bieber", album_name: "F*CK LOVE 3" },
  { track_id: "10002", track_name: "As It Was", artist_name: "Harry Styles", album_name: "Harry's House" },
  { track_id: "10003", track_name: "Levitating", artist_name: "Dua Lipa", album_name: "Future Nostalgia" },
  { track_id: "10004", track_name: "Flowers", artist_name: "Miley Cyrus", album_name: "Endless Summer Vacation" },
];

// ---------------------------------------------------------------------------
// Demo lyric data — original placeholder lyrics, manually timed (not BPM-derived)
// Section breaks are gaps ≥ 2600 ms between consecutive lines.
// ---------------------------------------------------------------------------

interface DemoTrack {
  genre: string;
  durationMs: number;
  lines: LyricLine[];
  translations: Partial<Record<string, LyricLine[]>>;
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
const GENERIC_DEMO_LINES: LyricLine[] = [
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

// Parse Musixmatch subtitle_body JSON into LyricLine[]
function parseSubtitleBody(raw: string): LyricLine[] {
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
function parsePlainLyrics(raw: string): LyricLine[] {
  return raw
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith("****") && !t.startsWith("This Lyrics"))
    .map((text) => ({ text, startMs: null, endMs: null }));
}

// Derive segments from timed lines using ≥ 2000 ms silence gaps
export function deriveSegments(lines: LyricLine[]): Segment[] {
  const synced = lines.filter((l) => l.startMs !== null && l.endMs !== null);

  if (synced.length === 0) {
    return [{ id: "seg_0", label: "Selected Section", startMs: 0, endMs: 0, lineCount: lines.length }];
  }

  const breakPoints: number[] = [];
  for (let i = 1; i < synced.length; i++) {
    const gap = (synced[i].startMs ?? 0) - (synced[i - 1].endMs ?? 0);
    if (gap >= 2000) breakPoints.push(i);
  }

  if (breakPoints.length < 2) {
    return [
      {
        id: "seg_0",
        label: "Selected Section",
        startMs: synced[0].startMs ?? 0,
        endMs: synced[synced.length - 1].endMs ?? 0,
        lineCount: synced.length,
      },
    ];
  }

  const boundaries = [0, ...breakPoints, synced.length];
  return boundaries.slice(0, -1).map((startIdx, s) => {
    const endIdx = boundaries[s + 1] - 1;
    const segLines = synced.slice(startIdx, endIdx + 1);
    return {
      id: `seg_${s}`,
      label: `Section ${s + 1}`,
      startMs: segLines[0].startMs ?? 0,
      endMs: segLines[segLines.length - 1].endMs ?? 0,
      lineCount: segLines.length,
    };
  });
}

// Fetch lyrics for a trackId; returns LyricsResponse
async function getLyrics(trackId: string, apiKey: string | undefined): Promise<LyricsResponse> {
  const demo = DEMO_TRACKS[trackId];

  if (apiKey) {
    try {
      // Prefer subtitle (line-level sync)
      const sub = await mxFetch(`track.subtitle.get?track_id=${trackId}`, apiKey);
      if (sub.status === 200) {
        const subtitleBody = (sub.body.subtitle as Record<string, unknown>)?.subtitle_body as string | undefined;
        const lang = (sub.body.subtitle as Record<string, unknown>)?.subtitle_language as string | undefined;
        const lines = subtitleBody ? parseSubtitleBody(subtitleBody) : [];
        if (lines.length > 0) {
          return { source: "musixmatch", trackId, durationMs: null, hasSync: true, lines };
        }
      }

      // Fall back to plain lyrics
      const plain = await mxFetch(`track.lyrics.get?track_id=${trackId}`, apiKey);
      if (plain.status === 200) {
        const lyricsBody = (plain.body.lyrics as Record<string, unknown>)?.lyrics_body as string | undefined;
        if (lyricsBody) {
          return { source: "musixmatch", trackId, durationMs: null, hasSync: false, lines: parsePlainLyrics(lyricsBody) };
        }
      }
    } catch {
      // fall through to demo
    }
  }

  // Demo fallback
  const lines = demo?.lines ?? GENERIC_DEMO_LINES;
  const durationMs = demo?.durationMs ?? null;
  return { source: "demo", trackId, durationMs, hasSync: true, lines };
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

function isKnownTrack(trackId: string): boolean {
  return CATALOGUE.some((t) => t.track_id === trackId);
}

function moodForGenre(genre: string): MoodEntry {
  if (GENRE_TO_MOOD[genre]) return GENRE_TO_MOOD[genre];
  // Partial match
  const key = Object.keys(GENRE_TO_MOOD).find((k) => genre.toLowerCase().includes(k.toLowerCase()));
  return key ? GENRE_TO_MOOD[key] : DEFAULT_MOOD;
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
        `track.search?q_track_artist=${encodeURIComponent(q)}&page_size=15&page=1&s_track_rating=desc`,
        apiKey,
      );
      if (result.status === 200) {
        const trackList = (result.body.track_list as Array<Record<string, Record<string, unknown>>>) ?? [];
        const tracks = trackList.map((item) => {
          const t = item.track;
          return {
            track_id: String(t.track_id),
            track_name: t.track_name,
            artist_name: t.artist_name,
            album_name: t.album_name,
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
// Route: GET /musixmatch/lyrics/:trackId
// ---------------------------------------------------------------------------

router.get("/musixmatch/lyrics/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  const result = await getLyrics(trackId, apiKey).catch((): LyricsResponse => ({
    source: "demo",
    trackId,
    durationMs: null,
    hasSync: false,
    lines: GENERIC_DEMO_LINES,
  }));

  // In demo fallback, only return data for tracks we actually know about
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
    source: "demo",
    trackId,
    durationMs: null,
    hasSync: false,
    lines: GENERIC_DEMO_LINES,
  }));

  // In demo fallback, only return data for tracks we actually know about
  if (lyricResult.source === "demo" && !isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }
  const segments = deriveSegments(lyricResult.lines);
  const response: SegmentsResponse = { source: lyricResult.source as LyricSource, trackId, segments };
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
      const result = await mxFetch(
        `track.lyrics.translation.get?track_id=${trackId}&selected_language=${lang}`,
        apiKey,
      );
      if (result.status === 200) {
        const lyricsBody = (result.body.lyrics as Record<string, unknown>)?.lyrics_body as string | undefined;
        const srcLang = (result.body.lyrics as Record<string, unknown>)?.lyrics_language as string | undefined;
        if (lyricsBody) {
          // Get original lines for timing alignment
          const originalResult = await getLyrics(trackId, apiKey).catch(() => null);
          const translatedLines = parsePlainLyrics(lyricsBody);

          let alignedLines: LyricLine[];
          if (originalResult && translatedLines.length === originalResult.lines.length) {
            alignedLines = originalResult.lines.map((orig, i) => ({
              text: translatedLines[i].text,
              startMs: orig.startMs,
              endMs: orig.endMs,
            }));
          } else {
            alignedLines = translatedLines;
          }

          const response: TranslationResponse = {
            source: "musixmatch",
            trackId,
            targetLanguage: lang,
            lines: alignedLines,
            availableLanguages: srcLang ? [srcLang, lang] : [lang],
          };
          return res.json(response);
        }
      }
    } catch (err) {
      req.log.warn({ err }, "Musixmatch translation error");
    }
  }

  // Demo fallback — unknown tracks get 404 in demo mode
  if (!isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }

  // Demo tracks have pre-built translations; other catalogue tracks have none
  const demo = DEMO_TRACKS[trackId];
  if (demo?.translations[lang]) {
    const response: TranslationResponse = {
      source: "demo",
      trackId,
      targetLanguage: lang,
      lines: demo.translations[lang]!,
      availableLanguages: Object.keys(demo.translations),
    };
    return res.json(response);
  }

  // Translation not available — lines: null signals unavailability; source stays "demo"
  const response: TranslationResponse = {
    source: "demo",
    trackId,
    targetLanguage: lang,
    lines: null,
    // For demo tracks, list known languages; for other catalogue tracks in 401 mode, empty
    availableLanguages: demo ? Object.keys(demo.translations) : [],
  };
  return res.json(response);
});

// ---------------------------------------------------------------------------
// Route: GET /musixmatch/mood/:trackId
// ---------------------------------------------------------------------------

router.get("/musixmatch/mood/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  let genre = DEMO_TRACKS[trackId]?.genre;
  let resolvedViaMusixmatch = false;

  // Try to get genre from Musixmatch track.get
  if (apiKey) {
    try {
      const result = await mxFetch(`track.get?track_id=${trackId}`, apiKey);
      if (result.status === 200) {
        const track = result.body.track as Record<string, unknown> | undefined;
        const genreList = (track?.primary_genres as Record<string, unknown>)?.music_genre_list as
          | Array<{ music_genre: { music_genre_name: string } }>
          | undefined;
        if (genreList && genreList.length > 0) {
          genre = genreList[0].music_genre.music_genre_name;
        }
        resolvedViaMusixmatch = true;
      }
    } catch {
      // ignore — fall through to demo
    }
  }

  // In demo mode, only serve known tracks
  if (!resolvedViaMusixmatch && !isKnownTrack(trackId)) {
    return res.status(404).json({ error: "track_not_found" });
  }

  const mood = moodForGenre(genre ?? "");
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
// Exported TypeScript contract — copy/import in mobile lib/musixmatch.ts
// ---------------------------------------------------------------------------
//
// export type { LyricSource, LyricLine, LyricsResponse, Segment, SegmentsResponse,
//               TranslationResponse, MoodResponse } from "@workspace/api-server/src/routes/musixmatch";
//
// LyricsResponse   → GET /api/musixmatch/lyrics/:trackId
// SegmentsResponse → GET /api/musixmatch/segments/:trackId
// TranslationResponse → GET /api/musixmatch/translate/:trackId/:lang
// MoodResponse     → GET /api/musixmatch/mood/:trackId
// ---------------------------------------------------------------------------

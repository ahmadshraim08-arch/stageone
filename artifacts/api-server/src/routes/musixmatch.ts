import { Router } from "express";

const router = Router();

const MOCK_TRACKS = [
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
  { track_id: "99999", track_name: "Home", artist_name: "Michael Buble", album_name: "It's Time" },
  { track_id: "10001", track_name: "Stay", artist_name: "The Kid LAROI & Justin Bieber", album_name: "F*CK LOVE 3" },
  { track_id: "10002", track_name: "As It Was", artist_name: "Harry Styles", album_name: "Harry's House" },
  { track_id: "10003", track_name: "Levitating", artist_name: "Dua Lipa", album_name: "Future Nostalgia" },
  { track_id: "10004", track_name: "Flowers", artist_name: "Miley Cyrus", album_name: "Endless Summer Vacation" },
];

router.get("/api/musixmatch/search", async (req, res) => {
  const q = (req.query.q as string)?.trim() ?? "";

  if (!q) {
    return res.json({ tracks: [] });
  }

  const apiKey = process.env.MUSIXMATCH_API_KEY;

  if (apiKey) {
    try {
      const url = `https://api.musixmatch.com/ws/1.1/track.search?q_track_artist=${encodeURIComponent(q)}&page_size=15&page=1&s_track_rating=desc&apikey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data?.message?.header?.status_code === 200) {
        const trackList = data.message.body.track_list ?? [];
        const tracks = trackList.map((item: Record<string, Record<string, unknown>>) => {
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
      req.log.warn({ err }, "Musixmatch API error, falling back to mock data");
    }
  }

  const lower = q.toLowerCase();
  const filtered = MOCK_TRACKS.filter(
    (t) =>
      t.track_name.toLowerCase().includes(lower) ||
      t.artist_name.toLowerCase().includes(lower) ||
      t.album_name.toLowerCase().includes(lower)
  );

  res.json({ tracks: filtered.length > 0 ? filtered : MOCK_TRACKS.slice(0, 8), source: "mock" });
});

router.get("/api/musixmatch/track/:trackId", async (req, res) => {
  const { trackId } = req.params;
  const apiKey = process.env.MUSIXMATCH_API_KEY;

  if (apiKey) {
    try {
      const url = `https://api.musixmatch.com/ws/1.1/track.get?track_id=${trackId}&apikey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data?.message?.header?.status_code === 200) {
        return res.json({ track: data.message.body.track });
      }
    } catch (err) {
      req.log.warn({ err }, "Musixmatch track API error");
    }
  }

  const mock = MOCK_TRACKS.find((t) => t.track_id === trackId);
  if (mock) return res.json({ track: mock, source: "mock" });
  res.status(404).json({ error: "Track not found" });
});

export default router;

/**
 * Smoke tests for LyricStage Musixmatch endpoints.
 * Runtime: node:test (built-in, Node 24). No extra test-framework deps needed.
 * Runner: pnpm --filter @workspace/api-server run test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import pinoHttp from "pino-http";

// ---------------------------------------------------------------------------
// Pure-function helpers
// ---------------------------------------------------------------------------
import { deriveSegments, type LyricLine } from "./musixmatch";
import musixmatchRouter from "./musixmatch";

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------
type FetchLike = typeof fetch;

function use401Mock() {
  let saved: FetchLike;
  before(() => {
    saved = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> =>
      ({ json: async () => ({ message: { header: { status_code: 401 }, body: {} } }) }) as unknown as Response;
  });
  after(() => { globalThis.fetch = saved; });
}

function useMock(fn: FetchLike) {
  let saved: FetchLike;
  before(() => { saved = globalThis.fetch; globalThis.fetch = fn; });
  after(() => { globalThis.fetch = saved; });
}

// ---------------------------------------------------------------------------
// Minimal Express test-app factory
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(pinoHttp({ level: "silent" }));
  app.use("/api", musixmatchRouter);
  return app;
}

async function httpGet(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(buildApp());
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let raw = "";
        res.on("data", (c: Buffer) => { raw += c.toString(); });
        res.on("end", () => {
          server.close();
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch (e) { reject(e); }
        });
      }).on("error", (e) => { server.close(); reject(e); });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests: deriveSegments  (pure — no HTTP)
// ---------------------------------------------------------------------------

describe("deriveSegments", () => {
  it("returns single 'Full Song' segment when no gaps ≥ 2000 ms", () => {
    const lines: LyricLine[] = [
      { index: 0, text: "A", startMs: 0,    endMs: 4000, words: [] },
      { index: 1, text: "B", startMs: 4500, endMs: 9000, words: [] },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].label, "Full Song");
    assert.equal(segs[0].lineCount, 2);
    assert.equal(segs[0].startMs, 0);
    assert.equal(segs[0].startLineIndex, 0);
  });

  it("splits into Opening/Closing with exactly 1 gap break", () => {
    const lines: LyricLine[] = [
      { index: 0, text: "A", startMs: 0,    endMs: 3000, words: [] },
      // 2600 ms gap — 1 break
      { index: 1, text: "B", startMs: 5600, endMs: 9000, words: [] },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 2,  "1 break yields 2 segments");
    assert.equal(segs[0].label, "Opening");
    assert.equal(segs[1].label, "Closing");
  });

  it("splits into Opening / middle / Closing with 2 or more gap breaks", () => {
    const lines: LyricLine[] = [
      { index: 0, text: "A", startMs: 0,     endMs: 3000, words: [] },
      // break 1
      { index: 1, text: "B", startMs: 5600,  endMs: 8000, words: [] },
      // break 2
      { index: 2, text: "C", startMs: 10600, endMs: 14000, words: [] },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 3);
    assert.equal(segs[0].label, "Opening");
    assert.equal(segs[1].label, "Section 2");
    assert.equal(segs[2].label, "Closing");
    // verify startLineIndex / endLineIndex are set
    assert.equal(segs[0].startLineIndex, 0);
    assert.equal(segs[2].endLineIndex, 2);
  });

  it("returns empty array for empty lines", () => {
    const segs = deriveSegments([]);
    assert.equal(segs.length, 0);
  });

  it("returns plain 'Selected Section' for null-timed lines", () => {
    const lines: LyricLine[] = [
      { index: 0, text: "A", startMs: null, endMs: null, words: [] },
      { index: 1, text: "B", startMs: null, endMs: null, words: [] },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].label, "Selected Section");
    assert.equal(segs[0].startMs, null);
    assert.equal(segs[0].startLineIndex, 0);
    assert.equal(segs[0].endLineIndex, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: lyrics — demo fallback (fetch mocked to 401)
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/lyrics/:trackId — demo fallback (401)", () => {
  use401Mock();

  it("returns correct shape with source: demo for a known demo track", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/demo_001") as {
      status: number;
      body: { source: string; trackId: string; durationMs: number | null;
              hasSync: boolean; lines: { text: string; startMs: unknown; endMs: unknown }[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "demo");
    assert.equal(body.trackId, "demo_001");
    assert.ok(Array.isArray(body.lines));
    assert.ok(body.lines.length > 0);
    for (const line of body.lines) {
      assert.ok("text" in line && "startMs" in line && "endMs" in line);
    }
  });

  it("returns demo fallback for known non-demo catalogue tracks", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/99999") as {
      status: number; body: { source: string; lines: unknown[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "demo");
    assert.ok(Array.isArray(body.lines));
  });

  it("returns 404 for an unknown trackId in demo mode", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/xyz_unknown") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests: lyrics — Musixmatch available (200)
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/lyrics/:trackId — Musixmatch 200", () => {
  // Mock: track.get returns has_subtitles=1, track_length=176
  //       track.subtitle.get returns a valid subtitle body
  useMock(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("track.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { track: { has_subtitles: 1, track_length: 176, lyrics_language: "en" } },
          },
        }),
      } as unknown as Response;
    }
    if (url.includes("track.subtitle.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: {
              subtitle: {
                subtitle_body: JSON.stringify([
                  { text: "Hello world", time: { total: 5.0 } },
                  { text: "Second line", time: { total: 10.0 } },
                ]),
              },
            },
          },
        }),
      } as unknown as Response;
    }
    return { json: async () => ({ message: { header: { status_code: 401 }, body: {} } }) } as unknown as Response;
  });

  it("returns source: musixmatch, hasSync: true, durationMs from track_length", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/99999") as {
      status: number;
      body: { source: string; hasSync: boolean; durationMs: number; lines: unknown[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "musixmatch");
    assert.equal(body.hasSync, true);
    assert.equal(body.durationMs, 176000, "durationMs must be track_length × 1000");
    assert.ok(body.lines.length > 0);
  });
});

describe("GET /api/musixmatch/lyrics/:trackId — has_subtitles=0", () => {
  // Mock: track.get returns has_subtitles=0 → endpoint must use lyrics.get, hasSync=false
  useMock(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("track.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { track: { has_subtitles: 0, track_length: 200, lyrics_language: "en" } },
          },
        }),
      } as unknown as Response;
    }
    if (url.includes("track.lyrics.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { lyrics: { lyrics_body: "Plain line one\nPlain line two" } },
          },
        }),
      } as unknown as Response;
    }
    return { json: async () => ({ message: { header: { status_code: 401 }, body: {} } }) } as unknown as Response;
  });

  it("returns hasSync: false and null timings when has_subtitles=0", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/99999") as {
      status: number;
      body: { source: string; hasSync: boolean; lines: { text: string; startMs: null; endMs: null }[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "musixmatch");
    assert.equal(body.hasSync, false, "hasSync must be false when has_subtitles=0");
    assert.ok(body.lines.length > 0);
    for (const line of body.lines) {
      assert.equal(line.startMs, null, "timings must be null when unsynced");
      assert.equal(line.endMs,   null, "timings must be null when unsynced");
    }
  });
});

describe("GET /api/musixmatch/lyrics/:trackId — Musixmatch 200 empty subtitle body", () => {
  // Mock: track.get has_subtitles=1, subtitle body is empty → must NOT fall back to demo
  useMock(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("track.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { track: { has_subtitles: 1, track_length: 150, lyrics_language: "en" } },
          },
        }),
      } as unknown as Response;
    }
    if (url.includes("track.subtitle.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { subtitle: { subtitle_body: "" } }, // empty body
          },
        }),
      } as unknown as Response;
    }
    return { json: async () => ({ message: { header: { status_code: 401 }, body: {} } }) } as unknown as Response;
  });

  it("returns source: musixmatch with lines: [] — does NOT fall to demo", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/99999") as {
      status: number;
      body: { source: string; hasSync: boolean; lines: unknown[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "musixmatch", "200 empty body must NOT fall through to demo");
    assert.deepEqual(body.lines, [],          "empty subtitle body → lines: []");
  });
});

// ---------------------------------------------------------------------------
// Tests: segments — demo fallback (401)
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/segments/:trackId — demo fallback (401)", () => {
  use401Mock();

  it("returns correct shape for a known demo track", async () => {
    const { status, body } = await httpGet("/api/musixmatch/segments/demo_001") as {
      status: number;
      body: {
        source: string; trackId: string;
        segments: { id: string; label: string; startMs: number; endMs: number; lineCount: number }[];
      };
    };
    assert.equal(status, 200);
    assert.ok(body.source);
    assert.equal(body.trackId, "demo_001");
    assert.ok(Array.isArray(body.segments));
    assert.ok(body.segments.length > 0);
    for (const seg of body.segments) {
      assert.ok(seg.id && seg.label);
      assert.equal(typeof seg.startMs,   "number");
      assert.equal(typeof seg.endMs,     "number");
      assert.equal(typeof seg.lineCount, "number");
    }
  });

  it("labels are Section N or 'Selected Section' — never Verse/Chorus/Bridge", async () => {
    const { body } = await httpGet("/api/musixmatch/segments/demo_001") as {
      body: { segments: { label: string }[] };
    };
    const forbidden = ["verse", "chorus", "bridge", "pre-chorus", "outro", "intro"];
    for (const seg of body.segments) {
      for (const word of forbidden) {
        assert.ok(!seg.label.toLowerCase().includes(word), `"${seg.label}" must not use "${word}"`);
      }
    }
  });

  it("returns 404 for an unknown trackId", async () => {
    const { status, body } = await httpGet("/api/musixmatch/segments/xyz_unknown") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests: translate — demo fallback (401)
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/translate/:trackId/:lang — demo fallback (401)", () => {
  use401Mock();

  it("returns lines array for a known demo translation (demo_001 → es)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/demo_001/es") as {
      status: number;
      body: { source: string; targetLanguage: string; lines: unknown[] | null; availableLanguages: string[] };
    };
    assert.equal(status, 200);
    assert.ok(body.source);
    assert.equal(body.targetLanguage, "es");
    assert.ok(Array.isArray(body.lines),              "lines must be array for known translation");
    assert.ok(Array.isArray(body.availableLanguages), "availableLanguages must be array");
  });

  it("availableLanguages is [] in demo/401 mode (per spec)", async () => {
    const { body } = await httpGet("/api/musixmatch/translate/demo_001/es") as {
      body: { availableLanguages: string[] };
    };
    assert.deepEqual(body.availableLanguages, [], "spec: availableLanguages must be [] when Musixmatch returns 401");
  });

  it("returns lines: null for unavailable translation (demo_003 → zh)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/demo_003/zh") as {
      status: number; body: { source: string; lines: null; availableLanguages: string[] };
    };
    assert.equal(status, 200);
    assert.ok(body.source);
    assert.equal(body.lines, null);
    assert.deepEqual(body.availableLanguages, []);
  });

  it("returns lines: null for known non-demo catalogue track (401)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/99999/fr") as {
      status: number; body: { lines: null; availableLanguages: string[] };
    };
    assert.equal(status, 200);
    assert.equal(body.lines, null);
    assert.deepEqual(body.availableLanguages, []);
  });

  it("returns 404 for unknown trackId", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/xyz_unknown/es") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests: translate — Musixmatch 200 (dynamic availableLanguages)
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/translate/:trackId/:lang — Musixmatch 200", () => {
  useMock(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("track.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { track: { lyrics_language: "en", has_subtitles: 0, track_length: 200 } },
          },
        }),
      } as unknown as Response;
    }
    if (url.includes("track.lyrics.translation.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { lyrics: { lyrics_body: "Translated line one\nTranslated line two" } },
          },
        }),
      } as unknown as Response;
    }
    if (url.includes("track.lyrics.get")) {
      return {
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { lyrics: { lyrics_body: "Original line one\nOriginal line two" } },
          },
        }),
      } as unknown as Response;
    }
    return { json: async () => ({ message: { header: { status_code: 401 }, body: {} } }) } as unknown as Response;
  });

  it("builds availableLanguages dynamically from track.get + translation success", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/99999/es") as {
      status: number;
      body: { source: string; lines: unknown[] | null; availableLanguages: string[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "musixmatch");
    assert.ok(Array.isArray(body.lines));
    assert.ok(body.availableLanguages.includes("en"), "srcLang from track.get must be in availableLanguages");
    assert.ok(body.availableLanguages.includes("es"), "target lang must be in availableLanguages when translation succeeds");
  });
});

// ---------------------------------------------------------------------------
// Tests: mood — demo fallback (401)
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/mood/:trackId — derived mood", () => {
  use401Mock();

  it("returns source: derived with required fields for a known demo track", async () => {
    const { status, body } = await httpGet("/api/musixmatch/mood/demo_001") as {
      status: number;
      body: { source: string; trackId: string; moodTags: string[]; primaryMood: string; accentColor: string };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "derived");
    assert.equal(body.trackId, "demo_001");
    assert.ok(Array.isArray(body.moodTags) && body.moodTags.length > 0);
    assert.equal(typeof body.primaryMood, "string");
    assert.ok(body.accentColor.startsWith("#"));
  });

  it("returns source: derived for known non-demo catalogue tracks", async () => {
    const { status, body } = await httpGet("/api/musixmatch/mood/99999") as {
      status: number; body: { source: string; accentColor: string };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "derived");
    assert.ok(body.accentColor.startsWith("#"));
  });

  it("returns 404 for an unknown trackId", async () => {
    const { status, body } = await httpGet("/api/musixmatch/mood/xyz_unknown") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

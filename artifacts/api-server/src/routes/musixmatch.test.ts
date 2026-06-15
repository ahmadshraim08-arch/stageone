/**
 * Smoke tests for LyricStage Musixmatch endpoints.
 * Runtime: node:test (built-in, Node 24). No extra test-framework deps needed.
 * Runner: pnpm --filter @workspace/api-server run test
 *
 * All tests mock globalThis.fetch to return HTTP 401 so the demo-fallback
 * path is exercised in isolation from the real Musixmatch API.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import pinoHttp from "pino-http";

// ---------------------------------------------------------------------------
// Pure-function helpers — no HTTP needed
// ---------------------------------------------------------------------------
import { deriveSegments, type LyricLine } from "./musixmatch";

// ---------------------------------------------------------------------------
// Full router — for HTTP-level tests
// ---------------------------------------------------------------------------
import musixmatchRouter from "./musixmatch";

// ---------------------------------------------------------------------------
// Mock fetch → always returns 401, forcing demo-fallback for every test
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]): Promise<Response> =>
    ({
      json: async () => ({ message: { header: { status_code: 401 }, body: {} } }),
    }) as unknown as Response;
});
after(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Minimal Express test-app factory (each test gets its own server)
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
        res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        res.on("end", () => {
          server.close();
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); } catch (e) { reject(e); }
        });
      }).on("error", (e) => { server.close(); reject(e); });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests: deriveSegments  (pure — no HTTP)
// ---------------------------------------------------------------------------

describe("deriveSegments", () => {
  it("returns 'Selected Section' when no gaps ≥ 2000 ms", () => {
    const lines: LyricLine[] = [
      { text: "Line A", startMs: 0,    endMs: 4000 },
      { text: "Line B", startMs: 4500, endMs: 9000 },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].label, "Selected Section");
    assert.equal(segs[0].lineCount, 2);
  });

  it("returns 'Selected Section' when there is exactly 1 gap break (< 2 breaks)", () => {
    const lines: LyricLine[] = [
      { text: "A", startMs: 0,    endMs: 3000 },
      // 2600 ms gap (1 break)
      { text: "B", startMs: 5600, endMs: 9000 },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 1,              "exactly 1 break must still be Selected Section");
    assert.equal(segs[0].label, "Selected Section");
    assert.equal(segs[0].lineCount, 2);
  });

  it("splits into Section N only when there are 2 or more gap breaks", () => {
    const lines: LyricLine[] = [
      { text: "A", startMs: 0,     endMs: 3000 },
      // 2600 ms gap (break 1)
      { text: "B", startMs: 5600,  endMs: 8000 },
      // 2600 ms gap (break 2)
      { text: "C", startMs: 10600, endMs: 14000 },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 3);
    assert.equal(segs[0].label, "Section 1");
    assert.equal(segs[1].label, "Section 2");
    assert.equal(segs[2].label, "Section 3");
  });

  it("handles empty lines array", () => {
    const segs = deriveSegments([]);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].label, "Selected Section");
  });

  it("ignores lines with null timing", () => {
    const lines: LyricLine[] = [
      { text: "A", startMs: null, endMs: null },
      { text: "B", startMs: null, endMs: null },
    ];
    const segs = deriveSegments(lines);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].label, "Selected Section");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/musixmatch/lyrics/:trackId
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/lyrics/:trackId — demo fallback (401)", () => {
  it("returns correct shape with source: demo for a known demo track", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/demo_001") as {
      status: number;
      body: { source: string; trackId: string; durationMs: number | null;
              hasSync: boolean; lines: { text: string; startMs: unknown; endMs: unknown }[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "demo");
    assert.equal(body.trackId, "demo_001");
    assert.ok(Array.isArray(body.lines), "lines must be an array");
    assert.ok(body.lines.length > 0,    "lines must not be empty in demo mode");
    for (const line of body.lines) {
      assert.ok("text" in line,    "each line needs text");
      assert.ok("startMs" in line, "each line needs startMs");
      assert.ok("endMs" in line,   "each line needs endMs");
    }
  });

  it("returns demo fallback for known non-demo catalogue tracks (401)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/99999") as {
      status: number; body: { source: string; lines: unknown[] };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "demo");
    assert.ok(Array.isArray(body.lines));
  });

  it("returns 404 for an unknown trackId in demo mode", async () => {
    const { status, body } = await httpGet("/api/musixmatch/lyrics/xyz_unknown_track") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/musixmatch/segments/:trackId
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/segments/:trackId — demo fallback (401)", () => {
  it("returns correct shape with source and segments array", async () => {
    const { status, body } = await httpGet("/api/musixmatch/segments/demo_001") as {
      status: number;
      body: {
        source: string; trackId: string;
        segments: { id: string; label: string; startMs: number; endMs: number; lineCount: number }[];
      };
    };
    assert.equal(status, 200);
    assert.ok(body.source, "source field must be present");
    assert.equal(body.trackId, "demo_001");
    assert.ok(Array.isArray(body.segments), "segments must be array");
    assert.ok(body.segments.length > 0,     "must have at least one segment");
    for (const seg of body.segments) {
      assert.ok(seg.id,                          "segment needs id");
      assert.ok(seg.label,                       "segment needs label");
      assert.equal(typeof seg.startMs, "number", "startMs must be number");
      assert.equal(typeof seg.endMs,   "number", "endMs must be number");
      assert.equal(typeof seg.lineCount,"number","lineCount must be number");
    }
  });

  it("labels are Section N or 'Selected Section' — never Verse/Chorus/Bridge", async () => {
    const { body } = await httpGet("/api/musixmatch/segments/demo_001") as {
      body: { segments: { label: string }[] };
    };
    const forbidden = ["verse", "chorus", "bridge", "pre-chorus", "outro", "intro"];
    for (const seg of body.segments) {
      const lower = seg.label.toLowerCase();
      for (const word of forbidden) {
        assert.ok(!lower.includes(word), `Label "${seg.label}" must not use "${word}"`);
      }
    }
  });

  it("returns 404 for an unknown trackId in demo mode", async () => {
    const { status, body } = await httpGet("/api/musixmatch/segments/xyz_unknown_track") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/musixmatch/translate/:trackId/:lang
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/translate/:trackId/:lang — demo fallback (401)", () => {
  it("returns lines array for a known demo translation (demo_001 → es)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/demo_001/es") as {
      status: number;
      body: { source: string; targetLanguage: string;
              lines: unknown[] | null; availableLanguages: string[] };
    };
    assert.equal(status, 200);
    assert.ok(body.source,                            "source must be present");
    assert.equal(body.targetLanguage, "es");
    assert.ok(Array.isArray(body.lines),              "lines must be array for known translation");
    assert.ok(Array.isArray(body.availableLanguages), "availableLanguages must be array");
  });

  it("returns lines: null (not crash) for unavailable translation language (demo_003 → zh)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/demo_003/zh") as {
      status: number;
      body: { source: string; lines: null; availableLanguages: string[] };
    };
    assert.equal(status, 200);
    assert.ok(body.source,                            "source must be present");
    assert.equal(body.lines, null,                    "lines must be null when unavailable");
    assert.ok(Array.isArray(body.availableLanguages), "availableLanguages must still be array");
  });

  it("returns lines: null for known non-demo catalogue track with no translations (401)", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/99999/fr") as {
      status: number; body: { lines: null };
    };
    assert.equal(status, 200);
    assert.equal(body.lines, null);
  });

  it("returns 404 for unknown trackId in demo mode", async () => {
    const { status, body } = await httpGet("/api/musixmatch/translate/xyz_unknown_track/es") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/musixmatch/mood/:trackId
// ---------------------------------------------------------------------------

describe("GET /api/musixmatch/mood/:trackId — derived mood", () => {
  it("returns source: derived with required fields for a known demo track", async () => {
    const { status, body } = await httpGet("/api/musixmatch/mood/demo_001") as {
      status: number;
      body: { source: string; trackId: string;
              moodTags: string[]; primaryMood: string; accentColor: string };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "derived",           "mood source must always be 'derived'");
    assert.equal(body.trackId, "demo_001");
    assert.ok(Array.isArray(body.moodTags),        "moodTags must be array");
    assert.ok(body.moodTags.length > 0,            "moodTags must not be empty");
    assert.equal(typeof body.primaryMood, "string","primaryMood must be string");
    assert.ok(body.accentColor.startsWith("#"),    "accentColor must be a hex color");
  });

  it("returns source: derived for known non-demo catalogue tracks in demo mode", async () => {
    const { status, body } = await httpGet("/api/musixmatch/mood/99999") as {
      status: number; body: { source: string; accentColor: string };
    };
    assert.equal(status, 200);
    assert.equal(body.source, "derived");
    assert.ok(body.accentColor.startsWith("#"));
  });

  it("returns 404 for an unknown trackId in demo mode", async () => {
    const { status, body } = await httpGet("/api/musixmatch/mood/xyz_unknown_track") as {
      status: number; body: { error: string };
    };
    assert.equal(status, 404);
    assert.equal(body.error, "track_not_found");
  });
});

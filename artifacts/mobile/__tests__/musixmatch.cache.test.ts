/**
 * Smoke test: musixmatch.ts in-memory cache
 *
 * Verifies that:
 *  1. fetchLyrics returns a cached result on the second call (no double fetch).
 *  2. clearCache() resets the cache so the next fetch hits the network again.
 *  3. fetchLyrics returns null (not throws) when EXPO_PUBLIC_DOMAIN is unset.
 */

import { fetchLyrics, clearCache, type LyricsResponse } from "../lib/musixmatch";

const DEMO_RESPONSE: LyricsResponse = {
  source: "demo",
  mode: "demo",
  trackId: "demo_001",
  durationMs: 32000,
  hasSync: true,
  hasRichsync: false,
  language: "en",
  copyright: null,
  available: true,
  lines: [
    { index: 0, text: "Oh the city lights are calling out your name", startMs: 1000, endMs: 4000, words: [] },
    { index: 1, text: "Neon mornings fade to gold", startMs: 4000, endMs: 8000, words: [] },
  ],
};

// Store original env value
const originalDomain = process.env.EXPO_PUBLIC_DOMAIN;

beforeEach(() => {
  clearCache();
  jest.restoreAllMocks();
});

afterEach(() => {
  clearCache();
  // Restore env
  if (originalDomain !== undefined) {
    process.env.EXPO_PUBLIC_DOMAIN = originalDomain;
  } else {
    delete process.env.EXPO_PUBLIC_DOMAIN;
  }
});

function mockFetchOnce(response: LyricsResponse): jest.SpyInstance {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => response,
  } as Response);
}

test("fetchLyrics: second call returns cached result without re-fetching", async () => {
  process.env.EXPO_PUBLIC_DOMAIN = "localhost";
  const fetchSpy = mockFetchOnce(DEMO_RESPONSE);

  const first = await fetchLyrics("demo_001");
  const second = await fetchLyrics("demo_001");

  expect(first).not.toBeNull();
  expect(first?.trackId).toBe("demo_001");
  expect(first?.source).toBe("demo");
  expect(first?.lines).toHaveLength(2);
  expect(second).toBe(first); // same reference — served from cache
  expect(fetchSpy).toHaveBeenCalledTimes(1); // fetch called exactly once
});

test("fetchLyrics: clearCache forces a fresh network call", async () => {
  process.env.EXPO_PUBLIC_DOMAIN = "localhost";
  const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ ...DEMO_RESPONSE, trackId: "demo_002" }),
  } as Response);

  await fetchLyrics("demo_002");
  clearCache();
  await fetchLyrics("demo_002");

  expect(fetchSpy).toHaveBeenCalledTimes(2); // cache was cleared → hit network twice
});

test("fetchLyrics: returns null (not throws) when EXPO_PUBLIC_DOMAIN is unset", async () => {
  delete process.env.EXPO_PUBLIC_DOMAIN;
  const result = await fetchLyrics("demo_001");
  expect(result).toBeNull();
});

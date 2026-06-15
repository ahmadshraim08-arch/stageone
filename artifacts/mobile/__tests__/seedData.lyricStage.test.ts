/**
 * Smoke test: LyricStage seed data shapes
 *
 * Validates that the newly added seed data for the LyricStage feature is
 * structurally correct. No network or React Native dependencies.
 */

import {
  SEED_CHALLENGES,
  SEED_MUSIC_MINUTES,
  type Challenge,
  type MusicMinute,
} from "../data/seedData";

// ── Challenges ──────────────────────────────────────────────────────────────

describe("SEED_CHALLENGES — LyricStage entries", () => {
  const lyricStageChallenges = SEED_CHALLENGES.filter(
    (ch) => ch.challengeType === "lyric_stage",
  );

  test("has at least 2 LyricStage challenges", () => {
    expect(lyricStageChallenges.length).toBeGreaterThanOrEqual(2);
  });

  test("ch_006 has all required LyricStage fields", () => {
    const ch = SEED_CHALLENGES.find((c) => c.id === "ch_006");
    expect(ch).toBeDefined();
    expect(ch!.challengeType).toBe("lyric_stage");
    expect(ch!.musixmatchTrackId).toBe("demo_001");
    expect(ch!.lyricSectionLabel).toBeTruthy();
    expect(typeof ch!.performerCount).toBe("number");
    expect(Array.isArray(ch!.representedLanguages)).toBe(true);
    expect(ch!.representedLanguages!.length).toBeGreaterThan(0);
  });

  test("ch_007 has all required LyricStage fields", () => {
    const ch = SEED_CHALLENGES.find((c) => c.id === "ch_007");
    expect(ch).toBeDefined();
    expect(ch!.challengeType).toBe("lyric_stage");
    expect(ch!.musixmatchTrackId).toBe("demo_002");
    expect(ch!.lyricSectionLabel).toBeTruthy();
    expect(typeof ch!.performerCount).toBe("number");
    expect(Array.isArray(ch!.representedLanguages)).toBe(true);
  });

  test("every LyricStage challenge links to a known demo track", () => {
    const demoTracks = new Set(["demo_001", "demo_002", "demo_003"]);
    lyricStageChallenges.forEach((ch) => {
      expect(demoTracks.has(ch.musixmatchTrackId!)).toBe(true);
    });
  });
});

// ── MusicMinutes ─────────────────────────────────────────────────────────────

describe("SEED_MUSIC_MINUTES — LyricStage entries", () => {
  const lyricMMs = SEED_MUSIC_MINUTES.filter((mm) => mm.lyricSection !== undefined);

  test("has at least 3 MusicMinutes with a lyricSection", () => {
    expect(lyricMMs.length).toBeGreaterThanOrEqual(3);
  });

  test.each(["mm_021", "mm_022", "mm_023"])(
    "%s has a valid lyricSection shape",
    (id) => {
      const mm = SEED_MUSIC_MINUTES.find((m) => m.id === id);
      expect(mm).toBeDefined();
      const section = mm!.lyricSection!;
      expect(section).toBeDefined();
      expect(typeof section.sectionId).toBe("string");
      expect(typeof section.sectionLabel).toBe("string");
      expect(typeof section.trackId).toBe("string");
      expect(typeof section.startMs).toBe("number");
      expect(typeof section.endMs).toBe("number");
      expect(section.endMs).toBeGreaterThan(section.startMs);
      expect(typeof section.timingOffsetMs).toBe("number");
      expect(typeof section.language).toBe("string");
    },
  );

  test("mm_021-023 each link to a known demo track via musixmatchTrackId", () => {
    const demoTracks = new Set(["demo_001", "demo_002", "demo_003"]);
    ["mm_021", "mm_022", "mm_023"].forEach((id) => {
      const mm = SEED_MUSIC_MINUTES.find((m) => m.id === id);
      expect(mm).toBeDefined();
      expect(demoTracks.has(mm!.musixmatchTrackId!)).toBe(true);
      expect(mm!.musixmatchTrackId).toBe(mm!.lyricSection!.trackId);
    });
  });

  test("moodTags are present on all LyricStage MusicMinutes", () => {
    lyricMMs.forEach((mm) => {
      expect(Array.isArray(mm.moodTags)).toBe(true);
      expect(mm.moodTags!.length).toBeGreaterThan(0);
    });
  });
});

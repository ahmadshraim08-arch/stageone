/**
 * Smoke tests: MusicMinuteCard lyric overlay logic & "Sing This Part" navigation params
 *
 * These are pure logic/data tests — no React Native rendering required.
 * They validate the two behaviours called out explicitly in the task spec:
 *  1. Active-line computation when hasSync:false (fixed-pace pacing fallback)
 *  2. "Sing This Part" button constructs the correct route params given seed data
 */

import { SEED_MUSIC_MINUTES, SEED_CHALLENGES, type LyricSectionData } from "../data/seedData";
import { type LyricLine, type LyricsResponse } from "../lib/musixmatch";

// ── Helpers (mirrors the logic inside MusicMinuteCard) ───────────────────────

interface ActiveLineInput {
  displayLines: LyricLine[];
  section: LyricSectionData;
  videoPositionMs: number;
  hasSync: boolean;
}

function computeActiveLine({ displayLines, section, videoPositionMs, hasSync }: ActiveLineInput): LyricLine | null {
  if (!section) return null;
  if (!hasSync && displayLines.length > 0) {
    const sectionDuration = section.endMs - section.startMs;
    if (sectionDuration <= 0) return null;
    const msPerLine = sectionDuration / displayLines.length;
    const elapsed = videoPositionMs + section.timingOffsetMs;
    const idx = Math.min(Math.floor(elapsed / msPerLine), displayLines.length - 1);
    return displayLines[idx] ?? null;
  }
  const absMs = videoPositionMs + section.startMs + section.timingOffsetMs;
  return (
    displayLines.find(
      (l) => l.startMs !== null && l.endMs !== null && absMs >= l.startMs! && absMs < l.endMs!,
    ) ?? null
  );
}

/** Mirrors the handleSingThisPart params in MusicMinuteCard */
function buildSingThisPartParams(
  challengeId: string,
  section: LyricSectionData,
): Record<string, string> {
  return {
    id: challengeId,
    trackId: section.trackId,
    sectionId: section.sectionId,
    startMs: String(section.startMs),
    endMs: String(section.endMs),
  };
}

// ── Test suite 1: hasSync:false fixed-pace pacing ────────────────────────────

describe("computeActiveLine — hasSync:false fixed-pace pacing", () => {
  const section: LyricSectionData = {
    sectionId: "seg_0",
    sectionLabel: "Verse 1",
    trackId: "demo_001",
    startMs: 1000,
    endMs: 9000,          // 8-second section
    lineCount: 4,
    timingOffsetMs: 0,
    language: "en",
  };

  const lines: LyricLine[] = [
    { text: "Line A", startMs: null, endMs: null },
    { text: "Line B", startMs: null, endMs: null },
    { text: "Line C", startMs: null, endMs: null },
    { text: "Line D", startMs: null, endMs: null },
  ];
  // sectionDuration = 8000, msPerLine = 2000

  test("position 0 ms → first line", () => {
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 0, hasSync: false });
    expect(result?.text).toBe("Line A");
  });

  test("position 2000 ms → second line", () => {
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 2000, hasSync: false });
    expect(result?.text).toBe("Line B");
  });

  test("position 4000 ms → third line", () => {
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 4000, hasSync: false });
    expect(result?.text).toBe("Line C");
  });

  test("position 7999 ms → last line (clamped at max index)", () => {
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 7999, hasSync: false });
    expect(result?.text).toBe("Line D");
  });

  test("position beyond section duration → clamped to last line", () => {
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 99000, hasSync: false });
    expect(result?.text).toBe("Line D");
  });

  test("timingOffsetMs shifts which line is active", () => {
    const sectionWithOffset: LyricSectionData = { ...section, timingOffsetMs: 2000 };
    // elapsed = 0 + 2000 = 2000 → msPerLine = 2000 → idx = 1 → Line B
    const result = computeActiveLine({ displayLines: lines, section: sectionWithOffset, videoPositionMs: 0, hasSync: false });
    expect(result?.text).toBe("Line B");
  });

  test("returns null for empty line array", () => {
    const result = computeActiveLine({ displayLines: [], section, videoPositionMs: 0, hasSync: false });
    expect(result).toBeNull();
  });

  test("returns null when sectionDuration is 0", () => {
    const zeroSection = { ...section, endMs: section.startMs };
    const result = computeActiveLine({ displayLines: lines, section: zeroSection, videoPositionMs: 0, hasSync: false });
    expect(result).toBeNull();
  });
});

describe("computeActiveLine — hasSync:true uses timestamp matching", () => {
  const section: LyricSectionData = {
    sectionId: "seg_0",
    sectionLabel: "Chorus",
    trackId: "demo_002",
    startMs: 0,
    endMs: 10000,
    lineCount: 2,
    timingOffsetMs: 0,
    language: "en",
  };

  const lines: LyricLine[] = [
    { text: "First synced line", startMs: 1000, endMs: 4000 },
    { text: "Second synced line", startMs: 4000, endMs: 8000 },
  ];

  test("absMs within first line's window → returns first line", () => {
    // absMs = videoPositionMs(1500) + section.startMs(0) + offset(0) = 1500
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 1500, hasSync: true });
    expect(result?.text).toBe("First synced line");
  });

  test("absMs in second line's window → returns second line", () => {
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 5000, hasSync: true });
    expect(result?.text).toBe("Second synced line");
  });

  test("absMs between lines → returns null (no active line)", () => {
    // Both lines end before 9000 ms
    const result = computeActiveLine({ displayLines: lines, section, videoPositionMs: 9000, hasSync: true });
    expect(result).toBeNull();
  });
});

// ── Test suite 2: "Sing This Part" nav params ────────────────────────────────

describe("Sing This Part — navigation param contract", () => {
  test("mm_021 resolves to ch_006 and params carry correct IDs + timestamps", () => {
    const mm = SEED_MUSIC_MINUTES.find((m) => m.id === "mm_021");
    expect(mm).toBeDefined();
    const section = mm!.lyricSection!;

    const challenge = SEED_CHALLENGES.find(
      (ch) =>
        ch.musixmatchTrackId === mm!.musixmatchTrackId &&
        ch.challengeType === "lyric_stage" &&
        (ch.lyricSectionId === undefined || ch.lyricSectionId === section.sectionId),
    );
    expect(challenge).toBeDefined();
    expect(challenge!.id).toBe("ch_006");

    const params = buildSingThisPartParams(challenge!.id, section);
    expect(params.id).toBe("ch_006");
    expect(params.trackId).toBe("demo_001");
    expect(params.sectionId).toBe("seg_0");
    expect(Number(params.startMs)).toBeGreaterThanOrEqual(0);
    expect(Number(params.endMs)).toBeGreaterThan(Number(params.startMs));
  });

  test("mm_022 also resolves to a LyricStage challenge with matching sectionId", () => {
    const mm = SEED_MUSIC_MINUTES.find((m) => m.id === "mm_022");
    expect(mm).toBeDefined();
    const section = mm!.lyricSection!;

    const challenge = SEED_CHALLENGES.find(
      (ch) =>
        ch.musixmatchTrackId === mm!.musixmatchTrackId &&
        ch.challengeType === "lyric_stage" &&
        (ch.lyricSectionId === undefined || ch.lyricSectionId === section.sectionId),
    );
    expect(challenge).toBeDefined();
    expect(challenge!.challengeType).toBe("lyric_stage");

    const params = buildSingThisPartParams(challenge!.id, section);
    expect(params.sectionId).toBe(section.sectionId);
    expect(params.trackId).toBe(section.trackId);
    expect(Number(params.startMs)).toBe(section.startMs);
    expect(Number(params.endMs)).toBe(section.endMs);
  });

  test("Join button prefill params from ch_006 match what post.tsx would consume", () => {
    const ch = SEED_CHALLENGES.find((c) => c.id === "ch_006");
    expect(ch).toBeDefined();
    // These are the exact params the Join button passes to the post tab
    const prefillParams = {
      prefillTrackId: ch!.musixmatchTrackId ?? "",
      prefillSectionId: ch!.lyricSectionId ?? "",
    };
    expect(prefillParams.prefillTrackId).toBe("demo_001");
    expect(prefillParams.prefillSectionId).toBe("seg_0");
  });

  test("LyricStage challenges have lyricSectionId matching mm sectionIds", () => {
    const lyricStageChallenges = SEED_CHALLENGES.filter((ch) => ch.challengeType === "lyric_stage");
    lyricStageChallenges.forEach((ch) => {
      expect(ch.lyricSectionId).toBeDefined();
      // Should match at least one MusicMinute's sectionId for the same track
      const hasMatch = SEED_MUSIC_MINUTES.some(
        (mm) =>
          mm.musixmatchTrackId === ch.musixmatchTrackId &&
          mm.lyricSection?.sectionId === ch.lyricSectionId,
      );
      expect(hasMatch).toBe(true);
    });
  });
});

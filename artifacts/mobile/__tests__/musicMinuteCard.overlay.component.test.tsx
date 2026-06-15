/**
 * Component-level smoke tests for MusicMinuteCard lyric overlay.
 *
 * Uses react-test-renderer with aggressive module mocking so the component
 * can be mounted in a plain Node/ts-jest environment without native modules.
 *
 * Validates two reviewer-required criteria:
 *   1. Card with lyricSection mounts without crash (fetchLyrics mocked)
 *   2. "Sing This Part" tap calls router.push with string IDs + timestamps
 */

// Tell React test utilities this is an act() environment (suppresses the
// "not configured to support act()" console.error from react-test-renderer v19)
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Module mocks (must be before all imports due to Jest hoisting) ────────────

jest.mock("react-native", () => {
  const noop = () => {};
  const mockAnimValue = class {
    _v = 0;
    constructor(v: number) { this._v = v; }
    setValue(v: number) { this._v = v; }
    setOffset = noop;
    flattenOffset = noop;
    addListener() { return { remove: noop }; }
    removeListener = noop;
    stopAnimation = noop;
  };
  return {
    View: "View",
    Text: "Text",
    TouchableOpacity: "TouchableOpacity",
    ScrollView: "ScrollView",
    Pressable: "Pressable",
    ActivityIndicator: "ActivityIndicator",
    Image: "Image",
    StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
    Animated: {
      Value: mockAnimValue,
      timing: () => ({ start: (cb?: () => void) => { cb?.(); } }),
      sequence: () => ({ start: (cb?: () => void) => { cb?.(); } }),
      spring: () => ({ start: (cb?: () => void) => { cb?.(); } }),
      event: () => () => {},
      View: "View",
    },
    Platform: { OS: "ios", select: (o: any) => (o.ios ?? o.default) },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    PanResponder: { create: () => ({ panHandlers: {} }) },
  };
});

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: mockRouterPush, navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
}));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-av", () => ({ Video: "Video", ResizeMode: { COVER: "cover" } }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

jest.mock("@/lib/musixmatch", () => ({
  fetchLyrics: jest.fn().mockResolvedValue({
    hasSync: true,
    lines: [
      { text: "Neon morning starts to glow", startMs: 0, endMs: 4000 },
      { text: "Colors rise above the snow", startMs: 4000, endMs: 8000 },
    ],
  }),
  fetchTranslation: jest.fn().mockResolvedValue(null),
  probeAvailableTranslations: jest.fn().mockResolvedValue([]),
  fetchSegments: jest.fn().mockResolvedValue({ segments: [] }),
  clearCache: jest.fn(),
}));

jest.mock("@/context/AppContext", () => ({
  useApp: () => ({
    currentUser: null,
    musicMinutes: [],
    likedIds: new Set<string>(),
    savedIds: new Set<string>(),
    goldenMicsSent: {} as Record<string, number>,
    toggleLike: jest.fn(),
    toggleSave: jest.fn(),
    handleGoldenMic: jest.fn(),
  }),
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#A855F7",
    background: "#05020A",
    card: "#111",
    foreground: "#FAFAFA",
    muted: "#1E1E2D",
    mutedForeground: "#A0A0B0",
    border: "#2A2A3D",
  }),
}));

// ── Actual imports (after mocks) ───────────────────────────────────────────────
import React from "react";
import { create, act } from "react-test-renderer";
import { MusicMinuteCard } from "../components/MusicMinuteCard";
import { SEED_MUSIC_MINUTES } from "../data/seedData";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Depth-first search for the first node whose props.testID matches. */
function findByTestId(node: any, testID: string): any {
  if (!node || typeof node !== "object") return null;
  if (node.props?.testID === testID) return node;
  const children = node.children ?? [];
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByTestId(child, testID);
    if (found) return found;
  }
  return null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
const mm021 = SEED_MUSIC_MINUTES.find((m) => m.id === "mm_021")!;

describe("MusicMinuteCard — overlay smoke tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  test("mounts without crash when item has lyricSection (fetchLyrics mocked)", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <MusicMinuteCard
          item={mm021}
          onCommentPress={jest.fn()}
          onGoldenMicPress={jest.fn()}
        />,
      );
    });
    expect(renderer!).toBeTruthy();
    expect(renderer!.toJSON()).toBeTruthy();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  test("Sing This Part routes to challenge detail with string IDs + timestamps (not arrays)", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <MusicMinuteCard
          item={mm021}
          onCommentPress={jest.fn()}
          onGoldenMicPress={jest.fn()}
        />,
      );
    });

    // Step 1 — open the lyric overlay
    const tree1 = renderer!.toJSON() as any;
    const toggleBtn = findByTestId(tree1, "lyric-overlay-toggle");
    expect(toggleBtn).not.toBeNull();

    act(() => {
      toggleBtn.props.onPress();
    });

    // Step 2 — find and tap "Sing This Part"
    const tree2 = renderer!.toJSON() as any;
    const singBtn = findByTestId(tree2, "sing-this-part-btn");
    expect(singBtn).not.toBeNull();

    act(() => {
      singBtn.props.onPress();
    });

    // Step 3 — assert router.push was called with correct route + params
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const [pushArg] = mockRouterPush.mock.calls[0];
    expect(pushArg.pathname).toBe("/lyric-challenge/[id]");

    const { id, trackId, sectionId, startMs, endMs } = pushArg.params as Record<string, string>;
    expect(id).toBe("ch_006");
    expect(trackId).toBe("demo_001");
    expect(sectionId).toBe("seg_0");

    // params must be primitive strings, not objects or arrays
    expect(typeof startMs).toBe("string");
    expect(typeof endMs).toBe("string");
    expect(Number(endMs)).toBeGreaterThan(Number(startMs));
  });
});

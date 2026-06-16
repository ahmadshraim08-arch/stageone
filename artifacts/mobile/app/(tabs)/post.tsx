import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  cacheDirectory as fsCacheDirectory,
  copyAsync as fsCopyAsync,
  getInfoAsync as fsGetInfoAsync,
  deleteAsync as fsDeleteAsync,
} from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@clerk/expo";

import { useApp } from "@/context/AppContext";
import { MusicMinute } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import {
  fetchLyrics,
  searchTracks,
  type LyricLine,
  type TimingMode,
} from "@/lib/musixmatch";
import {
  apiBase,
  startAnalysisJob,
  cancelAnalysisJob,
  type ApiAnalysisResult,
  type AnalysisCandidate,
} from "@/lib/api";
import { uploadVideo, createPost } from "@/lib/uploads";
import { AnalysisWaveform } from "@/components/AnalysisWaveform";
import { TimingSlider } from "@/components/TimingSlider";

// ─── Types ────────────────────────────────────────────────────────────────────

type PerformanceType = "original" | "cover" | "freestyle";
type AnalysisPhase = "idle" | "upload" | "polling" | "confirming" | "done" | "skipped" | "failed";

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRES = [
  "Pop", "R&B", "Soul", "Rap", "Acoustic", "Indie",
  "Latin Pop", "Arabic Pop", "Singer-Songwriter", "Jazz", "Country", "Gospel",
];
const LANGUAGES = [
  "English", "Arabic", "Spanish", "French", "Portuguese", "Hindi", "Swahili", "Other",
];

/** Map a raw Musixmatch genre string to the nearest StageOne GENRES chip. */
function mapMusixmatchGenre(raw: string): string | null {
  const lower = raw.toLowerCase().replace(/[^a-z0-9 &/'-]/g, "").trim();
  const tests: Array<[RegExp, string]> = [
    [/r\s*&\s*b|rnb|rhythm.and.blues/, "R&B"],
    [/soul/, "Soul"],
    [/hip.?hop|rap/, "Rap"],
    [/country/, "Country"],
    [/jazz/, "Jazz"],
    [/gospel|christian/, "Gospel"],
    [/latin/, "Latin Pop"],
    [/arabic|arab/, "Arabic Pop"],
    [/singer.?songwriter/, "Singer-Songwriter"],
    [/indie|alternative/, "Indie"],
    [/acoustic|folk/, "Acoustic"],
    [/pop/, "Pop"],
  ];
  for (const [pattern, genre] of tests) {
    if (pattern.test(lower)) return genre;
  }
  return null;
}

/** Map an ElevenLabs language code or name to the nearest LANGUAGES chip.
 *  Returns null for unrecognised codes so we never override the default. */
function mapDetectedLanguage(lang: string): string | null {
  const lower = lang.toLowerCase().trim();
  const map: Record<string, string> = {
    en: "English", english: "English",
    ar: "Arabic", arabic: "Arabic",
    es: "Spanish", spanish: "Spanish",
    fr: "French", french: "French",
    pt: "Portuguese", portuguese: "Portuguese",
    hi: "Hindi", hindi: "Hindi",
    sw: "Swahili", swahili: "Swahili",
  };
  return map[lower] ?? null;
}

const STAGE_LABELS: Record<string, string> = {
  preparing: "Preparing audio",
  isolating_vocals: "Isolating vocals",
  transcribing: "Listening to your performance",
  searching_musixmatch: "Searching for the song",
  matching_lyrics: "Matching lyrics",
  analyzing_audio: "Analyzing audio",
  aligning_timing: "Aligning timing",
  ready: "Analysis complete",
  failed: "Analysis could not complete",
};

interface MusixmatchResult {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name?: string;
}

const MOCK_TRACKS: MusixmatchResult[] = [
  { track_id: "demo_001", track_name: "Neon Mornings", artist_name: "Demo Artist" },
  { track_id: "demo_002", track_name: "Echo in the Rain", artist_name: "Demo Artist" },
  { track_id: "demo_003", track_name: "Thousand Lights", artist_name: "Demo Artist" },
  { track_id: "12345", track_name: "Golden Hour", artist_name: "JVKE", album_name: "this is what falling in love feels like" },
  { track_id: "67890", track_name: "Fix You", artist_name: "Coldplay", album_name: "X&Y" },
  { track_id: "33333", track_name: "Someone Like You", artist_name: "Adele", album_name: "21" },
  { track_id: "44444", track_name: "Shallow", artist_name: "Lady Gaga & Bradley Cooper", album_name: "A Star Is Born" },
  { track_id: "55555", track_name: "Perfect", artist_name: "Ed Sheeran", album_name: "Divide" },
];

// ─── Step layout ──────────────────────────────────────────────────────────────
//
// Internal steps:
//   1  Video
//   2  Performance type
//   3  AI analysis (cover only) — upload + polling + confirmation
//   4  Manual song search (non-cover OR after rejection/skip from step 3)
//   5  Lyric range editor (cover only)
//   6  Timing fine-tune (cover + section)
//   7  Add details
//   8  Review & post
//
// Visual dots (5 positions): 1→1, 2→2, 3/4/5/6→3, 7→4, 8→5

function toVisualStep(step: number): number {
  if (step <= 2) return step;
  if (step <= 6) return 3;
  if (step === 7) return 4;
  return 5;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function confidenceLabel(c: number): { label: string; color: string } {
  if (c >= 0.7) return { label: "High Confidence", color: "#22C55E" };
  if (c >= 0.4) return { label: "Medium Confidence", color: "#F59E0B" };
  return { label: "Low Confidence", color: "#EF4444" };
}

function detectVideoMime(asset: ImagePicker.ImagePickerAsset): { mimeType: string; ext: string } {
  if (asset.mimeType) {
    const mt = asset.mimeType.toLowerCase();
    if (mt === "video/quicktime") return { mimeType: mt, ext: ".mov" };
    if (mt === "video/x-m4v") return { mimeType: mt, ext: ".m4v" };
    if (mt === "video/mp4") return { mimeType: mt, ext: ".mp4" };
  }
  const match = (asset.uri ?? "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const rawExt = match?.[1]?.toLowerCase();
  if (rawExt === "mov") return { mimeType: "video/quicktime", ext: ".mov" };
  if (rawExt === "m4v") return { mimeType: "video/x-m4v", ext: ".m4v" };
  return { mimeType: "video/mp4", ext: ".mp4" };
}

async function stabiliseVideoUri(
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ uri: string; mimeType: string }> {
  const { mimeType, ext } = detectVideoMime(asset);
  const rand = Math.random().toString(36).slice(2, 8);
  const dest = `${fsCacheDirectory ?? ""}music-minute-${Date.now()}-${rand}${ext}`;
  await fsCopyAsync({ from: asset.uri, to: dest });
  const info = await fsGetInfoAsync(dest);
  if (!info.exists || info.size === 0) {
    throw new Error(
      "The video could not be prepared for upload. If it is stored in iCloud, try downloading it to your device first.",
    );
  }
  return { uri: dest, mimeType };
}

// ─── Animated Checklist Item ──────────────────────────────────────────────────

function AnimatedCheckItem({
  isDone,
  isActive,
  label,
  primaryColor,
  foregroundColor,
  mutedColor,
  borderColor,
}: {
  isDone: boolean;
  isActive: boolean;
  label: string;
  primaryColor: string;
  foregroundColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  const scale = useSharedValue(isDone ? 1 : 0);
  const prevDone = useRef(isDone);

  useEffect(() => {
    if (isDone && !prevDone.current) {
      scale.value = 0;
      scale.value = withSpring(1, { damping: 10, stiffness: 280 });
    }
    prevDone.current = isDone;
  }, [isDone]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isDone ? scale.value : 1 }],
  }));

  const iconColor = isDone ? "#22C55E" : isActive ? primaryColor : borderColor;
  const textColor = isDone ? "#22C55E" : isActive ? foregroundColor : mutedColor;

  return (
    <Animated.View
      entering={FadeInDown.duration(250).springify()}
      style={styles.stageCheckItem}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={isDone ? "checkmark-circle" : isActive ? "radio-button-on" : "ellipse-outline"}
          size={16}
          color={iconColor}
        />
      </Animated.View>
      <Text style={[styles.stageCheckLabel, { color: textColor }]}>{label}</Text>
    </Animated.View>
  );
}

// ─── Post Success Overlay ─────────────────────────────────────────────────────

const SUCCESS_NOTE_CONFIGS = [
  { note: "♪", x: 38,  y: 155, delay: 0   },
  { note: "♫", x: 258, y: 115, delay: 180 },
  { note: "♩", x: 78,  y: 345, delay: 350 },
  { note: "♬", x: 228, y: 365, delay: 520 },
  { note: "♪", x: 158, y: 95,  delay: 700 },
  { note: "♫", x: 298, y: 275, delay: 240 },
];

function SuccessNote({
  note, x, y, delay, color,
}: { note: string; x: number; y: number; delay: number; color: string }) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0.4);

  useEffect(() => {
    op.value = withDelay(
      delay,
      withSequence(
        withTiming(0.9, { duration: 350, easing: Easing.out(Easing.quad) }),
        withTiming(0.9, { duration: 900 }),
        withTiming(0,   { duration: 500, easing: Easing.in(Easing.quad) }),
      ),
    );
    ty.value = withDelay(delay, withTiming(-90, { duration: 1750, easing: Easing.out(Easing.quad) }));
    sc.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 200 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity:   op.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  return (
    <Animated.Text style={[{ position: "absolute", left: x, top: y, fontSize: 26, color }, style]}>
      {note}
    </Animated.Text>
  );
}

function PostSuccessOverlay({
  onDone,
  backgroundColor,
  foregroundColor,
  mutedColor,
  primaryColor,
}: {
  onDone: () => void;
  backgroundColor: string;
  foregroundColor: string;
  mutedColor: string;
  primaryColor: string;
}) {
  const checkScale   = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const glowScale    = useSharedValue(0.5);
  const glowOpacity  = useSharedValue(0);
  const textOpacity  = useSharedValue(0);

  useEffect(() => {
    checkOpacity.value = withTiming(1, { duration: 80 });
    checkScale.value   = withSpring(1, { damping: 9, stiffness: 200 });

    glowOpacity.value = withSequence(
      withDelay(100, withTiming(0.55, { duration: 250 })),
      withTiming(0.3,  { duration: 350 }),
      withTiming(0,    { duration: 600, easing: Easing.out(Easing.quad) }),
    );
    glowScale.value = withDelay(
      100,
      withTiming(2.2, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );

    textOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity:   checkOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity:   glowOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor, alignItems: "center", justifyContent: "center" }]}>
      {/* Floating musical notes */}
      <View style={{ position: "absolute", width: "100%", height: "100%" }}>
        {SUCCESS_NOTE_CONFIGS.map((cfg, i) => (
          <SuccessNote key={i} {...cfg} color={primaryColor} />
        ))}
      </View>

      {/* Checkmark + expanding glow ring */}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 3,
              borderColor: "#22C55E",
            },
            glowStyle,
          ]}
        />
        <Animated.View style={checkStyle}>
          <Ionicons name="checkmark-circle" size={100} color="#22C55E" />
        </Animated.View>
      </View>

      {/* Labels */}
      <Animated.View style={[styles.successOverlayText, textStyle]}>
        <Text style={[styles.successTitle, { color: foregroundColor }]}>
          Your Music Minute is live!
        </Text>
        <Text style={[styles.successSubtitle, { color: mutedColor }]}>
          Your performance is now live in the feed.{"\n"}Time to rise.
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { currentUser, postMusicMinute, musicMinutes } = useApp();
  const { poll: pollAnalysis, stop: stopPolling } = useAnalysisJob();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // ── Core navigation ──────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Video ────────────────────────────────────────────────────────────────
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMimeType, setVideoMimeType] = useState<string>("video/mp4");
  const [cachedVideoUri, setCachedVideoUri] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [videoDurationSec, setVideoDurationSec] = useState(0);
  const [performanceType, setPerformanceType] = useState<PerformanceType>("original");

  // ── Early upload (step 3 for cover) ──────────────────────────────────────
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedObjectKey, setUploadedObjectKey] = useState<string | null>(null);
  const [earlyUploadProgress, setEarlyUploadProgress] = useState(0);

  // ── Analysis (step 3, cover only) ────────────────────────────────────────
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
  const [analysisStage, setAnalysisStage] = useState<string>("preparing");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<ApiAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Tracks which stages have ever been reported — used for conditional checklist display
  const [seenStages, setSeenStages] = useState<Set<string>>(new Set());

  // ── Confirming burst animation ────────────────────────────────────────────
  const confirmCardScale = useSharedValue(1);
  const confirmCardOpacity = useSharedValue(1);
  const confirmGlowOpacity = useSharedValue(0);
  const confirmCardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confirmCardScale.value }],
    opacity: confirmCardOpacity.value,
  }));
  const confirmGlowAnimStyle = useAnimatedStyle(() => ({
    opacity: confirmGlowOpacity.value,
  }));

  // ── Step 6 video playback sync ────────────────────────────────────────────
  const videoRef = useRef<InstanceType<typeof Video> | null>(null);
  const [videoPositionMs, setVideoPositionMs] = useState(0);

  // ── Song tagging (step 4 manual) ──────────────────────────────────────────
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<MusixmatchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<MusixmatchResult | null>(null);
  const [isSongSearching, setIsSongSearching] = useState(false);
  const [songSearchError, setSongSearchError] = useState(false);
  const [songSearchSource, setSongSearchSource] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // ── Lyric range editor (step 5) ───────────────────────────────────────────
  const [fullLyrics, setFullLyrics] = useState<LyricLine[] | null>(null);
  const [fullLyricsLoading, setFullLyricsLoading] = useState(false);
  const [lyricRangeStartLine, setLyricRangeStartLine] = useState(0);
  const [lyricRangeEndLine, setLyricRangeEndLine] = useState(0);
  const [noLyricsMode, setNoLyricsMode] = useState(false);

  // ── Timing (step 6) ───────────────────────────────────────────────────────
  const [timingOffsetMs, setTimingOffsetMs] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);

  // ── Cyanite chips (step 7) ────────────────────────────────────────────────
  const [cyaniteGenreAccepted, setCyaniteGenreAccepted] = useState(false);
  const [cyaniteMoodsAccepted, setCyaniteMoodsAccepted] = useState(false);

  // ── Auto-detected genre / language (step 7) ───────────────────────────────
  const [detectedGenre, setDetectedGenre] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const prefillStep7AppliedRef = useRef(false);

  // ── Details (step 7) ─────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [genre, setGenre] = useState("Pop");
  const [language, setLanguage] = useState("English");
  const [location, setLocation] = useState("");

  // ── Review + posting (step 8) ────────────────────────────────────────────
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "saving" | "done">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // ── Prefill from deep-link ────────────────────────────────────────────────
  const { prefillTrackId, prefillSectionId, prefillSongQuery } = useLocalSearchParams<{
    prefillTrackId?: string;
    prefillSectionId?: string;
    prefillSongQuery?: string;
  }>();
  const prefillAppliedRef = useRef(false);
  const prefillQueryAppliedRef = useRef(false);

  // ─── Effects ─────────────────────────────────────────────────────────────

  // Stop polling when the component unmounts (e.g. user navigates away mid-analysis)
  useEffect(() => {
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Burst animation + haptic when AI detection succeeds
  useEffect(() => {
    if (analysisPhase === "confirming" && analysisResult?.detectedTrackId) {
      confirmCardScale.value = 0.82;
      confirmCardOpacity.value = 0;
      confirmGlowOpacity.value = 0;
      confirmCardScale.value = withSpring(1, { damping: 11, stiffness: 220 });
      confirmCardOpacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
      confirmGlowOpacity.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.55, { duration: 100 }),
        withTiming(0.9, { duration: 100 }),
        withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisPhase]);

  // Debounced song search
  useEffect(() => {
    const query = songQuery.trim();
    if (!query || selectedSong) return;
    const timer = setTimeout(() => { handleSongSearch(); }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songQuery]);

  // Prefill from challenge Join button
  useEffect(() => {
    if (prefillAppliedRef.current || !prefillTrackId) return;
    const localTrack = MOCK_TRACKS.find((t) => t.track_id === prefillTrackId);
    if (localTrack) {
      prefillAppliedRef.current = true;
      setPerformanceType("cover");
      setSelectedSong(localTrack);
      return;
    }
    fetch(`${apiBase()}/musixmatch/track/${encodeURIComponent(prefillTrackId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { track?: Record<string, unknown> } | null) => {
        if (!data?.track) return;
        const t = data.track;
        prefillAppliedRef.current = true;
        setPerformanceType("cover");
        setSelectedSong({
          track_id: prefillTrackId,
          track_name: String(t.track_name ?? prefillTrackId),
          artist_name: String(t.artist_name ?? ""),
          album_name: t.album_name ? String(t.album_name) : undefined,
        });
      })
      .catch(() => {});
  }, [prefillTrackId]);

  // Prefill query from song chip
  useEffect(() => {
    if (prefillQueryAppliedRef.current || !prefillSongQuery || prefillTrackId) return;
    prefillQueryAppliedRef.current = true;
    setSongQuery(prefillSongQuery);
  }, [prefillSongQuery, prefillTrackId]);

  // Auto-prefill genre + language from analysis result on first step 7 entry
  useEffect(() => {
    if (step !== 7 || prefillStep7AppliedRef.current) return;
    prefillStep7AppliedRef.current = true;

    // Genre: requires (a) a confirmed/matching selected song, AND (b) song-match
    // confidence above the medium threshold used throughout the confirming UI (≥ 0.4).
    // This prevents prefilling when the user overrode the song in Step 4 or when
    // confidence is too low to trust the genre metadata.
    const songConfidence = analysisResult?.songMatchConfidence ?? 0;
    const songIsConfirmedMatch =
      selectedSong !== null &&
      selectedSong.track_id === analysisResult?.detectedTrackId &&
      songConfidence >= 0.4;

    if (analysisResult?.musixmatchGenre && songIsConfirmedMatch) {
      const mapped = mapMusixmatchGenre(analysisResult.musixmatchGenre);
      if (mapped && GENRES.includes(mapped)) {
        setGenre(mapped);
        setDetectedGenre(mapped);
      }
    }

    // Language: only prefill when we have a confident, known mapping.
    // mapDetectedLanguage returns null for unrecognised codes, so no fallback to "Other".
    if (analysisResult?.detectedLanguage) {
      const mapped = mapDetectedLanguage(analysisResult.detectedLanguage);
      if (mapped && LANGUAGES.includes(mapped)) {
        setLanguage(mapped);
        setDetectedLanguage(mapped);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Load full lyrics when entering step 5
  useEffect(() => {
    if (step !== 5 || !selectedSong) return;
    if (fullLyrics) return;
    let cancelled = false;
    setFullLyricsLoading(true);
    fetchLyrics(selectedSong.track_id).then((data) => {
      if (cancelled) return;
      setFullLyricsLoading(false);
      if (data && data.lines.length > 0) {
        setFullLyrics(data.lines);
        // Pre-select AI-detected range or sensible default
        if (
          analysisResult?.startLineIndex !== undefined &&
          analysisResult?.endLineIndex !== undefined
        ) {
          setLyricRangeStartLine(analysisResult.startLineIndex);
          setLyricRangeEndLine(analysisResult.endLineIndex);
        } else {
          // Default: first third of lyrics
          const end = Math.min(Math.floor(data.lines.length / 3), data.lines.length - 1);
          setLyricRangeStartLine(0);
          setLyricRangeEndLine(end);
        }
      } else {
        setNoLyricsMode(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedSong?.track_id]);

  // ─── Navigation ──────────────────────────────────────────────────────────

  const hasLyricRange = !noLyricsMode && fullLyrics !== null && fullLyrics.length > 0;
  const skipTimingStep = !hasLyricRange;

  function goBack(): void {
    if (step === 8) { setStep(7); return; }
    if (step === 7) {
      if (performanceType === "cover" && selectedSong && hasLyricRange && !skipTimingStep) {
        setStep(6); return;
      }
      if (performanceType === "cover" && selectedSong) { setStep(5); return; }
      setStep(4); return;
    }
    if (step === 6) { setStep(5); return; }
    if (step === 5) {
      // If AI ran → back to confirming phase
      if (analysisPhase === "done") { setAnalysisPhase("confirming"); setStep(3); return; }
      setStep(4); return;
    }
    if (step === 4) {
      if (performanceType === "cover") { setStep(3); return; }
      setStep(2); return;
    }
    if (step === 3) {
      stopPolling();
      // Cancel the job if it was started
      if (analysisJobId) {
        getToken().then((t) => {
          if (t && analysisJobId) cancelAnalysisJob(t, analysisJobId).catch(() => {});
        });
      }
      setAnalysisPhase("idle");
      setStep(2); return;
    }
    if (step === 2) { setStep(1); return; }
  }

  // ─── Media helpers ───────────────────────────────────────────────────────

  const handlePickVideo = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Photo Library Access Required", "StageOne needs access to your photo library to upload a Music Minute.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        videoMaxDuration: 60,
        base64: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if ((asset.duration ?? 0) > 61000) {
        Alert.alert("Too Long", "Music Minutes can be up to 60 seconds.");
        return;
      }
      const MAX_BYTES = 100 * 1024 * 1024;
      if (asset.fileSize && asset.fileSize > MAX_BYTES) {
        Alert.alert("File Too Large", "Please select a video under 100 MB.");
        return;
      }
      if (cachedVideoUri) fsDeleteAsync(cachedVideoUri, { idempotent: true }).catch(() => {});
      const { uri: stableUri, mimeType } = await stabiliseVideoUri(asset);
      setVideoUri(stableUri);
      setCachedVideoUri(stableUri);
      setVideoMimeType(mimeType);
      setVideoDurationSec(Math.round((asset.duration ?? 0) / 1000));
      // Reset upload state if video changes
      setUploadedVideoUrl(null);
      setUploadedObjectKey(null);
      setAnalysisPhase("idle");
      setAnalysisJobId(null);
      setAnalysisResult(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The selected video could not be read.";
      Alert.alert("Video Error", msg);
    } finally {
      setIsPicking(false);
    }
  };

  const handleRecordVideo = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Camera Access Required", "Please allow camera access to record a video.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 60,
        base64: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (cachedVideoUri) fsDeleteAsync(cachedVideoUri, { idempotent: true }).catch(() => {});
      const { uri: stableUri, mimeType } = await stabiliseVideoUri(asset);
      setVideoUri(stableUri);
      setCachedVideoUri(stableUri);
      setVideoMimeType(mimeType);
      setVideoDurationSec(Math.round((asset.duration ?? 0) / 1000));
      setUploadedVideoUrl(null);
      setUploadedObjectKey(null);
      setAnalysisPhase("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The recorded video could not be prepared.";
      Alert.alert("Video Error", msg);
    } finally {
      setIsPicking(false);
    }
  };

  // ─── Analysis flow ────────────────────────────────────────────────────────

  const handleStartAnalysis = async () => {
    if (!videoUri) return;
    setAnalysisError(null);
    setAnalysisPhase("upload");
    setEarlyUploadProgress(0);

    const token = await getToken();
    if (!token) {
      setAnalysisError("You must be signed in to analyze your performance.");
      setAnalysisPhase("idle");
      return;
    }

    // Phase A: Upload video
    let objectKey: string;
    let videoUrl: string;
    try {
      const result = await uploadVideo(videoUri, videoMimeType, token, (pct) => {
        setEarlyUploadProgress(pct);
      });
      videoUrl = result.videoUrl;
      objectKey = result.objectKey;
      setUploadedVideoUrl(videoUrl);
      setUploadedObjectKey(objectKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setAnalysisError(msg);
      setAnalysisPhase("idle");
      return;
    }

    // Phase B: Start analysis job
    setAnalysisPhase("polling");
    setAnalysisStage("preparing");
    setAnalysisProgress(0);

    let jobId: string;
    try {
      const job = await startAnalysisJob(token, {
        videoObjectKey: objectKey,
        performanceType: "cover",
      });
      jobId = job.jobId;
      setAnalysisJobId(jobId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start analysis";
      setAnalysisError(msg);
      setAnalysisPhase("idle");
      return;
    }

    // Phase C: Poll until done
    pollAnalysis(
      token,
      jobId,
      (job) => {
        setAnalysisStage(job.stage);
        setAnalysisProgress(job.progressPct);
        setSeenStages((prev) => new Set([...prev, job.stage]));
      },
      (job) => {
        setSeenStages((prev) => new Set([...prev, job.stage]));
        setAnalysisResult(job.result);
        setAnalysisStage(job.stage);
        setAnalysisProgress(100);
        if (job.status === "ready") {
          setAnalysisPhase("confirming");
        } else {
          // failed or canceled
          setAnalysisError(
            job.status === "canceled"
              ? "Analysis was canceled."
              : "We couldn't analyze the audio. You can retry or search for the song manually.",
          );
          setAnalysisPhase("failed");
        }
      },
      (_err) => {
        // Non-fatal poll error; keep retrying (backoff handles frequency)
      },
    );
  };

  const handleConfirmSong = (candidate: {
    trackId: string;
    trackTitle: string;
    artistName: string;
    albumArt?: string;
  }) => {
    setSelectedSong({
      track_id: candidate.trackId,
      track_name: candidate.trackTitle,
      artist_name: candidate.artistName,
    });
    setFullLyrics(null); // reset so step 5 fetches fresh
    setAnalysisPhase("done");
    setStep(5);
  };

  const handleSkipAnalysis = () => {
    stopPolling();
    if (analysisJobId) {
      getToken().then((t) => {
        if (t && analysisJobId) cancelAnalysisJob(t, analysisJobId).catch(() => {});
      });
    }
    setAnalysisPhase("skipped");
    setStep(4); // go to manual song search
  };

  // ─── Song search ──────────────────────────────────────────────────────────

  const handleSongSearch = async () => {
    const query = songQuery.trim();
    if (!query || isSongSearching) return;
    setIsSongSearching(true);
    setSongSearchError(false);
    setSongSearchSource(null);
    setHasSearched(false);
    try {
      const { tracks, source } = await searchTracks(query);
      setSongSearchSource(source);
      setSongResults(tracks);
      setHasSearched(true);
      setSongSearchError(false);
    } catch {
      setSongSearchError(true);
      setSongResults([]);
    }
    setIsSongSearching(false);
  };

  // ─── Post handler ─────────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please add a title for your Music Minute.");
      return;
    }
    if (!rightsConfirmed) {
      Alert.alert("Rights confirmation required", "Please confirm your rights before posting.");
      return;
    }
    if (!videoUri) {
      Alert.alert("No video", "Please select or record a video first.");
      return;
    }

    setIsPosting(true);
    setUploadError(null);
    setUploadProgress(0);

    const token = await getToken();
    if (!token) {
      setUploadError("You must be signed in to post. Please log in and try again.");
      setIsPosting(false);
      return;
    }

    let cloudVideoUrl: string;
    let cloudObjectKey: string | undefined;

    if (uploadedVideoUrl && uploadedObjectKey) {
      // Already uploaded in the analysis flow
      cloudVideoUrl = uploadedVideoUrl;
      cloudObjectKey = uploadedObjectKey;
    } else {
      // Normal upload (non-cover or skipped analysis)
      setUploadPhase("uploading");
      try {
        const result = await uploadVideo(videoUri, videoMimeType, token, (pct) => {
          setUploadProgress(pct);
        });
        cloudVideoUrl = result.videoUrl;
        cloudObjectKey = result.objectKey;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadError(message);
        setUploadPhase("idle");
        setIsPosting(false);
        return;
      }
    }

    setUploadPhase("saving");

    // Build lyric section info
    const hasManualSection = selectedSong && fullLyrics && !noLyricsMode;
    const startLine = hasManualSection ? lyricRangeStartLine : undefined;
    const endLine = hasManualSection ? lyricRangeEndLine : undefined;
    const startLineData = (fullLyrics && startLine !== undefined) ? fullLyrics[startLine] : null;
    const endLineData = (fullLyrics && endLine !== undefined) ? fullLyrics[endLine] : null;

    const imageIndex = musicMinutes.length % 3;

    try {
      await createPost(
        {
          videoUrl: cloudVideoUrl,
          videoObjectKey: cloudObjectKey,
          title,
          caption,
          performanceType,
          genre,
          language,
          musixmatchTrackId: selectedSong?.track_id,
          trackTitle: selectedSong?.track_name,
          trackArtist: selectedSong?.artist_name,
          lyricSectionStartLine: startLine,
          lyricSectionEndLine: endLine,
          lyricSectionStartMs: startLineData?.startMs ?? undefined,
          lyricSectionEndMs: endLineData?.endMs ?? undefined,
          lyricTimingMode: analysisResult?.timingMode ?? (fullLyrics ? "manual" : undefined),
          lyricTimingOffsetMs: timingOffsetMs !== 0 ? timingOffsetMs : undefined,
          lyricTimingAnchors: analysisResult?.timingAnchors ?? null,
          lyricStartWord: analysisResult?.startWordIndex,
          lyricEndWord: analysisResult?.endWordIndex,
          rightsConfirmed,
          // AI analysis fields
          analysisJobId: analysisJobId ?? undefined,
          detectedTrackId: analysisResult?.detectedTrackId,
          songMatchConfidence: analysisResult?.songMatchConfidence,
          vocalIsolationUsed: analysisResult?.vocalIsolationUsed,
          transcriptionSource: analysisResult?.transcriptionSource,
          cyaniteGenre: cyaniteGenreAccepted ? (analysisResult?.cyaniteGenre ?? undefined) : undefined,
          cyaniteMoods: cyaniteMoodsAccepted ? (analysisResult?.cyaniteMoods ?? undefined) : undefined,
          cyaniteEnergy: cyaniteMoodsAccepted ? (analysisResult?.cyaniteEnergy ?? undefined) : undefined,
          audioAnalysisSource: (cyaniteGenreAccepted || cyaniteMoodsAccepted) ? "cyanite" : undefined,
          genreDetectionSource: detectedGenre ? "musixmatch_metadata" : undefined,
          languageDetectionSource: detectedLanguage ? "transcription" : undefined,
          genreConfidence: detectedGenre ? (analysisResult?.songMatchConfidence ?? undefined) : undefined,
          languageConfidence: undefined,
          creatorOverrodeGenre: detectedGenre ? genre !== detectedGenre : undefined,
          creatorOverrodeLanguage: detectedLanguage ? language !== detectedLanguage : undefined,
        },
        token,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save post";
      setUploadError(message);
      setUploadPhase("idle");
      setIsPosting(false);
      return;
    }

    const lyricSection =
      selectedSong && hasManualSection
        ? {
            sectionId: `line-${startLine}-${endLine}`,
            sectionLabel: "Selected range",
            trackId: selectedSong.track_id,
            startMs: startLineData?.startMs ?? 0,
            endMs: endLineData?.endMs ?? 999999,
            startLineIndex: startLine ?? 0,
            endLineIndex: endLine ?? 0,
            lineCount: (endLine ?? 0) - (startLine ?? 0) + 1,
            timingMode: (analysisResult?.timingMode ?? "manual") as TimingMode,
            timingOffsetMs,
            language: "en",
          }
        : undefined;

    const mm: Omit<
      MusicMinute,
      "id" | "views" | "likesCount" | "commentsCount" | "sharesCount" | "savesCount" | "goldenMicsCount" | "createdAt" | "isRisingVoice" | "isFeatured"
    > = {
      userId: currentUser!.id,
      title,
      caption,
      performanceType,
      genre,
      language,
      location,
      tags: [],
      musixmatchTrackId: selectedSong?.track_id,
      trackTitle: selectedSong?.track_name,
      trackArtist: selectedSong?.artist_name,
      imageIndex,
      videoUri: cloudVideoUrl,
      lyricSection,
    };

    postMusicMinute(mm);
    setUploadPhase("done");
    setIsPosting(false);
    setPosted(true);
  };

  // ─── Derived ─────────────────────────────────────────────────────────────

  const visualStep = toVisualStep(step);

  const selectedLineCount =
    fullLyrics && !noLyricsMode
      ? lyricRangeEndLine - lyricRangeStartLine + 1
      : 0;

  const estimatedDurationSec = (() => {
    if (!fullLyrics || fullLyrics.length === 0 || noLyricsMode) return null;
    const startL = fullLyrics[lyricRangeStartLine];
    const endL = fullLyrics[lyricRangeEndLine];
    if (startL?.startMs !== null && endL?.endMs !== null && startL?.startMs !== undefined && endL?.endMs !== undefined) {
      return Math.round((endL.endMs - startL.startMs) / 1000);
    }
    return null;
  })();

  // ─── Guard: guest ──────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.guestView, { paddingTop: topPad + 40 }]}>
          <MaterialCommunityIcons name="microphone" size={64} color={colors.primary} />
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>Your Stage Awaits</Text>
          <Text style={[styles.guestSubtitle, { color: colors.mutedForeground }]}>
            Sign up to post your first Music Minute and start your journey.
          </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/sign-up")} activeOpacity={0.85} style={styles.guestBtn}>
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.guestBtnGradient}>
              <Text style={styles.guestBtnText}>Join StageOne</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Reset helper ─────────────────────────────────────────────────────────

  const handleReset = () => {
    setPosted(false); setStep(1); setVideoUri(null); setTitle(""); setCaption("");
    setGenre("Pop"); setLanguage("English");
    setSelectedSong(null); setSongQuery(""); setFullLyrics(null); setNoLyricsMode(false);
    setTimingOffsetMs(0); setRightsConfirmed(false);
    setUploadedVideoUrl(null); setUploadedObjectKey(null);
    setAnalysisPhase("idle"); setAnalysisJobId(null); setAnalysisResult(null);
    setCyaniteGenreAccepted(false); setCyaniteMoodsAccepted(false);
    setDetectedGenre(null); setDetectedLanguage(null);
    prefillStep7AppliedRef.current = false;
    router.push("/");
  };

  // ─── Guard: posted ─────────────────────────────────────────────────────────

  if (posted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <PostSuccessOverlay
          onDone={handleReset}
          backgroundColor={colors.background}
          foregroundColor={colors.foreground}
          mutedColor={colors.mutedForeground}
          primaryColor={colors.primary}
        />
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <View style={styles.stepRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <View key={s} style={[styles.stepDot, { backgroundColor: s <= visualStep ? colors.primary : colors.border }]} />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.postHeader, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={step > 1 ? goBack : () => {}} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={step > 1 ? colors.foreground : "transparent"} />
        </TouchableOpacity>
        <Text style={[styles.postTitle, { color: colors.foreground }]}>Post a Music Minute</Text>
        <View style={{ width: 24 }} />
      </View>

      <StepIndicator />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={styles.stepContent}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 1 — Video
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>1. Record or Upload Your Video</Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                60-second limit · Good lighting and clear audio help you stand out.
              </Text>

              {videoUri ? (
                <View style={styles.videoPreviewContainer}>
                  <Video source={{ uri: videoUri }} style={styles.videoPreview} resizeMode={ResizeMode.COVER} shouldPlay isLooping isMuted={false} />
                  <LinearGradient colors={["transparent", "rgba(5,2,10,0.7)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={styles.videoMeta}>
                    <Ionicons name="videocam" size={16} color="#fff" />
                    <Text style={styles.videoDuration}>{formatDuration(videoDurationSec)}</Text>
                  </View>
                  <TouchableOpacity style={styles.changeVideoBtn} onPress={handlePickVideo} activeOpacity={0.8}>
                    <Text style={[styles.changeVideoBtnText, { color: colors.primary }]}>Change video</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadOptions}>
                  <TouchableOpacity style={[styles.uploadOption, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.8} onPress={handleRecordVideo}>
                    <Ionicons name="videocam" size={32} color={colors.primary} />
                    <Text style={[styles.uploadOptionTitle, { color: colors.foreground }]}>Record Video</Text>
                    <Text style={[styles.uploadOptionSub, { color: colors.mutedForeground }]}>60 sec</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadOption, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.8} onPress={handlePickVideo}>
                    <Ionicons name="cloud-upload-outline" size={32} color={colors.primary} />
                    <Text style={[styles.uploadOptionTitle, { color: colors.foreground }]}>Upload Video</Text>
                    <Text style={[styles.uploadOptionSub, { color: colors.mutedForeground }]}>From library</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={() => setStep(2)}
                style={[styles.nextBtn, !videoUri && { opacity: 0.5 }]}
                activeOpacity={0.85}
                disabled={!videoUri}
              >
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>{videoUri ? "Continue" : "Select a video first"}</Text>
                  {videoUri && <Ionicons name="chevron-forward" size={18} color="#fff" />}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 2 — Performance Type
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>2. What kind of performance is this?</Text>
              {(["original", "cover", "freestyle"] as PerformanceType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => { setPerformanceType(type); Haptics.selectionAsync(); }}
                  style={[styles.typeOption, { backgroundColor: performanceType === type ? `${colors.primary}20` : colors.card, borderColor: performanceType === type ? colors.primary : colors.border }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name={type === "original" ? "musical-notes" : type === "cover" ? "copy" : "mic"} size={22} color={performanceType === type ? colors.primary : colors.mutedForeground} />
                  <View style={styles.typeOptionText}>
                    <Text style={[styles.typeTitle, { color: performanceType === type ? colors.primary : colors.foreground }]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                    <Text style={[styles.typeSub, { color: colors.mutedForeground }]}>
                      {type === "original" ? "Your own composition" : type === "cover" ? "Someone else's song" : "Improvised performance"}
                    </Text>
                  </View>
                  {performanceType === type && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              ))}

              {/* Cover hint about AI */}
              {performanceType === "cover" && (
                <View style={[styles.aiHintCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
                  <MaterialCommunityIcons name="magic-staff" size={16} color={colors.primary} />
                  <Text style={[styles.aiHintText, { color: colors.mutedForeground }]}>
                    We'll analyze your recording to detect the song and sync lyrics automatically.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={() => {
                  if (performanceType === "cover") {
                    setStep(3);
                    // Start analysis immediately
                    handleStartAnalysis();
                  } else {
                    setStep(4);
                  }
                }}
                style={styles.nextBtn}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>Continue</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 3 — AI Analysis (cover only)
              Sub-phases: upload → polling → confirming
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 3 && performanceType === "cover" && (
            <View style={styles.stepView}>

              {/* ── Phase: upload ── */}
              {(analysisPhase === "upload" || analysisPhase === "idle") && (
                <>
                  <Text style={[styles.stepLabel, { color: colors.foreground }]}>Preparing your recording…</Text>
                  <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                    Uploading your video for AI analysis. This usually takes 10–30 seconds.
                  </Text>

                  <View style={[styles.waveformCard, { backgroundColor: colors.card, borderColor: `${colors.primary}30` }]}>
                    <AnalysisWaveform />
                  </View>

                  {analysisError ? (
                    <View style={[styles.errorCard, { backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }]}>
                      <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                      <Text style={[styles.stepHint, { color: "#EF4444" }]}>{analysisError}</Text>
                    </View>
                  ) : (
                    <View style={[styles.uploadProgressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.uploadProgressLabel, { color: colors.mutedForeground }]}>
                        {earlyUploadProgress === 0 ? "Preparing video…"
                          : earlyUploadProgress < 95 ? `Uploading… ${earlyUploadProgress}%`
                          : "Finishing upload…"}
                      </Text>
                      <View style={[styles.uploadProgressTrack, { backgroundColor: colors.muted }]}>
                        <View style={[styles.uploadProgressFill, { width: `${earlyUploadProgress}%`, backgroundColor: colors.primary }]} />
                      </View>
                    </View>
                  )}

                  <View style={styles.skipRow}>
                    <TouchableOpacity onPress={handleSkipAnalysis} activeOpacity={0.7}>
                      <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>Skip analysis → search manually</Text>
                    </TouchableOpacity>
                  </View>

                  {analysisError && (
                    <TouchableOpacity onPress={() => { setAnalysisError(null); handleStartAnalysis(); }} style={styles.nextBtn} activeOpacity={0.85}>
                      <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                        <Text style={styles.nextBtnText}>Retry</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* ── Phase: polling ── */}
              {analysisPhase === "polling" && (
                <>
                  <Text style={[styles.stepLabel, { color: colors.foreground }]}>Analyzing your performance…</Text>
                  <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                    Our AI is listening to your recording. This takes about 30–60 seconds.
                  </Text>

                  {/* Animated waveform + floating music notes */}
                  <View style={[styles.waveformCard, { backgroundColor: colors.card, borderColor: `${colors.primary}30` }]}>
                    <AnalysisWaveform stageLabel={STAGE_LABELS[analysisStage] ?? analysisStage} />
                    {/* Progress bar */}
                    <View style={[styles.stageProgressTrack, { backgroundColor: colors.muted, marginTop: 4 }]}>
                      <View style={[styles.stageProgressFill, { width: `${analysisProgress}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </View>

                  {/* Stage checklist with animated checkmarks */}
                  <View style={[styles.stageChecklist, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {[
                      { key: "preparing", label: "Preparing audio" },
                      { key: "isolating_vocals", label: "Isolating vocals" },
                      { key: "transcribing", label: "Listening to performance" },
                      { key: "searching_musixmatch", label: "Searching for song" },
                      { key: "matching_lyrics", label: "Matching lyrics" },
                    ].map(({ key, label }) => {
                      const isDone = seenStages.has(key) && analysisStage !== key;
                      const isActive = analysisStage === key;
                      if (key === "isolating_vocals" && !seenStages.has("isolating_vocals")) return null;
                      return (
                        <AnimatedCheckItem
                          key={key}
                          isDone={isDone}
                          isActive={isActive}
                          label={label}
                          primaryColor={colors.primary}
                          foregroundColor={colors.foreground}
                          mutedColor={colors.mutedForeground}
                          borderColor={colors.border}
                        />
                      );
                    })}
                  </View>

                  <TouchableOpacity onPress={handleSkipAnalysis} activeOpacity={0.7} style={styles.skipRow}>
                    <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>Skip — search manually instead</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Phase: failed ── */}
              {analysisPhase === "failed" && (
                <>
                  <Text style={[styles.stepLabel, { color: colors.foreground }]}>Analysis didn't complete</Text>
                  <View style={[styles.errorCard, { backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }]}>
                    <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
                    <Text style={[styles.stepHint, { color: "#EF4444" }]}>{analysisError}</Text>
                  </View>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setAnalysisError(null);
                        setAnalysisPhase("idle");
                        setSeenStages(new Set());
                        handleStartAnalysis();
                      }}
                      style={[styles.secondaryBtn, { borderColor: colors.primary }]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Retry analysis</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSkipAnalysis}
                      style={[styles.secondaryBtn, { borderColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Search manually</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setAnalysisPhase("skipped"); setStep(7); }}
                    activeOpacity={0.7}
                    style={styles.skipRow}
                  >
                    <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>Skip lyrics entirely</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Phase: confirming ── */}
              {analysisPhase === "confirming" && analysisResult && (
                <>
                  <Text style={[styles.stepLabel, { color: colors.foreground }]}>Song Detected</Text>

                  {/* High/Medium confidence: show main match */}
                  {analysisResult.detectedTrackId && (analysisResult.songMatchConfidence ?? 0) >= 0.4 && (
                    <>
                      <Animated.View style={confirmCardAnimStyle}>
                        {/* Glow ring that pulses on entrance */}
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            { borderRadius: 18, borderWidth: 2.5, borderColor: colors.primary },
                            confirmGlowAnimStyle,
                          ]}
                        />
                        <View style={[styles.songConfirmCard, { backgroundColor: colors.card, borderColor: `${colors.primary}40` }]}>
                          {analysisResult.detectedAlbumArt ? (
                            <Image source={{ uri: analysisResult.detectedAlbumArt }} style={styles.albumArt} />
                          ) : (
                            <View style={[styles.albumArtPlaceholder, { backgroundColor: `${colors.primary}20` }]}>
                              <Ionicons name="musical-notes" size={32} color={colors.primary} />
                            </View>
                          )}
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={[styles.confirmedTrackTitle, { color: colors.foreground }]} numberOfLines={2}>
                              {analysisResult.detectedTrackTitle}
                            </Text>
                            <Text style={[styles.confirmedTrackArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {analysisResult.detectedTrackArtist}
                            </Text>
                            {analysisResult.songMatchConfidence !== undefined && (
                              <View style={[styles.confidenceBadge, { backgroundColor: `${confidenceLabel(analysisResult.songMatchConfidence).color}20` }]}>
                                <Text style={[styles.confidenceBadgeText, { color: confidenceLabel(analysisResult.songMatchConfidence).color }]}>
                                  {confidenceLabel(analysisResult.songMatchConfidence).label}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </Animated.View>

                      <View style={[styles.musixmatchBadge, { backgroundColor: "rgba(255,191,0,0.12)", borderColor: "rgba(255,191,0,0.35)" }]}>
                        <MaterialCommunityIcons name="music-note" size={13} color="#FFBF00" />
                        <Text style={[styles.musixmatchText, { color: "#CC9A00" }]}>Powered by Musixmatch</Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => {
                          handleConfirmSong({
                            trackId: analysisResult.detectedTrackId!,
                            trackTitle: analysisResult.detectedTrackTitle ?? "",
                            artistName: analysisResult.detectedTrackArtist ?? "",
                            albumArt: analysisResult.detectedAlbumArt,
                          });
                        }}
                        style={styles.nextBtn}
                        activeOpacity={0.85}
                      >
                        <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.nextBtnText}>Yes, that's the song</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Medium confidence: also show top candidates */}
                  {(analysisResult.songMatchConfidence ?? 0) >= 0.4 &&
                    (analysisResult.songMatchConfidence ?? 0) < 0.7 &&
                    (analysisResult.topCandidates ?? []).length > 1 && (
                    <>
                      <Text style={[styles.stepHint, { color: colors.mutedForeground, marginTop: 4 }]}>
                        Or choose from other matches:
                      </Text>
                      {(analysisResult.topCandidates ?? []).slice(1, 4).map((c: AnalysisCandidate) => (
                        <TouchableOpacity
                          key={c.trackId}
                          onPress={() => handleConfirmSong(c)}
                          style={[styles.candidateRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="musical-notes" size={16} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.candidateTitle, { color: colors.foreground }]} numberOfLines={1}>{c.trackTitle}</Text>
                            <Text style={[styles.candidateArtist, { color: colors.mutedForeground }]} numberOfLines={1}>{c.artistName}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {/* Low / no confidence */}
                  {(!analysisResult.detectedTrackId || (analysisResult.songMatchConfidence ?? 0) < 0.4) && (
                    <View style={[styles.noMatchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
                      <Text style={[styles.noMatchTitle, { color: colors.foreground }]}>Couldn't identify the song</Text>
                      <Text style={[styles.noMatchSub, { color: colors.mutedForeground }]}>
                        You can search manually or post without song tagging.
                      </Text>
                    </View>
                  )}

                  {/* Genre & language detections */}
                  {(analysisResult.musixmatchGenre || analysisResult.detectedLanguage) && (
                    <View style={[styles.aiDetectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.aiDetectCardHeader}>
                        <MaterialCommunityIcons name="magic-staff" size={13} color={colors.primary} />
                        <Text style={[styles.aiDetectCardTitle, { color: colors.primary }]}>AI also detected</Text>
                      </View>
                      <View style={styles.aiDetectChips}>
                        {analysisResult.musixmatchGenre && (
                          <View style={[styles.aiDetectChip, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                            <Ionicons name="musical-notes-outline" size={13} color={colors.primary} />
                            <Text style={[styles.aiDetectChipText, { color: colors.primary }]}>
                              {mapMusixmatchGenre(analysisResult.musixmatchGenre) ?? analysisResult.musixmatchGenre}
                            </Text>
                          </View>
                        )}
                        {analysisResult.detectedLanguage && (
                          <View style={[styles.aiDetectChip, { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.3)" }]}>
                            <Ionicons name="language-outline" size={13} color="#22C55E" />
                            <Text style={[styles.aiDetectChipText, { color: "#22C55E" }]}>
                              {mapDetectedLanguage(analysisResult.detectedLanguage) ?? analysisResult.detectedLanguage}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.aiDetectCardHint, { color: colors.mutedForeground }]}>
                        These will be pre-filled in the details step.
                      </Text>
                    </View>
                  )}

                  {/* Always show "Not this song" / manual search option */}
                  <View style={styles.confirmActions}>
                    <TouchableOpacity
                      onPress={handleSkipAnalysis}
                      style={[styles.secondaryBtn, { borderColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                        {analysisResult.detectedTrackId ? "Not this song" : "Search manually"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setAnalysisPhase("skipped"); setStep(7); }}
                      style={[styles.secondaryBtn, { borderColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Skip lyrics</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 4 — Manual Song Search
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                {performanceType === "cover" ? "3. Tag the Song" : "3. Tag Inspiration or Backing Track"}
              </Text>
              {performanceType !== "cover" && (
                <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                  Optional — tag a song that inspired this performance. This helps with discoverability.
                </Text>
              )}

              <View style={[styles.musixmatchBadge, { backgroundColor: "rgba(255,191,0,0.12)", borderColor: "rgba(255,191,0,0.35)" }]}>
                <MaterialCommunityIcons name="music-note" size={13} color="#FFBF00" />
                <Text style={[styles.musixmatchText, { color: "#CC9A00" }]}>Powered by Musixmatch</Text>
              </View>

              <View style={[styles.songSearchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  value={songQuery}
                  onChangeText={(text) => {
                    setSongQuery(text);
                    if (!text.trim()) { setSongResults([]); setSongSearchError(false); setHasSearched(false); setSongSearchSource(null); }
                  }}
                  placeholder="Search song title or artist"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.songSearchInput, { color: colors.foreground }]}
                  returnKeyType="search"
                  onSubmitEditing={handleSongSearch}
                />
                <TouchableOpacity onPress={handleSongSearch} activeOpacity={0.7} disabled={isSongSearching}>
                  {isSongSearching ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.searchBtn, { color: colors.primary }]}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>

              {songSearchError && !selectedSong && (
                <View style={[styles.searchStateBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="alert-circle-outline" size={28} color="#EF4444" />
                  <Text style={[styles.searchStateTitle, { color: colors.foreground }]}>Song search is temporarily unavailable.</Text>
                  <Text style={[styles.searchStateSub, { color: colors.mutedForeground }]}>You can retry or continue without tagging a song.</Text>
                  <View style={styles.searchStateActions}>
                    <TouchableOpacity onPress={handleSongSearch} style={[styles.searchStateBtn, { borderColor: colors.primary }]} activeOpacity={0.8}>
                      <Text style={[styles.searchStateBtnText, { color: colors.primary }]}>Retry</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setSongSearchError(false);
                        if (performanceType === "cover") setStep(5); else setStep(7);
                      }}
                      style={[styles.searchStateBtn, { borderColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.searchStateBtnText, { color: colors.mutedForeground }]}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {selectedSong && (
                <View style={[styles.selectedSong, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}40` }]}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  <View style={styles.selectedSongInfo}>
                    <Text style={[styles.selectedSongTitle, { color: colors.foreground }]}>{selectedSong.track_name}</Text>
                    <Text style={[styles.selectedSongArtist, { color: colors.mutedForeground }]}>{selectedSong.artist_name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedSong(null); setFullLyrics(null); setNoLyricsMode(false); }} activeOpacity={0.7}>
                    <Ionicons name="close" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              )}

              {songResults.length > 0 && !selectedSong && !songSearchError && (
                <View style={{ position: "relative" }}>
                  <View style={styles.sourceBadgeRow}>
                    <View style={[styles.sourceBadge, {
                      backgroundColor: songSearchSource === "musixmatch" ? "rgba(255,191,0,0.12)" : "rgba(168,85,247,0.12)",
                      borderColor: songSearchSource === "musixmatch" ? "rgba(255,191,0,0.35)" : "rgba(168,85,247,0.35)",
                    }]}>
                      <MaterialCommunityIcons name={songSearchSource === "musixmatch" ? "music-note" : "database"} size={11} color={songSearchSource === "musixmatch" ? "#CC9A00" : "#A855F7"} />
                      <Text style={[styles.sourceBadgeText, { color: songSearchSource === "musixmatch" ? "#CC9A00" : "#A855F7" }]}>
                        {songSearchSource === "musixmatch" ? "Musixmatch" : "Demo"}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.songResultsList, { borderColor: colors.border, opacity: isSongSearching ? 0.45 : 1 }]}>
                    {songResults.map((track) => (
                      <TouchableOpacity
                        key={track.track_id}
                        onPress={() => { setSelectedSong(track); setSongResults([]); setFullLyrics(null); setNoLyricsMode(false); }}
                        style={[styles.songResultRow, { borderBottomColor: colors.border }]}
                        activeOpacity={0.8}
                        disabled={isSongSearching}
                      >
                        <Ionicons name="musical-notes" size={16} color={colors.primary} />
                        <View style={styles.songResultInfo}>
                          <Text style={[styles.songResultTitle, { color: colors.foreground }]} numberOfLines={1}>{track.track_name}</Text>
                          <Text style={[styles.songResultArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {track.artist_name}{track.album_name ? ` · ${track.album_name}` : ""}
                          </Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {isSongSearching && (
                    <View style={styles.songResultsLoadingOverlay}><ActivityIndicator size="small" color={colors.primary} /></View>
                  )}
                </View>
              )}

              {hasSearched && songResults.length === 0 && !selectedSong && !songSearchError && !isSongSearching && (
                <View style={[styles.searchStateBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.searchStateTitle, { color: colors.foreground }]}>No matching tracks found.</Text>
                  <Text style={[styles.searchStateSub, { color: colors.mutedForeground }]}>Try a song title or artist name.</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={() => {
                  if (performanceType === "cover" && selectedSong) { setStep(5); }
                  else { setStep(7); }
                }}
                style={[styles.nextBtn, { marginTop: 8 }]}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>
                    {performanceType === "cover" && selectedSong ? "Choose Lyrics" : selectedSong ? "Continue" : "Skip"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 5 — Lyric Range Editor (cover + song only)
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 5 && performanceType === "cover" && selectedSong && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>3.5 — Choose Your Lyric Range</Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                {analysisResult?.startLineIndex !== undefined
                  ? "We detected the part you performed. Tap lines to adjust the range."
                  : "Select the part of the song you sang. Tap a line to set the start or end of your range."}
              </Text>

              {/* Song reference pill */}
              <View style={[styles.songRefCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
                <Ionicons name="musical-notes" size={16} color={colors.primary} />
                <Text style={[styles.songRefTitle, { color: colors.foreground }]} numberOfLines={1}>{selectedSong.track_name}</Text>
                <Text style={[styles.songRefArtist, { color: colors.mutedForeground }]}>{selectedSong.artist_name}</Text>
              </View>

              {fullLyricsLoading && (
                <View style={styles.centeredRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>Loading lyrics…</Text>
                </View>
              )}

              {!fullLyricsLoading && !fullLyrics && (
                <View style={[styles.noSyncCard, { backgroundColor: "rgba(255,191,0,0.08)", borderColor: "rgba(255,191,0,0.30)" }]}>
                  <MaterialCommunityIcons name="music-note-off" size={18} color="#CC9A00" />
                  <Text style={[styles.noSyncText, { color: colors.mutedForeground }]}>
                    Lyrics are unavailable for this track — you can still post without a lyric overlay.
                  </Text>
                </View>
              )}

              {/* Range stats bar */}
              {fullLyrics && !noLyricsMode && (
                <View style={[styles.rangeStatsBar, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
                  <MaterialCommunityIcons name="format-list-text" size={14} color={colors.primary} />
                  <Text style={[styles.rangeStatText, { color: colors.primary }]}>
                    {selectedLineCount} line{selectedLineCount !== 1 ? "s" : ""} selected
                    {estimatedDurationSec !== null ? ` · ~${estimatedDurationSec}s` : ""}
                  </Text>
                  {analysisResult?.startLineIndex !== undefined && (
                    <TouchableOpacity
                      onPress={() => {
                        setLyricRangeStartLine(analysisResult.startLineIndex!);
                        setLyricRangeEndLine(analysisResult.endLineIndex!);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.rangeResetBtn, { color: colors.primary }]}>Use AI range</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Scrollable lyric list */}
              {fullLyrics && fullLyrics.length > 0 && !noLyricsMode && (
                <View style={[styles.lyricRangeList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.lyricRangeListHint, { color: colors.mutedForeground }]}>
                    Tap to expand · tap selected edge to contract
                  </Text>
                  {fullLyrics.map((line, idx) => {
                    const isSelected = idx >= lyricRangeStartLine && idx <= lyricRangeEndLine;
                    const isStartEdge = idx === lyricRangeStartLine;
                    const isEndEdge = idx === lyricRangeEndLine;

                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => {
                          if (idx < lyricRangeStartLine) {
                            setLyricRangeStartLine(idx);
                          } else if (idx > lyricRangeEndLine) {
                            setLyricRangeEndLine(idx);
                          } else if (isStartEdge && lyricRangeStartLine < lyricRangeEndLine) {
                            setLyricRangeStartLine(lyricRangeStartLine + 1);
                          } else if (isEndEdge && lyricRangeEndLine > lyricRangeStartLine) {
                            setLyricRangeEndLine(lyricRangeEndLine - 1);
                          }
                        }}
                        style={[
                          styles.lyricRangeRow,
                          { borderTopColor: colors.border },
                          isSelected && { backgroundColor: `${colors.primary}14` },
                          isStartEdge && { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
                          isEndEdge && { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
                        ]}
                        activeOpacity={0.7}
                      >
                        {isStartEdge && (
                          <View style={[styles.rangeHandle, { backgroundColor: colors.primary }]}>
                            <Ionicons name="arrow-up" size={10} color="#fff" />
                          </View>
                        )}
                        {isEndEdge && !isStartEdge && (
                          <View style={[styles.rangeHandle, styles.rangeHandleBottom, { backgroundColor: colors.primary }]}>
                            <Ionicons name="arrow-down" size={10} color="#fff" />
                          </View>
                        )}
                        <Text
                          style={[
                            styles.lyricRangeLineText,
                            { color: isSelected ? colors.foreground : colors.mutedForeground },
                            isSelected && { fontWeight: "600" },
                          ]}
                        >
                          {line.text || "♪"}
                        </Text>
                        {line.startMs !== null && (
                          <Text style={[styles.lyricRangeLineTime, { color: colors.mutedForeground }]}>
                            {fmtMs(line.startMs!)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Actions */}
              <TouchableOpacity
                onPress={() => { setNoLyricsMode(true); setStep(7); }}
                style={[styles.secondaryBtn, { borderColor: colors.border, alignSelf: "center" }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Continue without lyrics</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (skipTimingStep) { setStep(7); } else { setStep(6); }
                }}
                style={[styles.nextBtn, (!fullLyrics && !noLyricsMode) && { opacity: 0.5 }]}
                disabled={!fullLyrics && !noLyricsMode}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>
                    {fullLyrics && !noLyricsMode ? "Fine-Tune Timing" : "Continue without Lyrics"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 6 — Timing Fine-Tune
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 6 && performanceType === "cover" && selectedSong && !noLyricsMode && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>3.6 — Fine-Tune Timing</Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                If the lyrics appear slightly early or late, adjust the offset. Leave at 0 if it feels right.
              </Text>

              {/* Video preview with live lyric sync */}
              {uploadedVideoUrl ? (
                <TouchableOpacity
                  style={styles.videoPreviewContainer}
                  activeOpacity={1}
                  onPress={() => setIsVideoPlaying((v) => !v)}
                >
                  <Video
                    ref={videoRef}
                    source={{ uri: uploadedVideoUrl }}
                    style={styles.videoPreview}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={isVideoPlaying}
                    isLooping
                    isMuted={false}
                    onPlaybackStatusUpdate={(status) => {
                      if (status.isLoaded) setVideoPositionMs(status.positionMillis);
                    }}
                  />
                  <LinearGradient colors={["transparent", "rgba(5,2,10,0.85)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
                  {/* Synced lyric overlay — active line (word-level if RichSync) + next 2 lines */}
                  {fullLyrics && (() => {
                    const rangeLines = fullLyrics.slice(lyricRangeStartLine, lyricRangeEndLine + 1);
                    if (rangeLines.length === 0) return null;
                    const sectionStartMs = fullLyrics[lyricRangeStartLine]?.startMs ?? null;
                    let activeIdx: number;
                    if (sectionStartMs === null || !rangeLines[0]?.startMs) {
                      const totalMs = (videoDurationSec * 1000) || rangeLines.length * 3000;
                      activeIdx = Math.min(
                        Math.floor(videoPositionMs / (totalMs / rangeLines.length)),
                        rangeLines.length - 1,
                      );
                    } else {
                      const absMs = videoPositionMs + sectionStartMs + timingOffsetMs;
                      activeIdx = rangeLines.findIndex(
                        (l) => l.startMs !== null && l.endMs !== null && absMs >= (l.startMs ?? 0) && absMs < (l.endMs ?? Infinity),
                      );
                      if (activeIdx < 0) activeIdx = 0;
                    }
                    const displayLines = rangeLines.slice(activeIdx, activeIdx + 3);
                    // RichSync word-level: find the last anchor whose videoMs ≤ current position
                    const anchors = analysisResult?.timingAnchors;
                    const hasWordAnchors = anchors?.some((a) => a.word);
                    const activeAnchorWord = hasWordAnchors
                      ? anchors
                          ?.filter((a) => a.word && a.videoMs <= videoPositionMs)
                          ?.at(-1)
                          ?.word?.toLowerCase()
                      : undefined;
                    return (
                      <View style={styles.videoLyricOverlay}>
                        {displayLines.map((line, i) => {
                          if (i !== 0 || !activeAnchorWord) {
                            return (
                              <Text
                                key={`${activeIdx}-${i}`}
                                style={i === 0 ? styles.videoLyricActive : styles.videoLyricDim}
                                numberOfLines={1}
                              >
                                {line.text}
                              </Text>
                            );
                          }
                          // Active line with per-word highlight
                          const tokens = line.text.split(/(\s+)/);
                          const normalize = (s: string) => s.toLowerCase().replace(/[^\w]/g, "");
                          return (
                            <Text key={`${activeIdx}-${i}`} style={styles.videoLyricActive} numberOfLines={1}>
                              {tokens.map((token, ti) => {
                                const isActive = normalize(token) !== "" && normalize(token) === normalize(activeAnchorWord);
                                return (
                                  <Text key={ti} style={isActive ? styles.videoLyricWord : undefined}>
                                    {token}
                                  </Text>
                                );
                              })}
                            </Text>
                          );
                        })}
                      </View>
                    );
                  })()}
                  {/* Play/pause overlay */}
                  {!isVideoPlaying && (
                    <View style={styles.videoPauseOverlay} pointerEvents="none">
                      <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.85)" />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={[styles.videoPreviewContainer, styles.videoPreviewPlaceholder]}>
                  <ActivityIndicator size="large" color="#A855F7" />
                  <Text style={styles.videoPreviewPlaceholderText}>Video still uploading…</Text>
                </View>
              )}

              {/* Timing card */}
              <View style={[styles.timingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.timingSection}>
                  <Ionicons name="musical-note" size={16} color={colors.primary} />
                  <Text style={[styles.timingSectionLabel, { color: colors.foreground }]}>
                    Lines {lyricRangeStartLine + 1}–{lyricRangeEndLine + 1} · {selectedLineCount} lines
                  </Text>
                </View>
              </View>

              <Text style={[styles.sliderLabel, { color: colors.mutedForeground }]}>Shift lyrics earlier / later</Text>

              <TimingSlider
                value={timingOffsetMs}
                onChangeValue={setTimingOffsetMs}
                primaryColor={colors.primary}
                borderColor={colors.border}
                mutedForeground={colors.mutedForeground}
              />

              <View style={styles.offsetDisplay}>
                <Text style={[styles.offsetValue, { color: colors.foreground }]}>
                  {timingOffsetMs > 0 ? `+${timingOffsetMs}` : timingOffsetMs} ms
                </Text>
                {timingOffsetMs !== 0 && (
                  <TouchableOpacity onPress={() => setTimingOffsetMs(0)} activeOpacity={0.7}>
                    <Text style={[styles.offsetReset, { color: colors.primary }]}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.offsetHint, { color: colors.mutedForeground }]}>
                Negative shifts lyrics earlier · Positive shifts later
              </Text>

              <TouchableOpacity onPress={() => setStep(7)} style={styles.nextBtn} activeOpacity={0.85}>
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>Add Details</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 7 — Add Details
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 7 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>4. Add Details</Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Give your performance a title"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                maxLength={100}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Caption</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Tell your story... #hashtags"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, styles.captionInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                multiline
                maxLength={280}
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Genre</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsList}>
                {GENRES.map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGenre(g)}
                    style={[styles.tagChip, { backgroundColor: genre === g ? colors.primary : colors.muted, borderColor: genre === g ? colors.primary : colors.border }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tagChipText, { color: genre === g ? "#fff" : colors.mutedForeground }]}>{g}</Text>
                    {detectedGenre === g && (
                      <View style={[styles.detectedDot, { backgroundColor: genre === g ? "rgba(255,255,255,0.6)" : colors.primary }]} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {detectedGenre && (
                <View style={[styles.detectedHint, { backgroundColor: `${colors.primary}0F`, borderColor: `${colors.primary}30` }]}>
                  <MaterialCommunityIcons name="music-note" size={11} color={colors.primary} />
                  <Text style={[styles.detectedHintText, { color: colors.primary }]}>
                    {genre === detectedGenre
                      ? `Detected from song match — tap another to override`
                      : `Detected: ${detectedGenre}`}
                  </Text>
                </View>
              )}

              {/* ── Cyanite suggestion chips ── */}
              {analysisResult && (analysisResult.cyaniteGenre || (analysisResult.cyaniteMoods && analysisResult.cyaniteMoods.length > 0)) && (
                <View style={[styles.cyaniteSection, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}25` }]}>
                  <View style={styles.cyaniteHeader}>
                    <MaterialCommunityIcons name="magic-staff" size={13} color={colors.primary} />
                    <Text style={[styles.cyaniteHeaderText, { color: colors.primary }]}>Suggested by audio analysis</Text>
                  </View>
                  <View style={styles.cyaniteChips}>
                    {analysisResult.cyaniteGenre && (
                      <TouchableOpacity
                        onPress={() => {
                          setGenre(analysisResult.cyaniteGenre!);
                          setCyaniteGenreAccepted(true);
                          Haptics.selectionAsync();
                        }}
                        style={[
                          styles.cyaniteChip,
                          {
                            backgroundColor: cyaniteGenreAccepted ? colors.primary : `${colors.primary}18`,
                            borderColor: colors.primary,
                          },
                        ]}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="music" size={12} color={cyaniteGenreAccepted ? "#fff" : colors.primary} />
                        <Text style={[styles.cyaniteChipText, { color: cyaniteGenreAccepted ? "#fff" : colors.primary }]}>
                          {analysisResult.cyaniteGenre}
                        </Text>
                        {cyaniteGenreAccepted && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </TouchableOpacity>
                    )}
                    {analysisResult.cyaniteMoods?.slice(0, 3).map((mood) => (
                      <TouchableOpacity
                        key={mood}
                        onPress={() => {
                          setCyaniteMoodsAccepted(true);
                          Haptics.selectionAsync();
                        }}
                        style={[
                          styles.cyaniteChip,
                          {
                            backgroundColor: cyaniteMoodsAccepted ? `${colors.primary}50` : `${colors.primary}12`,
                            borderColor: `${colors.primary}60`,
                          },
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.cyaniteChipText, { color: colors.primary }]}>{mood}</Text>
                      </TouchableOpacity>
                    ))}
                    {analysisResult.cyaniteEnergy && (
                      <View style={[styles.cyaniteChip, { backgroundColor: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.35)" }]}>
                        <Text style={[styles.cyaniteChipText, { color: "#6366F1" }]}>{analysisResult.cyaniteEnergy}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Language</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsList}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => setLanguage(l)}
                    style={[styles.tagChip, { backgroundColor: language === l ? colors.primary : colors.muted, borderColor: language === l ? colors.primary : colors.border }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tagChipText, { color: language === l ? "#fff" : colors.mutedForeground }]}>{l}</Text>
                    {detectedLanguage === l && (
                      <View style={[styles.detectedDot, { backgroundColor: language === l ? "rgba(255,255,255,0.6)" : colors.primary }]} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {detectedLanguage && (
                <View style={[styles.detectedHint, { backgroundColor: `${colors.primary}0F`, borderColor: `${colors.primary}30` }]}>
                  <MaterialCommunityIcons name="translate" size={11} color={colors.primary} />
                  <Text style={[styles.detectedHintText, { color: colors.primary }]}>
                    {language === detectedLanguage
                      ? `Detected from your performance — tap another to override`
                      : `Detected: ${detectedLanguage}`}
                  </Text>
                </View>
              )}

              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="City, Country (optional)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              />

              <TouchableOpacity onPress={() => setStep(8)} style={styles.nextBtn} activeOpacity={0.85}>
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>Review</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 8 — Review & Post
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 8 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>5. Review and Post</Text>
              <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ReviewRow label="Title" value={title || "—"} colors={colors} />
                <ReviewRow label="Type" value={performanceType} colors={colors} />
                <ReviewRow label="Genre" value={genre} colors={colors} />
                <ReviewRow label="Language" value={language} colors={colors} />
                <ReviewRow label="Video" value={videoUri ? `${formatDuration(videoDurationSec)} recorded` : "No video"} colors={colors} />
                {selectedSong && <ReviewRow label="Song" value={`${selectedSong.track_name} — ${selectedSong.artist_name}`} colors={colors} />}
                {fullLyrics && !noLyricsMode && (
                  <ReviewRow label="Lyrics" value={`Lines ${lyricRangeStartLine + 1}–${lyricRangeEndLine + 1} (${selectedLineCount} lines)`} colors={colors} />
                )}
                {timingOffsetMs !== 0 && (
                  <ReviewRow label="Timing offset" value={`${timingOffsetMs > 0 ? "+" : ""}${timingOffsetMs} ms`} colors={colors} />
                )}
                {analysisJobId && <ReviewRow label="Analysis" value="AI-assisted ✓" colors={colors} />}
                {location && <ReviewRow label="Location" value={location} colors={colors} />}
              </View>

              <TouchableOpacity onPress={() => setRightsConfirmed(!rightsConfirmed)} style={styles.rightsRow} activeOpacity={0.8}>
                <View style={[styles.checkbox, { borderColor: rightsConfirmed ? colors.primary : colors.border, backgroundColor: rightsConfirmed ? colors.primary : "transparent" }]}>
                  {rightsConfirmed && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.rightsText, { color: colors.mutedForeground }]}>
                  I confirm this is my performance and I have the right to upload it.
                </Text>
              </TouchableOpacity>

              {uploadError && (
                <View style={[styles.uploadErrorCard, { backgroundColor: "#EF444418", borderColor: "#EF4444" }]}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={[styles.uploadErrorText, { color: "#EF4444" }]}>{uploadError}</Text>
                </View>
              )}

              {isPosting && (
                <View style={[styles.uploadProgressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <AnalysisWaveform
                    stageLabel={
                      uploadPhase === "saving" ? "Saving your Music Minute…"
                        : uploadProgress === 0 ? "Preparing video…"
                        : uploadProgress < 95 ? `Uploading… ${uploadProgress}%`
                        : "Finishing upload…"
                    }
                  />
                  <View style={[styles.uploadProgressTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.uploadProgressFill, { width: uploadPhase === "saving" ? "100%" : `${uploadProgress}%`, backgroundColor: colors.primary }]} />
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handlePost}
                disabled={isPosting || !rightsConfirmed}
                style={[styles.nextBtn, (!rightsConfirmed || isPosting) && { opacity: 0.5 }]}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#A855F7", "#EC4899", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
                  <Text style={styles.nextBtnText}>
                    {isPosting
                      ? uploadPhase === "uploading" ? "Uploading…" : "Saving…"
                      : uploadError ? "Retry" : "Post Music Minute"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── ReviewRow ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  postHeader: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  postTitle: { fontSize: 17, fontWeight: "700" },
  stepRow: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 14 },
  stepDot: { width: 6, height: 6, borderRadius: 3 },
  stepContent: { flex: 1 },
  stepView: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  stepLabel: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  stepHint: { fontSize: 13, lineHeight: 18, marginTop: -8 },
  // Video
  uploadOptions: { flexDirection: "row", gap: 12 },
  uploadOption: { flex: 1, alignItems: "center", gap: 10, padding: 24, borderRadius: 16, borderWidth: 1 },
  uploadOptionTitle: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  uploadOptionSub: { fontSize: 12, textAlign: "center" },
  videoPreviewContainer: { width: "100%", height: 240, borderRadius: 16, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  videoPreview: { width: "100%", height: "100%" },
  videoMeta: { position: "absolute", bottom: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  videoDuration: { color: "#fff", fontSize: 13, fontWeight: "700" },
  changeVideoBtn: { position: "absolute", bottom: 12, right: 12, backgroundColor: "rgba(5,2,10,0.7)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  changeVideoBtnText: { fontSize: 13, fontWeight: "600" },
  videoLyricOverlay: { position: "absolute", bottom: 20, left: 16, right: 16, alignItems: "center", gap: 4 },
  videoLyricActive: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  videoLyricDim: { color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center" },
  videoLyricWord: { color: "#FCD34D", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  // Type selection
  typeOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 1 },
  typeOptionText: { flex: 1 },
  typeTitle: { fontSize: 15, fontWeight: "700" },
  typeSub: { fontSize: 12, marginTop: 2 },
  aiHintCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  aiHintText: { flex: 1, fontSize: 12, lineHeight: 17 },
  // Analysis
  stageCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  waveformCard: { padding: 16, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 8 },
  stageLabel: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  stageProgressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  stageProgressFill: { height: 4, borderRadius: 2 },
  stageChecklist: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  stageCheckItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  stageCheckLabel: { fontSize: 13 },
  skipRow: { alignItems: "center", paddingVertical: 4 },
  skipLink: { fontSize: 13 },
  // Song confirmation
  songConfirmCard: { flexDirection: "row", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  albumArt: { width: 80, height: 80, borderRadius: 10 },
  albumArtPlaceholder: { width: 80, height: 80, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  confirmedTrackTitle: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  confirmedTrackArtist: { fontSize: 13 },
  confidenceBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  confidenceBadgeText: { fontSize: 11, fontWeight: "700" },
  candidateRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  candidateTitle: { fontSize: 13, fontWeight: "700" },
  candidateArtist: { fontSize: 12, marginTop: 1 },
  noMatchCard: { alignItems: "center", padding: 24, borderRadius: 14, borderWidth: 1, gap: 8 },
  noMatchTitle: { fontSize: 16, fontWeight: "700" },
  noMatchSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  confirmActions: { flexDirection: "row", gap: 10 },
  aiDetectCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  aiDetectCardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiDetectCardTitle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  aiDetectChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  aiDetectChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  aiDetectChipText: { fontSize: 13, fontWeight: "600" },
  aiDetectCardHint: { fontSize: 11, lineHeight: 15 },
  secondaryBtn: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  secondaryBtnText: { fontSize: 13, fontWeight: "600" },
  // Song search
  musixmatchBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  musixmatchText: { fontSize: 12, fontWeight: "600" },
  songSearchBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  songSearchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  searchBtn: { fontSize: 14, fontWeight: "700" },
  selectedSong: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  selectedSongInfo: { flex: 1 },
  selectedSongTitle: { fontSize: 14, fontWeight: "700" },
  selectedSongArtist: { fontSize: 12, marginTop: 2 },
  songResultsList: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  songResultsLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  songResultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1 },
  songResultInfo: { flex: 1 },
  songResultTitle: { fontSize: 14, fontWeight: "600" },
  songResultArtist: { fontSize: 12, marginTop: 2 },
  sourceBadgeRow: { flexDirection: "row", marginBottom: 6 },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  sourceBadgeText: { fontSize: 11, fontWeight: "600" },
  searchStateBox: { alignItems: "center", padding: 20, borderRadius: 14, borderWidth: 1, gap: 8 },
  searchStateTitle: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  searchStateSub: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  searchStateActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  searchStateBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  searchStateBtnText: { fontSize: 13, fontWeight: "700" },
  // Lyric range editor
  songRefCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  songRefTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  songRefArtist: { fontSize: 12 },
  centeredRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 12 },
  noSyncCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  noSyncText: { flex: 1, fontSize: 13, lineHeight: 18 },
  rangeStatsBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  rangeStatText: { flex: 1, fontSize: 13, fontWeight: "600" },
  rangeResetBtn: { fontSize: 12, fontWeight: "700" },
  lyricRangeList: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  lyricRangeListHint: { fontSize: 11, fontWeight: "600", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  lyricRangeRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, position: "relative" },
  lyricRangeLineText: { flex: 1, fontSize: 14, lineHeight: 20 },
  lyricRangeLineTime: { fontSize: 11, marginLeft: 8 },
  rangeHandle: { position: "absolute", left: 0, top: 0, width: 20, height: "100%", alignItems: "center", justifyContent: "center", borderTopLeftRadius: 4 },
  rangeHandleBottom: { top: undefined, bottom: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 4 },
  // Timing
  timingCard: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 4 },
  timingSection: { flexDirection: "row", alignItems: "center", gap: 8 },
  timingSectionLabel: { fontSize: 15, fontWeight: "700" },
  videoPauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  videoPreviewPlaceholder: { alignItems: "center", justifyContent: "center", gap: 12 },
  videoPreviewPlaceholderText: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  sliderLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  offsetDisplay: { flex: 1, alignItems: "center", gap: 4 },
  offsetValue: { fontSize: 20, fontWeight: "800" },
  offsetReset: { fontSize: 12, fontWeight: "600" },
  offsetHint: { fontSize: 12, textAlign: "center" },
  // Cyanite chips
  cyaniteSection: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 8 },
  cyaniteHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cyaniteHeaderText: { fontSize: 12, fontWeight: "700" },
  cyaniteChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cyaniteChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  cyaniteChipText: { fontSize: 12, fontWeight: "600" },
  // Details
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: -4 },
  fieldInput: { paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  captionInput: { minHeight: 80, textAlignVertical: "top" },
  tagsList: { gap: 8, paddingVertical: 4 },
  tagChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  tagChipText: { fontSize: 13, fontWeight: "600" },
  detectedDot: { width: 6, height: 6, borderRadius: 3 },
  detectedHint: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, marginTop: -6 },
  detectedHintText: { fontSize: 11, fontWeight: "500", flex: 1 },
  // Error card
  errorCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  // Review
  reviewCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  reviewLabel: { fontSize: 13 },
  reviewValue: { fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  rightsRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 1 },
  rightsText: { fontSize: 13, lineHeight: 19, flex: 1 },
  // Upload progress
  uploadProgressCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  uploadProgressLabel: { fontSize: 13, fontWeight: "600" },
  uploadProgressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  uploadProgressFill: { height: 6, borderRadius: 3 },
  uploadErrorCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  uploadErrorText: { fontSize: 13, flex: 1 },
  // Shared
  nextBtn: { borderRadius: 16, overflow: "hidden" },
  nextBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  // Guest / success
  guestView: { flex: 1, alignItems: "center", gap: 16, paddingHorizontal: 32 },
  guestTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  guestSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  guestBtn: { width: "100%", borderRadius: 16, overflow: "hidden", marginTop: 8 },
  guestBtnGradient: { paddingVertical: 16, alignItems: "center" },
  guestBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  successView: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  successOverlayText: { alignItems: "center", gap: 10, marginTop: 28, paddingHorizontal: 32 },
  successTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  successSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 21 },
});

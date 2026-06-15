import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { MusicMinute } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";
import {
  fetchSegments,
  fetchLyrics,
  searchTracks,
  type Segment,
  type LyricsResponse,
  type LyricLine,
} from "@/lib/musixmatch";
import { TimingSlider } from "@/components/TimingSlider";

type PerformanceType = "original" | "cover" | "freestyle";

const GENRES = [
  "Pop", "R&B", "Soul", "Rap", "Acoustic", "Indie",
  "Latin Pop", "Arabic Pop", "Singer-Songwriter", "Jazz", "Country", "Gospel",
];
const LANGUAGES = [
  "English", "Arabic", "Spanish", "French", "Portuguese", "Hindi", "Swahili", "Other",
];

interface MusixmatchResult {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name?: string;
  primary_genres?: string;
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

// Internal step layout (1–7). Steps 4 and 5 only apply when cover + song selected.
// Visual dots always show 5 positions:
//   step 1→1, step 2→2, steps 3/4/5→3, step 6→4, step 7→5
function toVisualStep(step: number): number {
  if (step <= 2) return step;
  if (step <= 5) return 3;
  return step - 2; // 6→4, 7→5
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function PostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, postMusicMinute, musicMinutes } = useApp();

  const [step, setStep] = useState(1);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState(0);
  const [performanceType, setPerformanceType] = useState<PerformanceType>("original");

  // Song tagging (step 3)
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<MusixmatchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<MusixmatchResult | null>(null);
  const [isSongSearching, setIsSongSearching] = useState(false);

  // Lyric section (step 4)
  const [sections, setSections] = useState<Segment[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<Segment | null>(null);

  // Timing (step 5)
  const [timingOffsetMs, setTimingOffsetMs] = useState(0);
  // Section lyric previews: first lyric line text per sectionId
  const [sectionPreviews, setSectionPreviews] = useState<Record<string, string>>({});
  // No lyrics mode: user explicitly opted out of lyric overlay
  const [noLyricsMode, setNoLyricsMode] = useState(false);
  // Timing preview state (step 5)
  const [previewLyricsData, setPreviewLyricsData] = useState<LyricsResponse | null>(null);
  const [isPreviewingTiming, setIsPreviewingTiming] = useState(false);
  const [previewPositionMs, setPreviewPositionMs] = useState(0);
  const previewIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Details (step 6)
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [genre, setGenre] = useState("Pop");
  const [language, setLanguage] = useState("English");
  const [location, setLocation] = useState("");

  // Review + posting (step 7)
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Prefill from challenge Join button deep-link
  const { prefillTrackId, prefillSectionId } = useLocalSearchParams<{
    prefillTrackId?: string;
    prefillSectionId?: string;
  }>();
  const prefillAppliedRef = useRef(false);

  // Fetch lyric segments when reaching step 4 with a selected song
  useEffect(() => {
    if (step !== 4 || !selectedSong) return;
    let cancelled = false;
    setSectionsLoading(true);
    setSectionsError(null);
    fetchSegments(selectedSong.track_id).then((result) => {
      if (cancelled) return;
      const segs = result?.segments ?? [];
      setSections(segs);
      setSectionsLoading(false);
      setSelectedSection((prev) => {
        if (prev) return prev;
        if (prefillSectionId) {
          const match = segs.find((s) => s.id === prefillSectionId);
          if (match) return match;
        }
        return null; // no auto-select — user must choose or pick "No lyrics needed"
      });
      if (!result) setSectionsError("Could not load song sections");
      // Fetch first-line lyric preview for each section card
      if (segs.length > 0 && selectedSong) {
        fetchLyrics(selectedSong.track_id).then((lyricsData) => {
          if (cancelled || !lyricsData) return;
          const previews: Record<string, string> = {};
          segs.forEach((seg) => {
            const firstLine = lyricsData.lines.find(
              (l) =>
                l.startMs !== null &&
                l.startMs >= seg.startMs &&
                (seg.endMs >= 999999 || l.startMs < seg.endMs),
            );
            if (firstLine) previews[seg.id] = firstLine.text;
          });
          setSectionPreviews(previews);
        });
      }
    });
    return () => { cancelled = true; };
  }, [step, selectedSong?.track_id]);

  // Debounced song search — fires 600 ms after the user stops typing
  useEffect(() => {
    const query = songQuery.trim();
    if (!query || selectedSong) return;
    const timer = setTimeout(() => {
      handleSongSearch();
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songQuery]);

  // Apply prefill params from challenge Join button
  useEffect(() => {
    if (prefillAppliedRef.current || !prefillTrackId) return;

    // Try local catalogue first (covers demo tracks and well-known IDs)
    const localTrack = MOCK_TRACKS.find((t) => t.track_id === prefillTrackId);
    if (localTrack) {
      prefillAppliedRef.current = true;
      setPerformanceType("cover");
      setSelectedSong(localTrack);
      return;
    }

    // Fetch from API for real Musixmatch track IDs
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return;
    fetch(`https://${domain}/api/musixmatch/track/${encodeURIComponent(prefillTrackId)}`)
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
    // Upload step (1) remains mandatory — do NOT call setStep here
  }, [prefillTrackId]);

  // Fetch lyrics for timing preview when entering step 5
  useEffect(() => {
    if (step !== 5 || !selectedSong) return;
    fetchLyrics(selectedSong.track_id).then((data) => {
      setPreviewLyricsData(data);
    });
  }, [step, selectedSong?.track_id]);

  // Preview timing interval — max 5 s or section duration, steps 250 ms
  useEffect(() => {
    if (!isPreviewingTiming || !selectedSection) {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = null;
      }
      return;
    }
    setPreviewPositionMs(0);
    const maxDuration = Math.min(selectedSection.endMs - selectedSection.startMs, 5000);
    previewIntervalRef.current = setInterval(() => {
      setPreviewPositionMs((p) => {
        const next = p + 250;
        if (next >= maxDuration) {
          setIsPreviewingTiming(false);
          return 0;
        }
        return next;
      });
    }, 250);
    return () => {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = null;
      }
    };
  }, [isPreviewingTiming, selectedSection?.startMs, selectedSection?.endMs]);

  if (!currentUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.guestView, { paddingTop: topPad + 40 }]}>
          <MaterialCommunityIcons name="microphone" size={64} color={colors.primary} />
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>Your Stage Awaits</Text>
          <Text style={[styles.guestSubtitle, { color: colors.mutedForeground }]}>
            Sign up to post your first Music Minute and start your journey.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/sign-up")}
            activeOpacity={0.85}
            style={styles.guestBtn}
          >
            <LinearGradient
              colors={["#A855F7", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.guestBtnGradient}
            >
              <Text style={styles.guestBtnText}>Join StageOne</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (posted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successView}>
          <MaterialCommunityIcons name="microphone" size={80} color={colors.gold} />
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Music Minute Posted!</Text>
          <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
            Your performance is now live in the feed. Time to rise.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setPosted(false);
              setStep(1);
              setVideoUri(null);
              setTitle("");
              setCaption("");
              setSelectedSong(null);
              setSongQuery("");
              setSections([]);
              setSelectedSection(null);
              setTimingOffsetMs(0);
              setRightsConfirmed(false);
              router.push("/");
            }}
            activeOpacity={0.85}
            style={styles.guestBtn}
          >
            <LinearGradient
              colors={["#A855F7", "#EC4899", "#F59E0B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.guestBtnGradient}
            >
              <Text style={styles.guestBtnText}>View in Feed</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ----- Navigation helpers -----

  function goBack(): void {
    if (step === 7) { setStep(6); return; }
    if (step === 6) {
      if (performanceType === "cover" && selectedSong && selectedSection) { setStep(5); return; }
      if (performanceType === "cover" && selectedSong) { setStep(4); return; }
      if (performanceType === "cover") { setStep(3); return; }
      setStep(2); return;
    }
    if (step === 5) { setStep(4); return; }
    if (step === 4) { setStep(3); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 2) { setStep(1); return; }
  }

  // ----- Media helpers -----

  const handlePickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library to upload a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if ((asset.duration ?? 0) > 61000) {
        Alert.alert("Too long", "Please select a video under 60 seconds.");
        return;
      }
      setVideoUri(asset.uri);
      setVideoDurationSec(Math.round((asset.duration ?? 0) / 1000));
    }
  };

  const handleRecordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access to record a video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setVideoUri(asset.uri);
      setVideoDurationSec(Math.round((asset.duration ?? 0) / 1000));
    }
  };

  const handleSongSearch = async () => {
    const query = songQuery.trim();
    if (!query) return;
    setIsSongSearching(true);
    try {
      const tracks = await searchTracks(query);
      setSongResults(
        tracks.length > 0
          ? tracks
          : MOCK_TRACKS.filter(
              (t) =>
                t.track_name.toLowerCase().includes(query.toLowerCase()) ||
                t.artist_name.toLowerCase().includes(query.toLowerCase()),
            ),
      );
    } catch {
      setSongResults(
        MOCK_TRACKS.filter(
          (t) =>
            t.track_name.toLowerCase().includes(query.toLowerCase()) ||
            t.artist_name.toLowerCase().includes(query.toLowerCase()),
        ),
      );
    }
    setIsSongSearching(false);
  };

  const handlePost = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please add a title for your Music Minute.");
      return;
    }
    if (!rightsConfirmed) {
      Alert.alert("Rights confirmation required", "Please confirm your rights before posting.");
      return;
    }
    setIsPosting(true);
    await new Promise((r) => setTimeout(r, 800));

    const imageIndex = musicMinutes.length % 3;
    const mm: Omit<
      MusicMinute,
      | "id"
      | "views"
      | "likesCount"
      | "commentsCount"
      | "sharesCount"
      | "savesCount"
      | "goldenMicsCount"
      | "createdAt"
      | "isRisingVoice"
      | "isFeatured"
    > = {
      userId: currentUser.id,
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
      videoUri: videoUri ?? undefined,
      lyricSection:
        performanceType === "cover" && selectedSong && selectedSection
          ? {
              sectionId: selectedSection.id,
              sectionLabel: selectedSection.label,
              trackId: selectedSong.track_id,
              startMs: selectedSection.startMs,
              endMs: selectedSection.endMs,
              lineCount: selectedSection.lineCount,
              timingOffsetMs,
              language: "en",
            }
          : undefined,
    };

    postMusicMinute(mm);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsPosting(false);
    setPosted(true);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const visualStep = toVisualStep(step);

  // Active line during timing preview (step 5)
  const previewActiveLine: LyricLine | null = (() => {
    if (!isPreviewingTiming || !previewLyricsData || !selectedSection) return null;
    const lines = previewLyricsData.lines;
    if (!previewLyricsData.hasSync && lines.length > 0) {
      const sectionDuration = selectedSection.endMs - selectedSection.startMs;
      if (sectionDuration <= 0) return null;
      const msPerLine = sectionDuration / lines.length;
      const idx = Math.min(
        Math.floor((previewPositionMs + timingOffsetMs) / msPerLine),
        lines.length - 1,
      );
      return lines[idx] ?? null;
    }
    const absMs = previewPositionMs + selectedSection.startMs + timingOffsetMs;
    return (
      lines.find(
        (l) => l.startMs !== null && l.endMs !== null && absMs >= l.startMs! && absMs < l.endMs!,
      ) ?? null
    );
  })();

  const StepIndicator = () => (
    <View style={styles.stepRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <View
          key={s}
          style={[
            styles.stepDot,
            { backgroundColor: s <= visualStep ? colors.primary : colors.border },
          ]}
        />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[styles.postHeader, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={step > 1 ? goBack : () => {}} activeOpacity={0.7}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={step > 1 ? colors.foreground : "transparent"}
          />
        </TouchableOpacity>
        <Text style={[styles.postTitle, { color: colors.foreground }]}>Post a Music Minute</Text>
        <View style={{ width: 24 }} />
      </View>

      <StepIndicator />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.stepContent}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Step 1: Video ── */}
          {step === 1 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                1. Record or Upload Your Video
              </Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                60-second limit · Good lighting and clear audio help you stand out.
              </Text>

              {videoUri ? (
                <View style={styles.videoPreviewContainer}>
                  <Video
                    source={{ uri: videoUri }}
                    style={styles.videoPreview}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isLooping
                    isMuted={false}
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(5,2,10,0.7)"]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.videoMeta}>
                    <Ionicons name="videocam" size={16} color="#fff" />
                    <Text style={styles.videoDuration}>{formatDuration(videoDurationSec)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.changeVideoBtn}
                    onPress={handlePickVideo}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.changeVideoBtnText, { color: colors.primary }]}>
                      Change video
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadOptions}>
                  <TouchableOpacity
                    style={[
                      styles.uploadOption,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    activeOpacity={0.8}
                    onPress={handleRecordVideo}
                  >
                    <Ionicons name="videocam" size={32} color={colors.primary} />
                    <Text style={[styles.uploadOptionTitle, { color: colors.foreground }]}>
                      Record Video
                    </Text>
                    <Text style={[styles.uploadOptionSub, { color: colors.mutedForeground }]}>
                      60 sec
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.uploadOption,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    activeOpacity={0.8}
                    onPress={handlePickVideo}
                  >
                    <Ionicons name="cloud-upload-outline" size={32} color={colors.primary} />
                    <Text style={[styles.uploadOptionTitle, { color: colors.foreground }]}>
                      Upload Video
                    </Text>
                    <Text style={[styles.uploadOptionSub, { color: colors.mutedForeground }]}>
                      From library
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={() => setStep(2)}
                style={[styles.nextBtn, !videoUri && { opacity: 0.5 }]}
                activeOpacity={0.85}
                disabled={!videoUri}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>
                    {videoUri ? "Continue" : "Select a video first"}
                  </Text>
                  {videoUri && <Ionicons name="chevron-forward" size={18} color="#fff" />}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 2: Performance Type ── */}
          {step === 2 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                2. What kind of performance is this?
              </Text>
              {(["original", "cover", "freestyle"] as PerformanceType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => {
                    setPerformanceType(type);
                    Haptics.selectionAsync();
                  }}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor:
                        performanceType === type ? `${colors.primary}20` : colors.card,
                      borderColor: performanceType === type ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={
                      type === "original" ? "musical-notes" : type === "cover" ? "copy" : "mic"
                    }
                    size={22}
                    color={performanceType === type ? colors.primary : colors.mutedForeground}
                  />
                  <View style={styles.typeOptionText}>
                    <Text
                      style={[
                        styles.typeTitle,
                        {
                          color:
                            performanceType === type ? colors.primary : colors.foreground,
                        },
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                    <Text style={[styles.typeSub, { color: colors.mutedForeground }]}>
                      {type === "original"
                        ? "Your own composition"
                        : type === "cover"
                          ? "Someone else's song"
                          : "Improvised performance"}
                    </Text>
                  </View>
                  {performanceType === type && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setStep(performanceType === "cover" ? 3 : 6)}
                style={styles.nextBtn}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>Continue</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 3: Song Tagging (cover only) ── */}
          {step === 3 && performanceType === "cover" && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>3. Tag the Song</Text>
              <View
                style={[
                  styles.musixmatchBadge,
                  {
                    backgroundColor: `${colors.primary}15`,
                    borderColor: `${colors.primary}30`,
                  },
                ]}
              >
                <Ionicons name="musical-note" size={14} color={colors.primary} />
                <Text style={[styles.musixmatchText, { color: colors.primary }]}>
                  Powered by Musixmatch
                </Text>
              </View>
              <View
                style={[
                  styles.songSearchBar,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Ionicons name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  value={songQuery}
                  onChangeText={setSongQuery}
                  placeholder="Search song title or artist"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.songSearchInput, { color: colors.foreground }]}
                  returnKeyType="search"
                  onSubmitEditing={handleSongSearch}
                />
                <TouchableOpacity onPress={handleSongSearch} activeOpacity={0.7}>
                  {isSongSearching ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.searchBtn, { color: colors.primary }]}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>
              {selectedSong && (
                <View
                  style={[
                    styles.selectedSong,
                    {
                      backgroundColor: `${colors.primary}15`,
                      borderColor: `${colors.primary}40`,
                    },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  <View style={styles.selectedSongInfo}>
                    <Text style={[styles.selectedSongTitle, { color: colors.foreground }]}>
                      {selectedSong.track_name}
                    </Text>
                    <Text style={[styles.selectedSongArtist, { color: colors.mutedForeground }]}>
                      {selectedSong.artist_name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedSong(null);
                      setSelectedSection(null);
                      setSections([]);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              )}
              {songResults.length > 0 && !selectedSong && (
                <View style={[styles.songResultsList, { borderColor: colors.border }]}>
                  {songResults.map((track) => (
                    <TouchableOpacity
                      key={track.track_id}
                      onPress={() => {
                        setSelectedSong(track);
                        setSongResults([]);
                        setSelectedSection(null);
                        setSections([]);
                      }}
                      style={[styles.songResultRow, { borderBottomColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="musical-notes" size={16} color={colors.primary} />
                      <View style={styles.songResultInfo}>
                        <Text
                          style={[styles.songResultTitle, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {track.track_name}
                        </Text>
                        <Text
                          style={[styles.songResultArtist, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {track.artist_name}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity
                onPress={() => setStep(selectedSong ? 4 : 6)}
                style={[styles.nextBtn, { marginTop: 16 }]}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>
                    {selectedSong ? "Choose Lyric Section" : "Skip"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 4: Choose Lyric Section (cover + song only) ── */}
          {step === 4 && performanceType === "cover" && selectedSong && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                3.5 — Choose a Lyric Section
              </Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                Pick the part of the song you performed. Viewers will see synced lyrics as your video plays.
              </Text>

              <View
                style={[
                  styles.songRefCard,
                  { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` },
                ]}
              >
                <Ionicons name="musical-notes" size={16} color={colors.primary} />
                <Text style={[styles.songRefTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedSong.track_name}
                </Text>
                <Text style={[styles.songRefArtist, { color: colors.mutedForeground }]}>
                  {selectedSong.artist_name}
                </Text>
              </View>

              {sectionsLoading && (
                <View style={styles.centeredRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                    Loading sections…
                  </Text>
                </View>
              )}

              {sectionsError && !sectionsLoading && (
                <View
                  style={[
                    styles.errorCard,
                    { backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" },
                  ]}
                >
                  <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                  <Text style={[styles.stepHint, { color: "#EF4444" }]}>
                    {sectionsError} — using Full Track.
                  </Text>
                </View>
              )}

              {/* "No lyrics needed" skip option — always visible */}
              {!sectionsLoading && (
                <TouchableOpacity
                  onPress={() => {
                    setNoLyricsMode(true);
                    setSelectedSection(null);
                  }}
                  style={[
                    styles.sectionCard,
                    {
                      backgroundColor: noLyricsMode
                        ? `${colors.muted}60`
                        : colors.card,
                      borderColor: noLyricsMode ? colors.mutedForeground : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={noLyricsMode ? colors.mutedForeground : colors.foreground}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: noLyricsMode ? colors.mutedForeground : colors.foreground },
                      ]}
                    >
                      No lyrics needed
                    </Text>
                    <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                      Post without lyric overlay
                    </Text>
                  </View>
                  {noLyricsMode && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.mutedForeground} />
                  )}
                </TouchableOpacity>
              )}

              {/* Section cards from Musixmatch */}
              {!sectionsLoading &&
                sections.map((seg) => (
                  <TouchableOpacity
                    key={seg.id}
                    onPress={() => {
                      setSelectedSection(seg);
                      setNoLyricsMode(false);
                    }}
                    style={[
                      styles.sectionCard,
                      {
                        backgroundColor:
                          selectedSection?.id === seg.id
                            ? `${colors.primary}18`
                            : colors.card,
                        borderColor:
                          selectedSection?.id === seg.id
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.sectionLabel,
                          {
                            color:
                              selectedSection?.id === seg.id
                                ? colors.primary
                                : colors.foreground,
                          },
                        ]}
                      >
                        {seg.label}
                      </Text>
                      <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                        {fmtMs(seg.startMs)} – {seg.endMs >= 999999 ? "end" : fmtMs(seg.endMs)}
                        {seg.lineCount > 0 ? ` · ${seg.lineCount} lines` : ""}
                      </Text>
                      {sectionPreviews[seg.id] ? (
                        <Text
                          style={[styles.sectionPreview, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          "{sectionPreviews[seg.id]}"
                        </Text>
                      ) : null}
                    </View>
                    {selectedSection?.id === seg.id && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}

              <TouchableOpacity
                onPress={() => {
                  if (noLyricsMode) {
                    setStep(6);
                  } else {
                    setStep(5);
                  }
                }}
                style={[
                  styles.nextBtn,
                  !selectedSection && !noLyricsMode && { opacity: 0.5 },
                ]}
                disabled={!selectedSection && !noLyricsMode}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>
                    {noLyricsMode ? "Continue without Lyrics" : "Fine-Tune Timing"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 5: Timing Adjustment (cover + song + section) ── */}
          {step === 5 && performanceType === "cover" && selectedSong && selectedSection && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                3.6 — Fine-Tune Timing
              </Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                If the lyrics appear slightly early or late compared to your singing, adjust the offset below. Leave at 0 if it feels right.
              </Text>

              <View
                style={[
                  styles.timingCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.timingSection}>
                  <Ionicons name="musical-note" size={16} color={colors.primary} />
                  <Text style={[styles.timingSectionLabel, { color: colors.foreground }]}>
                    {selectedSection.label}
                  </Text>
                </View>
                <Text style={[styles.timingSectionMeta, { color: colors.mutedForeground }]}>
                  {fmtMs(selectedSection.startMs)} –{" "}
                  {selectedSection.endMs >= 999999 ? "end" : fmtMs(selectedSection.endMs)}
                  {selectedSection.lineCount > 0
                    ? ` · ${selectedSection.lineCount} lines`
                    : ""}
                </Text>
              </View>

              <Text style={[styles.sliderLabel, { color: colors.mutedForeground }]}>
                Shift lyrics earlier / later
              </Text>

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

              {/* Preview timing button */}
              <TouchableOpacity
                onPress={() => setIsPreviewingTiming((v) => !v)}
                style={[
                  styles.previewBtn,
                  { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` },
                ]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={isPreviewingTiming ? "stop-circle-outline" : "play-circle-outline"}
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.offsetBtnText, { color: colors.primary }]}>
                  {isPreviewingTiming ? "Stop Preview" : "Preview Timing (5 s)"}
                </Text>
              </TouchableOpacity>

              {/* Live lyric line during preview */}
              {isPreviewingTiming && (
                <View
                  style={[
                    styles.previewLineBox,
                    {
                      borderColor: `${colors.primary}30`,
                      backgroundColor: `${colors.primary}08`,
                    },
                  ]}
                >
                  {previewLyricsData ? (
                    previewActiveLine ? (
                      <Text style={[styles.previewActiveLine, { color: colors.foreground }]}>
                        {previewActiveLine.text}
                      </Text>
                    ) : (
                      <Text style={[styles.offsetHint, { color: colors.mutedForeground }]}>
                        ♪ waiting for lyric line…
                      </Text>
                    )
                  ) : (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                </View>
              )}

              {/* Static lyric line list — shows fetched lines for the chosen section */}
              {previewLyricsData && previewLyricsData.lines.length > 0 && selectedSection && (
                <View
                  style={[
                    styles.lyricLineList,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={[styles.lyricLineListTitle, { color: colors.mutedForeground }]}>
                    Section lyrics
                  </Text>
                  {previewLyricsData.lines
                    .filter(
                      (l) =>
                        l.startMs === null ||
                        (l.startMs >= selectedSection.startMs &&
                          (selectedSection.endMs >= 999_999 ||
                            l.startMs < selectedSection.endMs)),
                    )
                    .map((l, idx) => (
                      <View
                        key={idx}
                        style={[styles.lyricLineRow, { borderTopColor: colors.border }]}
                      >
                        <Text style={[styles.lyricLineText, { color: colors.foreground }]}>
                          {l.text}
                        </Text>
                        {l.startMs !== null && (
                          <Text style={[styles.lyricLineTime, { color: colors.mutedForeground }]}>
                            {fmtMs(l.startMs)}
                          </Text>
                        )}
                      </View>
                    ))}
                </View>
              )}

              <TouchableOpacity
                onPress={() => setStep(6)}
                style={styles.nextBtn}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>Add Details</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 6: Details ── */}
          {step === 6 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>4. Add Details</Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Give your performance a title"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.fieldInput,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                maxLength={100}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Caption</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Tell your story... #hashtags"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.fieldInput,
                  styles.captionInput,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                multiline
                maxLength={280}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Genre</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagsList}
              >
                {GENRES.map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGenre(g)}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: genre === g ? colors.primary : colors.muted,
                        borderColor: genre === g ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.tagChipText,
                        { color: genre === g ? "#fff" : colors.mutedForeground },
                      ]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Language</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagsList}
              >
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => setLanguage(l)}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: language === l ? colors.primary : colors.muted,
                        borderColor: language === l ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.tagChipText,
                        { color: language === l ? "#fff" : colors.mutedForeground },
                      ]}
                    >
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="City, Country (optional)"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.fieldInput,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              <TouchableOpacity onPress={() => setStep(7)} style={styles.nextBtn} activeOpacity={0.85}>
                <LinearGradient
                  colors={["#A855F7", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>Review</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 7: Review ── */}
          {step === 7 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>5. Review and Post</Text>
              <View
                style={[
                  styles.reviewCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <ReviewRow label="Title" value={title || "—"} colors={colors} />
                <ReviewRow label="Type" value={performanceType} colors={colors} />
                <ReviewRow label="Genre" value={genre} colors={colors} />
                <ReviewRow label="Language" value={language} colors={colors} />
                <ReviewRow
                  label="Video"
                  value={videoUri ? `${formatDuration(videoDurationSec)} recorded` : "No video"}
                  colors={colors}
                />
                {selectedSong && (
                  <ReviewRow
                    label="Song"
                    value={`${selectedSong.track_name} — ${selectedSong.artist_name}`}
                    colors={colors}
                  />
                )}
                {selectedSection && (
                  <ReviewRow label="Section" value={selectedSection.label} colors={colors} />
                )}
                {selectedSection && timingOffsetMs !== 0 && (
                  <ReviewRow
                    label="Timing offset"
                    value={`${timingOffsetMs > 0 ? "+" : ""}${timingOffsetMs} ms`}
                    colors={colors}
                  />
                )}
                {location && <ReviewRow label="Location" value={location} colors={colors} />}
              </View>
              <TouchableOpacity
                onPress={() => setRightsConfirmed(!rightsConfirmed)}
                style={styles.rightsRow}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: rightsConfirmed ? colors.primary : colors.border,
                      backgroundColor: rightsConfirmed ? colors.primary : "transparent",
                    },
                  ]}
                >
                  {rightsConfirmed && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.rightsText, { color: colors.mutedForeground }]}>
                  I confirm this is my performance and I have the right to upload it.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePost}
                disabled={isPosting || !rightsConfirmed}
                style={[styles.nextBtn, !rightsConfirmed && { opacity: 0.5 }]}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899", "#F59E0B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
                  <Text style={styles.nextBtnText}>
                    {isPosting ? "Posting..." : "Post Music Minute"}
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

function ReviewRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: colors.foreground }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  postHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  postTitle: { fontSize: 17, fontWeight: "700" },
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  stepDot: { width: 6, height: 6, borderRadius: 3 },
  stepContent: { flex: 1 },
  stepView: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  stepLabel: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  stepHint: { fontSize: 13, lineHeight: 18, marginTop: -8 },
  uploadOptions: { flexDirection: "row", gap: 12 },
  uploadOption: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  uploadOptionTitle: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  uploadOptionSub: { fontSize: 12, textAlign: "center" },
  videoPreviewContainer: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  videoPreview: { width: "100%", height: "100%" },
  videoMeta: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  videoDuration: { color: "#fff", fontSize: 13, fontWeight: "700" },
  changeVideoBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(5,2,10,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  changeVideoBtnText: { fontSize: 13, fontWeight: "600" },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  typeOptionText: { flex: 1 },
  typeTitle: { fontSize: 15, fontWeight: "700" },
  typeSub: { fontSize: 12, marginTop: 2 },
  musixmatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  musixmatchText: { fontSize: 12, fontWeight: "600" },
  songSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  songSearchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  searchBtn: { fontSize: 14, fontWeight: "700" },
  selectedSong: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedSongInfo: { flex: 1 },
  selectedSongTitle: { fontSize: 14, fontWeight: "700" },
  selectedSongArtist: { fontSize: 12, marginTop: 2 },
  songResultsList: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  songResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
  },
  songResultInfo: { flex: 1 },
  songResultTitle: { fontSize: 14, fontWeight: "600" },
  songResultArtist: { fontSize: 12, marginTop: 2 },
  // Section selection (step 4)
  songRefCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  songRefTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  songRefArtist: { fontSize: 12 },
  centeredRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 12,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  sectionLabel: { fontSize: 15, fontWeight: "700" },
  sectionMeta: { fontSize: 12, marginTop: 3 },
  sectionPreview: { fontSize: 11, marginTop: 4, fontStyle: "italic" },
  // Timing (step 5)
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  previewLineBox: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  previewActiveLine: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 24,
  },
  timingCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  timingSection: { flexDirection: "row", alignItems: "center", gap: 8 },
  timingSectionLabel: { fontSize: 15, fontWeight: "700" },
  timingSectionMeta: { fontSize: 12 },
  offsetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offsetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  offsetBtnText: { fontSize: 13, fontWeight: "700" },
  offsetDisplay: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  offsetValue: { fontSize: 20, fontWeight: "800" },
  offsetReset: { fontSize: 12, fontWeight: "600" },
  offsetHint: { fontSize: 12, textAlign: "center" },
  // Details (step 6)
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: -4 },
  fieldInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
  captionInput: { minHeight: 80, textAlignVertical: "top" },
  tagsList: { gap: 8, paddingVertical: 4 },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagChipText: { fontSize: 13, fontWeight: "600" },
  // Review (step 7)
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  reviewLabel: { fontSize: 13 },
  reviewValue: { fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  rightsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  rightsText: { fontSize: 13, lineHeight: 19, flex: 1 },
  // Shared
  nextBtn: { borderRadius: 16, overflow: "hidden" },
  nextBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  // Guest / success views
  guestView: { flex: 1, alignItems: "center", gap: 16, paddingHorizontal: 32 },
  guestTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  guestSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  guestBtn: { width: "100%", borderRadius: 16, overflow: "hidden", marginTop: 8 },
  guestBtnGradient: { paddingVertical: 16, alignItems: "center" },
  guestBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  successView: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  successTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  successSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  // Step 5 — timing slider
  sliderLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  lyricLineList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
  },
  lyricLineListTitle: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  lyricLineRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  lyricLineText: { fontSize: 13, flex: 1, lineHeight: 18 },
  lyricLineTime: { fontSize: 11, marginLeft: 8 },
});

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
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

type PerformanceType = "original" | "cover" | "freestyle";

const GENRES = ["Pop", "R&B", "Soul", "Rap", "Acoustic", "Indie", "Latin Pop", "Arabic Pop", "Singer-Songwriter", "Jazz", "Country", "Gospel"];
const LANGUAGES = ["English", "Arabic", "Spanish", "French", "Portuguese", "Hindi", "Swahili", "Other"];

interface MusixmatchResult {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name?: string;
  primary_genres?: string;
}

const MOCK_TRACKS: MusixmatchResult[] = [
  { track_id: "12345", track_name: "Golden Hour", artist_name: "JVKE", album_name: "this is what falling in love feels like" },
  { track_id: "67890", track_name: "Fix You", artist_name: "Coldplay", album_name: "X&Y" },
  { track_id: "11111", track_name: "Starlight", artist_name: "Taylor Swift", album_name: "Taylor Swift" },
  { track_id: "22222", track_name: "Blinding Lights", artist_name: "The Weeknd", album_name: "After Hours" },
  { track_id: "33333", track_name: "Someone Like You", artist_name: "Adele", album_name: "21" },
  { track_id: "44444", track_name: "Shallow", artist_name: "Lady Gaga & Bradley Cooper", album_name: "A Star Is Born" },
  { track_id: "55555", track_name: "Perfect", artist_name: "Ed Sheeran", album_name: "Divide" },
];

export default function PostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, postMusicMinute, musicMinutes } = useApp();

  const [step, setStep] = useState(1);
  const [performanceType, setPerformanceType] = useState<PerformanceType>("original");
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<MusixmatchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<MusixmatchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [genre, setGenre] = useState("Pop");
  const [language, setLanguage] = useState("English");
  const [location, setLocation] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
            onPress={() => router.push("/onboarding")}
            activeOpacity={0.85}
            style={styles.guestBtn}
          >
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.guestBtnGradient}>
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
              setTitle(""); setCaption(""); setSelectedSong(null);
              setRightsConfirmed(false); setSongQuery("");
              router.push("/(tabs)/index");
            }}
            activeOpacity={0.85}
            style={styles.guestBtn}
          >
            <LinearGradient colors={["#A855F7", "#EC4899", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.guestBtnGradient}>
              <Text style={styles.guestBtnText}>View in Feed</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleSongSearch = async () => {
    if (!songQuery.trim()) return;
    setIsSearching(true);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const url = domain
        ? `https://${domain}/api/musixmatch/search?q=${encodeURIComponent(songQuery)}`
        : null;
      if (url) {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setSongResults(data.tracks ?? MOCK_TRACKS.filter((t) =>
            t.track_name.toLowerCase().includes(songQuery.toLowerCase()) ||
            t.artist_name.toLowerCase().includes(songQuery.toLowerCase())
          ));
          return;
        }
      }
    } catch {}
    setSongResults(
      MOCK_TRACKS.filter(
        (t) =>
          t.track_name.toLowerCase().includes(songQuery.toLowerCase()) ||
          t.artist_name.toLowerCase().includes(songQuery.toLowerCase())
      )
    );
    setIsSearching(false);
    setIsSearching(false);
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
    await new Promise((r) => setTimeout(r, 1200));

    const imageIndex = musicMinutes.length % 3;
    const mm: Omit<MusicMinute, "id" | "views" | "likesCount" | "commentsCount" | "sharesCount" | "savesCount" | "goldenMicsCount" | "createdAt" | "isRisingVoice" | "isFeatured"> = {
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
    };

    postMusicMinute(mm);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsPosting(false);
    setPosted(true);
  };

  const StepIndicator = () => (
    <View style={styles.stepRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <View key={s} style={[styles.stepDot, { backgroundColor: s <= step ? colors.primary : colors.border }]} />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.postHeader, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={step > 1 ? () => setStep(step - 1) : () => {}} activeOpacity={0.7}>
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
          {step === 1 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                1. Record or Upload Your Video
              </Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                60-second limit · Good lighting and clear audio help you stand out.
              </Text>
              <View style={styles.uploadOptions}>
                <TouchableOpacity style={[styles.uploadOption, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.8}>
                  <Ionicons name="videocam" size={32} color={colors.primary} />
                  <Text style={[styles.uploadOptionTitle, { color: colors.foreground }]}>Record Video</Text>
                  <Text style={[styles.uploadOptionSub, { color: colors.mutedForeground }]}>60 sec</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.uploadOption, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.8}>
                  <Ionicons name="cloud-upload-outline" size={32} color={colors.primary} />
                  <Text style={[styles.uploadOptionTitle, { color: colors.foreground }]}>Upload Video</Text>
                  <Text style={[styles.uploadOptionSub, { color: colors.mutedForeground }]}>Max 60 sec</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.timeBar, { backgroundColor: colors.muted }]}>
                <View style={[styles.timeBarFill, { backgroundColor: colors.primary, width: "0%" }]} />
              </View>
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>00:00 / 60:00</Text>
              <TouchableOpacity onPress={() => setStep(2)} style={styles.nextBtn} activeOpacity={0.85}>
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>Continue</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                2. What kind of performance is this?
              </Text>
              {(["original", "cover", "freestyle"] as PerformanceType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => { setPerformanceType(type); Haptics.selectionAsync(); }}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor: performanceType === type ? `${colors.primary}20` : colors.card,
                      borderColor: performanceType === type ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={type === "original" ? "musical-notes" : type === "cover" ? "copy" : "mic"}
                    size={22}
                    color={performanceType === type ? colors.primary : colors.mutedForeground}
                  />
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
              <TouchableOpacity onPress={() => setStep(performanceType === "cover" ? 3 : 4)} style={styles.nextBtn} activeOpacity={0.85}>
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>Continue</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && performanceType === "cover" && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>
                3. Tag the Song
              </Text>
              <View style={[styles.musixmatchBadge, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                <Ionicons name="musical-note" size={14} color={colors.primary} />
                <Text style={[styles.musixmatchText, { color: colors.primary }]}>Powered by Musixmatch</Text>
              </View>
              <View style={[styles.songSearchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  value={songQuery}
                  onChangeText={setSongQuery}
                  placeholder="Search song title, artist, or lyrics"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.songSearchInput, { color: colors.foreground }]}
                  returnKeyType="search"
                  onSubmitEditing={handleSongSearch}
                />
                <TouchableOpacity onPress={handleSongSearch} activeOpacity={0.7}>
                  <Text style={[styles.searchBtn, { color: colors.primary }]}>Search</Text>
                </TouchableOpacity>
              </View>
              {selectedSong && (
                <View style={[styles.selectedSong, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}40` }]}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  <View style={styles.selectedSongInfo}>
                    <Text style={[styles.selectedSongTitle, { color: colors.foreground }]}>{selectedSong.track_name}</Text>
                    <Text style={[styles.selectedSongArtist, { color: colors.mutedForeground }]}>{selectedSong.artist_name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedSong(null)} activeOpacity={0.7}>
                    <Ionicons name="close" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              )}
              {songResults.length > 0 && !selectedSong && (
                <View style={[styles.songResultsList, { borderColor: colors.border }]}>
                  {songResults.map((track) => (
                    <TouchableOpacity
                      key={track.track_id}
                      onPress={() => { setSelectedSong(track); setSongResults([]); }}
                      style={[styles.songResultRow, { borderBottomColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="musical-notes" size={16} color={colors.primary} />
                      <View style={styles.songResultInfo}>
                        <Text style={[styles.songResultTitle, { color: colors.foreground }]} numberOfLines={1}>{track.track_name}</Text>
                        <Text style={[styles.songResultArtist, { color: colors.mutedForeground }]} numberOfLines={1}>{track.artist_name}</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity onPress={() => setStep(4)} style={[styles.nextBtn, { marginTop: 16 }]} activeOpacity={0.85}>
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>{selectedSong ? "Continue" : "Skip"}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>4. Add Details</Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title / Caption *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Give your performance a title"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                maxLength={100}
              />
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
                  <TouchableOpacity key={g} onPress={() => setGenre(g)} style={[styles.tagChip, { backgroundColor: genre === g ? colors.primary : colors.muted, borderColor: genre === g ? colors.primary : colors.border }]} activeOpacity={0.8}>
                    <Text style={[styles.tagChipText, { color: genre === g ? "#fff" : colors.mutedForeground }]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Language</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsList}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity key={l} onPress={() => setLanguage(l)} style={[styles.tagChip, { backgroundColor: language === l ? colors.primary : colors.muted, borderColor: language === l ? colors.primary : colors.border }]} activeOpacity={0.8}>
                    <Text style={[styles.tagChipText, { color: language === l ? "#fff" : colors.mutedForeground }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="City, Country (optional)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              />
              <TouchableOpacity onPress={() => setStep(5)} style={styles.nextBtn} activeOpacity={0.85}>
                <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
                  <Text style={styles.nextBtnText}>Review</Text>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {step === 5 && (
            <View style={styles.stepView}>
              <Text style={[styles.stepLabel, { color: colors.foreground }]}>5. Review and Post</Text>
              <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ReviewRow label="Title" value={title || "—"} colors={colors} />
                <ReviewRow label="Type" value={performanceType} colors={colors} />
                <ReviewRow label="Genre" value={genre} colors={colors} />
                <ReviewRow label="Language" value={language} colors={colors} />
                {selectedSong && <ReviewRow label="Song" value={`${selectedSong.track_name} — ${selectedSong.artist_name}`} colors={colors} />}
                {location && <ReviewRow label="Location" value={location} colors={colors} />}
              </View>
              <TouchableOpacity onPress={() => setRightsConfirmed(!rightsConfirmed)} style={styles.rightsRow} activeOpacity={0.8}>
                <View style={[styles.checkbox, { borderColor: rightsConfirmed ? colors.primary : colors.border, backgroundColor: rightsConfirmed ? colors.primary : "transparent" }]}>
                  {rightsConfirmed && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.rightsText, { color: colors.mutedForeground }]}>
                  I confirm this is my performance and I have the right to upload it. If this is a cover, I understand StageOne is using Musixmatch only to identify the song for demo context.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePost} disabled={isPosting || !rightsConfirmed} style={[styles.nextBtn, !rightsConfirmed && { opacity: 0.5 }]} activeOpacity={0.85}>
                <LinearGradient
                  colors={["#A855F7", "#EC4899", "#F59E0B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
                  <Text style={styles.nextBtnText}>{isPosting ? "Posting..." : "Post Music Minute"}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ReviewRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
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
  stepView: { paddingHorizontal: 20, gap: 14, paddingTop: 8 },
  stepLabel: { fontSize: 17, fontWeight: "700" },
  stepHint: { fontSize: 13, lineHeight: 18 },
  uploadOptions: { flexDirection: "row", gap: 12 },
  uploadOption: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  uploadOptionTitle: { fontSize: 14, fontWeight: "700" },
  uploadOptionSub: { fontSize: 12 },
  timeBar: { height: 4, borderRadius: 2 },
  timeBarFill: { height: 4, borderRadius: 2 },
  timeText: { fontSize: 12, textAlign: "center" },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  typeOptionText: { flex: 1, gap: 3 },
  typeTitle: { fontSize: 15, fontWeight: "700" },
  typeSub: { fontSize: 12 },
  musixmatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  musixmatchText: { fontSize: 12, fontWeight: "600" },
  songSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  songSearchInput: { flex: 1, fontSize: 14 },
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
  selectedSongArtist: { fontSize: 12 },
  songResultsList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  songResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
  },
  songResultInfo: { flex: 1 },
  songResultTitle: { fontSize: 14, fontWeight: "600" },
  songResultArtist: { fontSize: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  fieldInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
  },
  captionInput: { height: 80, textAlignVertical: "top" },
  tagsList: { gap: 8, paddingVertical: 4 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagChipText: { fontSize: 13, fontWeight: "600" },
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 12,
    borderBottomWidth: 1,
  },
  reviewLabel: { fontSize: 12, fontWeight: "600", width: 72 },
  reviewValue: { fontSize: 13, flex: 1, textAlign: "right" },
  rightsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  rightsText: { fontSize: 12, lineHeight: 17, flex: 1 },
  nextBtn: { marginTop: 8 },
  nextBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  guestView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  guestTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  guestSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  guestBtn: { width: "100%", borderRadius: 16, overflow: "hidden" },
  guestBtnGradient: { paddingVertical: 15, alignItems: "center" },
  guestBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  successView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  successTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  successSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});

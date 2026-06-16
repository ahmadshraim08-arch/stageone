import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useApp } from "@/context/AppContext";
import { MusicMinute, formatCount, getUserById, SEED_CHALLENGES } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";
import {
  fetchLyrics,
  fetchTranslation,
  probeAvailableTranslations,
  type LyricsResponse,
  type LyricLine,
} from "@/lib/musixmatch";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

const LANG_LABELS: Record<string, string> = {
  en: "EN",
  es: "ES",
  ar: "AR",
  fr: "FR",
  pt: "PT",
};

interface Props {
  item: MusicMinute;
  onCommentPress: (id: string) => void;
  onGoldenMicPress: (id: string) => void;
}

function ActionButton({
  icon,
  count,
  onPress,
  color,
  active,
  activeColor,
  scale,
}: {
  icon: React.ReactNode;
  count?: number | string;
  onPress: () => void;
  color: string;
  active?: boolean;
  activeColor?: string;
  scale?: Animated.Value;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionButton} activeOpacity={0.7}>
      <Animated.View style={scale ? { transform: [{ scale }] } : undefined}>
        {icon}
      </Animated.View>
      {count !== undefined && (
        <Text
          style={[
            styles.actionCount,
            active && activeColor ? { color: activeColor } : { color },
          ]}
        >
          {typeof count === "number" ? formatCount(count) : count}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function MusicMinuteCard({ item, onCommentPress, onGoldenMicPress }: Props) {
  const colors = useColors();
  const { height: screenHeight } = useWindowDimensions();
  const { likedIds, savedIds, goldenMicsSent, toggleLike, toggleSave, currentUser } = useApp();

  const isLiked = likedIds.has(item.id);
  const isSaved = savedIds.has(item.id);
  const gmSent = goldenMicsSent[item.id] ?? 0;

  const likeScale = useRef(new Animated.Value(1)).current;
  const gmScale = useRef(new Animated.Value(1)).current;

  const [localLikes, setLocalLikes] = useState(item.likesCount);
  const [localGMs, setLocalGMs] = useState(item.goldenMicsCount);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<Video>(null);

  // Lyric overlay state
  const [lyricVisible, setLyricVisible] = useState(false);
  const [lyrics, setLyrics] = useState<LyricsResponse | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricError, setLyricError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState("en");
  const [availableLangs, setAvailableLangs] = useState<string[]>([]);
  const [translatedLines, setTranslatedLines] = useState<LyricLine[] | null>(null);
  const [translationUnavailable, setTranslationUnavailable] = useState(false);
  const [videoPositionMs, setVideoPositionMs] = useState(0);
  // Probe whether synced lyrics actually exist for this track (null = still probing)
  const [lyricsAvailable, setLyricsAvailable] = useState<boolean | null>(null);

  const section = item.lyricSection ?? null;

  const seedCreator = getUserById(item.userId);
  const isCurrentUser = currentUser?.id === item.userId;
  const cardHeight = Platform.OS === "web" ? 680 : screenHeight;

  const displayName = isCurrentUser
    ? currentUser.displayName || currentUser.username
    : seedCreator?.displayName ?? item.userId.replace("user_", "");

  const username = isCurrentUser
    ? currentUser.username
    : seedCreator?.username ?? item.userId.replace("user_", "");

  const avatarColor = isCurrentUser
    ? "#A855F7"
    : seedCreator?.avatarColor ?? "#A855F7";

  const avatarInitials = isCurrentUser
    ? (currentUser.displayName?.[0] ?? currentUser.username?.[0] ?? "?").toUpperCase()
    : seedCreator?.avatarInitials ?? "?";

  // Find matching LyricStage challenge for "Sing This Part" CTA
  // Filter by both trackId AND sectionId so the CTA targets the right challenge
  const matchingChallenge =
    item.musixmatchTrackId && section
      ? SEED_CHALLENGES.find(
          (ch) =>
            ch.musixmatchTrackId === item.musixmatchTrackId &&
            ch.challengeType === "lyric_stage" &&
            (ch.lyricSectionId === undefined || ch.lyricSectionId === section.sectionId),
        )
      : null;

  // Background probe on mount — determine if synced lyrics are available.
  // Only synced lyrics (hasSync: true) power the overlay; plain text (hasSync: false) does not.
  // Uses in-memory cache so the overlay open fetch is free afterward.
  useEffect(() => {
    if (!section) return;
    let cancelled = false;
    fetchLyrics(section.trackId).then((result) => {
      if (cancelled) return;
      const hasSyncedLyrics = result !== null && result.hasSync && result.lines.length > 0;
      setLyricsAvailable(hasSyncedLyrics);
    });
    return () => { cancelled = true; };
  }, [section?.trackId]);

  // Fetch lyrics + probe translations when overlay opens
  useEffect(() => {
    if (!lyricVisible || !section) return;
    let cancelled = false;

    setLyricsLoading(true);
    setLyricError(null);
    setLyrics(null);
    setAvailableLangs([]);

    fetchLyrics(section.trackId).then((result) => {
      if (cancelled) return;
      if (result) {
        setLyrics(result);
      } else {
        setLyricError("Lyrics not available");
      }
      setLyricsLoading(false);
    });

    probeAvailableTranslations(section.trackId, ["es", "ar"]).then((langs) => {
      if (!cancelled) setAvailableLangs(langs);
    });

    return () => {
      cancelled = true;
    };
  }, [lyricVisible, section?.trackId]);

  // Fetch translation when language changes
  useEffect(() => {
    if (!lyricVisible || !section || activeLang === "en") {
      setTranslatedLines(null);
      setTranslationUnavailable(false);
      return;
    }
    let cancelled = false;
    fetchTranslation(section.trackId, activeLang).then((result) => {
      if (!cancelled) {
        if (!result || result.lines === null) {
          setTranslationUnavailable(true);
          setTranslatedLines(null);
        } else {
          setTranslationUnavailable(false);
          setTranslatedLines(result.lines);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeLang, section?.trackId, lyricVisible]);

  // Poll video position every 250 ms while overlay is open
  useEffect(() => {
    if (!lyricVisible || !section) return;
    const poll = setInterval(async () => {
      try {
        const status = videoRef.current ? await videoRef.current.getStatusAsync() : undefined;
        if (status?.isLoaded) {
          setVideoPositionMs(status.positionMillis);
        }
      } catch {}
    }, 250);
    return () => clearInterval(poll);
  }, [lyricVisible, section]);

  // Compute the active lyric line
  const displayLines =
    activeLang === "en"
      ? (lyrics?.lines ?? null)
      : translationUnavailable
        ? null
        : translatedLines;

  const activeLine: LyricLine | null = (() => {
    if (!section) return null;
    // hasSync:false → fixed-pace progression (divide section evenly among lines)
    if (displayLines && displayLines.length > 0 && lyrics?.hasSync === false) {
      const sectionDuration = section.endMs - section.startMs;
      if (sectionDuration <= 0) return null;
      const msPerLine = sectionDuration / displayLines.length;
      const elapsed = videoPositionMs + section.timingOffsetMs;
      const idx = Math.min(Math.floor(elapsed / msPerLine), displayLines.length - 1);
      return displayLines[idx] ?? null;
    }
    if (!displayLines) return null;
    const absMs = videoPositionMs + section.startMs + section.timingOffsetMs;
    return (
      displayLines.find(
        (l) => l.startMs !== null && l.endMs !== null && absMs >= l.startMs! && absMs < l.endMs!,
      ) ?? null
    );
  })();

  const handleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 50 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    setLocalLikes((prev) => (isLiked ? prev - 1 : prev + 1));
    toggleLike(item.id);
  }, [isLiked, item.id, likeScale, toggleLike]);

  const handleGoldenMic = useCallback(() => {
    Animated.sequence([
      Animated.spring(gmScale, { toValue: 1.5, useNativeDriver: true, speed: 50 }),
      Animated.spring(gmScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onGoldenMicPress(item.id);
  }, [gmScale, item.id, onGoldenMicPress]);

  const handleCreatorPress = useCallback(() => {
    if (seedCreator) router.push(`/creator/${seedCreator.username}`);
  }, [seedCreator]);

  const handleSingThisPart = useCallback(() => {
    if (matchingChallenge) {
      router.push({
        pathname: "/lyric-challenge/[id]",
        params: {
          id: matchingChallenge.id,
          trackId: section?.trackId ?? "",
          sectionId: section?.sectionId ?? "",
          startMs: String(section?.startMs ?? 0),
          endMs: String(section?.endMs ?? 0),
        },
      });
    } else {
      router.push("/(tabs)/post");
    }
  }, [matchingChallenge, section]);

  const performanceColor =
    item.performanceType === "original"
      ? colors.accent
      : item.performanceType === "cover"
        ? colors.primary
        : colors.gold;

  const sourceBadgeText =
    lyrics?.source === "demo" ? "Demo content" : "Powered by Musixmatch";

  return (
    <View style={[styles.container, { height: cardHeight }]}>
      {item.videoUri ? (
        <Video
          ref={videoRef}
          source={{ uri: item.videoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted={isMuted}
        />
      ) : (
        <Image
          source={SINGER_IMAGES[item.imageIndex % 3]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      )}

      <LinearGradient
        colors={["transparent", "rgba(5,2,10,0.6)", "rgba(5,2,10,0.95)"]}
        locations={[0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {item.isRisingVoice && (
        <View style={styles.risingBadge}>
          <Ionicons name="mic" size={10} color={colors.gold} />
          <Text style={styles.risingText}>Rising Voice</Text>
        </View>
      )}

      {item.videoUri && (
        <TouchableOpacity
          style={styles.muteBtn}
          onPress={() => setIsMuted((m) => !m)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isMuted ? "volume-mute" : "volume-high"}
            size={18}
            color="#fff"
          />
        </TouchableOpacity>
      )}

      {/* Lyric overlay — shown above the bottom info area */}
      {lyricVisible && section && (
        <View style={styles.lyricOverlay} pointerEvents="box-none">
          {/* Source attribution */}
          {lyrics && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{sourceBadgeText}</Text>
            </View>
          )}

          {/* Active lyric line */}
          <View style={styles.lyricLineArea}>
            {lyricsLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : lyricError ? (
              <Text style={styles.lyricUnavailable}>{lyricError}</Text>
            ) : activeLang !== "en" && translationUnavailable ? (
              <Text style={styles.lyricUnavailable}>Translation not available</Text>
            ) : activeLine ? (
              <Text style={styles.lyricActiveLine}>{activeLine.text}</Text>
            ) : lyrics ? (
              <Text style={styles.lyricPlaceholder}>♪</Text>
            ) : null}
          </View>

          {/* Language pills (only when translations are available) */}
          {availableLangs.length > 0 && (
            <View style={styles.langPills}>
              {(["en", ...availableLangs] as string[]).map((lang) => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setActiveLang(lang)}
                  style={[
                    styles.langPill,
                    activeLang === lang && { backgroundColor: colors.primary },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.langPillText,
                      { color: activeLang === lang ? "#fff" : "rgba(255,255,255,0.75)" },
                    ]}
                  >
                    {LANG_LABELS[lang] ?? lang.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Sing This Part CTA */}
          <TouchableOpacity
            testID="sing-this-part-btn"
            style={styles.singThisPartBtn}
            onPress={handleSingThisPart}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="microphone" size={14} color="#fff" />
            <Text style={styles.singThisPartText}>Sing This Part</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.creatorAvatarBtn}
          onPress={handleCreatorPress}
          activeOpacity={0.8}
        >
          <View style={[styles.creatorAvatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.creatorInitials}>{avatarInitials}</Text>
          </View>
          {!isCurrentUser && (
            <View style={styles.followDot}>
              <Ionicons name="add" size={12} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <ActionButton
          icon={
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={32}
                color={isLiked ? "#EF4444" : "#fff"}
              />
            </Animated.View>
          }
          count={localLikes}
          onPress={handleLike}
          color="#fff"
          active={isLiked}
          activeColor="#EF4444"
        />

        <ActionButton
          icon={<Ionicons name="chatbubble-ellipses-outline" size={30} color="#fff" />}
          count={item.commentsCount}
          onPress={() => onCommentPress(item.id)}
          color="#fff"
        />

        <ActionButton
          icon={<Ionicons name="arrow-redo-outline" size={30} color="#fff" />}
          count={item.sharesCount}
          onPress={() => {}}
          color="#fff"
        />

        <ActionButton
          icon={
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={28}
              color={isSaved ? colors.primary : "#fff"}
            />
          }
          onPress={() => toggleSave(item.id)}
          color="#fff"
        />

        <TouchableOpacity
          style={[styles.goldenMicBtn, gmSent > 0 && styles.goldenMicBtnActive]}
          onPress={handleGoldenMic}
          activeOpacity={0.7}
        >
          <Animated.View style={{ transform: [{ scale: gmScale }] }}>
            <MaterialCommunityIcons
              name="microphone"
              size={28}
              color={gmSent > 0 ? colors.gold : "#D4A017"}
            />
          </Animated.View>
          <Text style={[styles.actionCount, { color: colors.gold }]}>
            {formatCount(localGMs + (gmSent > 0 ? gmSent : 0))}
          </Text>
        </TouchableOpacity>

        {/* ♪ Lyric toggle — only shown when the card has a lyric section with available lyrics */}
        {section && lyricsAvailable !== false && (
          <TouchableOpacity
            testID="lyric-overlay-toggle"
            onPress={() => {
              setLyricVisible((v) => !v);
              if (!lyricVisible) {
                setActiveLang("en");
                setTranslatedLines(null);
                setVideoPositionMs(0);
              }
            }}
            style={[
              styles.lyricToggleBtn,
              lyricVisible && { backgroundColor: `${colors.primary}40` },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.lyricToggleIcon, { color: lyricVisible ? colors.primary : "#fff" }]}>
              ♪
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomInfo}>
        <Pressable style={styles.creatorRow} onPress={handleCreatorPress}>
          <Text style={styles.creatorUsername}>@{username}</Text>
          {item.isRisingVoice && (
            <View style={[styles.badge, { borderColor: colors.gold }]}>
              <Text style={[styles.badgeText, { color: colors.gold }]}>Rising Voice</Text>
            </View>
          )}
        </Pressable>

        {item.title ? (
          <Text style={styles.titleText} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}

        <Text style={styles.caption} numberOfLines={2}>
          {item.caption}
        </Text>

        <View style={styles.tagsRow}>
          <View
            style={[
              styles.tag,
              {
                backgroundColor: `${performanceColor}20`,
                borderColor: `${performanceColor}50`,
              },
            ]}
          >
            <Text style={[styles.tagText, { color: performanceColor }]}>
              {item.performanceType.charAt(0).toUpperCase() + item.performanceType.slice(1)}
            </Text>
          </View>
          <View
            style={[
              styles.tag,
              { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" },
            ]}
          >
            <Text style={[styles.tagText, { color: "#CBD5E1" }]}>{item.genre}</Text>
          </View>
          {item.language !== "English" && (
            <View
              style={[
                styles.tag,
                {
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderColor: "rgba(255,255,255,0.15)",
                },
              ]}
            >
              <Text style={[styles.tagText, { color: "#CBD5E1" }]}>{item.language}</Text>
            </View>
          )}
          {section && (
            <View
              style={[
                styles.tag,
                { backgroundColor: "rgba(168,85,247,0.15)", borderColor: "rgba(168,85,247,0.4)" },
              ]}
            >
              <Text style={[styles.tagText, { color: "#A855F7" }]}>♪ LyricStage</Text>
            </View>
          )}
        </View>

        {item.trackTitle && item.trackArtist && (item.performanceType === "cover" || !!item.musixmatchTrackId) && (
          <View style={styles.songRef}>
            <Ionicons name="musical-note" size={12} color={colors.primary} />
            <Text
              style={[styles.songText, { color: colors.primary }]}
              numberOfLines={1}
            >
              {item.performanceType === "cover"
                ? `${item.trackTitle} — ${item.trackArtist}`
                : item.performanceType === "freestyle"
                  ? `Backing: ${item.trackTitle} — ${item.trackArtist}`
                  : `Inspired by: ${item.trackTitle} — ${item.trackArtist}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#000",
    position: "relative",
  },
  risingBadge: {
    position: "absolute",
    top: Platform.OS === "web" ? 74 : 54,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245,158,11,0.2)",
    borderColor: "rgba(245,158,11,0.5)",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  risingText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  muteBtn: {
    position: "absolute",
    top: Platform.OS === "web" ? 74 : 54,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(5,2,10,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  lyricOverlay: {
    position: "absolute",
    left: 16,
    right: 74,
    bottom: Platform.OS === "web" ? 220 : 310,
    alignItems: "center",
    gap: 10,
  },
  sourceBadge: {
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(5,2,10,0.55)",
  },
  sourceBadgeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    fontWeight: "500",
  },
  lyricLineArea: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  lyricActiveLine: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 26,
  },
  lyricPlaceholder: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 28,
  },
  lyricUnavailable: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
  },
  langPills: {
    flexDirection: "row",
    gap: 6,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(5,2,10,0.55)",
  },
  langPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  singThisPartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#A855F7",
  },
  singThisPartText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  rightActions: {
    position: "absolute",
    right: 12,
    bottom: 120,
    alignItems: "center",
    gap: 16,
  },
  creatorAvatarBtn: {
    position: "relative",
    marginBottom: 4,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  creatorInitials: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  followDot: {
    position: "absolute",
    bottom: -4,
    left: "50%",
    transform: [{ translateX: -8 }],
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EC4899",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    alignItems: "center",
    gap: 2,
  },
  actionCount: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  goldenMicBtn: {
    alignItems: "center",
    gap: 2,
    padding: 2,
  },
  goldenMicBtnActive: {
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  lyricToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(5,2,10,0.5)",
  },
  lyricToggleIcon: {
    fontSize: 20,
    fontWeight: "700",
  },
  bottomInfo: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 12 : 90,
    left: 16,
    right: 68,
    gap: 4,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  creatorUsername: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  titleText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  caption: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    lineHeight: 18,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  songRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  songText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
});

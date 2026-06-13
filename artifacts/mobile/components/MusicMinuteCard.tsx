import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useCallback, useRef, useState } from "react";
import {
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
import { MusicMinute, formatCount, getUserById } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

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
    <TouchableOpacity
      onPress={onPress}
      style={styles.actionButton}
      activeOpacity={0.7}
    >
      <Animated.View
        style={scale ? { transform: [{ scale }] } : undefined}
      >
        {icon}
      </Animated.View>
      {count !== undefined && (
        <Text style={[styles.actionCount, active && activeColor ? { color: activeColor } : { color }]}>
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

  const seedCreator = getUserById(item.userId);
  const isCurrentUser = currentUser?.id === item.userId;
  const cardHeight = Platform.OS === "web" ? 680 : screenHeight;

  const displayName = isCurrentUser
    ? (currentUser.displayName || currentUser.username)
    : (seedCreator?.displayName ?? item.userId.replace("user_", ""));

  const username = isCurrentUser
    ? currentUser.username
    : (seedCreator?.username ?? item.userId.replace("user_", ""));

  const avatarColor = isCurrentUser
    ? "#A855F7"
    : (seedCreator?.avatarColor ?? "#A855F7");

  const avatarInitials = isCurrentUser
    ? (currentUser.displayName?.[0] ?? currentUser.username?.[0] ?? "?").toUpperCase()
    : (seedCreator?.avatarInitials ?? "?");

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

  const performanceColor =
    item.performanceType === "original"
      ? colors.accent
      : item.performanceType === "cover"
        ? colors.primary
        : colors.gold;

  return (
    <View style={[styles.container, { height: cardHeight }]}>
      {item.videoUri ? (
        <Video
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

      <View style={styles.rightActions}>
        <TouchableOpacity style={styles.creatorAvatarBtn} onPress={handleCreatorPress} activeOpacity={0.8}>
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
          <Text style={styles.titleText} numberOfLines={1}>{item.title}</Text>
        ) : null}

        <Text style={styles.caption} numberOfLines={2}>
          {item.caption}
        </Text>

        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: `${performanceColor}20`, borderColor: `${performanceColor}50` }]}>
            <Text style={[styles.tagText, { color: performanceColor }]}>
              {item.performanceType.charAt(0).toUpperCase() + item.performanceType.slice(1)}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
            <Text style={[styles.tagText, { color: "#CBD5E1" }]}>{item.genre}</Text>
          </View>
          {item.language !== "English" && (
            <View style={[styles.tag, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
              <Text style={[styles.tagText, { color: "#CBD5E1" }]}>{item.language}</Text>
            </View>
          )}
        </View>

        {item.trackTitle && item.trackArtist && (
          <View style={styles.songRef}>
            <Ionicons name="musical-note" size={12} color={colors.primary} />
            <Text style={[styles.songText, { color: colors.primary }]} numberOfLines={1}>
              {item.trackTitle} — {item.trackArtist}
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

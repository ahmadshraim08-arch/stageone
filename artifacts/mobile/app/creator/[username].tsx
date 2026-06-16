import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";

import { GoldenMicModal } from "@/components/GoldenMicModal";
import { useApp, apiPostToMusicMinute } from "@/context/AppContext";
import {
  getUserByUsername as getSeedUserByUsername,
  getMusicMinutesByUserId,
  formatCount,
  MusicMinute,
} from "@/data/seedData";
import { useColors } from "@/hooks/useColors";
import { ApiUser, getUserByUsername as getApiUserByUsername, getPosts } from "@/lib/api";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

const BADGE_COLORS: Record<string, string> = {
  "Rising Voice": "#A855F7",
  "Golden Mic Milestone": "#F59E0B",
  "Spotlight Eligible": "#EC4899",
  "First Performance": "#10B981",
  "Community Favorite": "#0EA5E9",
};

export default function CreatorProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { followingIds, toggleFollow, currentUser, musicMinutes } = useApp();
  const { getToken, isSignedIn } = useAuth();

  const [gmVisible, setGmVisible] = useState(false);
  const [gmToast, setGmToast] = useState(false);
  const [apiUser, setApiUser] = useState<ApiUser | null>(null);
  const [apiPosts, setApiPosts] = useState<MusicMinute[] | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);

  // Try to load real API user data; seed data serves as fallback for demo creators
  useEffect(() => {
    if (!isSignedIn || !username) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const u = await getApiUserByUsername(token, username);
        setApiUser(u);
        // Fetch the creator's real posts using their DB id
        setPostsLoading(true);
        try {
          const result = await getPosts(token, { userId: u.id });
          setApiPosts(result.items.map(apiPostToMusicMinute));
        } catch {
          setApiPosts([]);
        } finally {
          setPostsLoading(false);
        }
      } catch {
        // Creator is seed-only; gracefully ignore
      }
    })();
  }, [isSignedIn, username]);

  const user = getSeedUserByUsername(username ?? "");
  const seedMMs = user ? getMusicMinutesByUserId(user.id) : [];
  // For API-backed creators, prefer real fetched posts; fall back to feed cache + seed data
  const userMMs: MusicMinute[] = apiPosts !== null
    ? apiPosts
    : user
      ? [...musicMinutes.filter((m) => m.userId === user.id && !seedMMs.find((s) => s.id === m.id)), ...seedMMs]
      : seedMMs;

  // When API user found, prefer their real stats; else fall back to seed data
  const followUserId = apiUser ? String(apiUser.id) : user?.id ?? "";
  const displayFollowers = apiUser ? apiUser.followerCount : user?.followersCount ?? 0;
  const displayFollowing = apiUser ? apiUser.followingCount : user?.followingCount ?? 0;
  const displayGoldenMics = apiUser ? apiUser.goldenMicBalance : user?.totalGoldenMics ?? 0;
  const displayBio = apiUser ? (apiUser.bio ?? "") : (user?.bio ?? "");

  const isFollowing = followingIds.has(followUserId);

  // Snapshot the follower count and initial follow state once the API data loads.
  // Using isFollowing in the live count formula means rollbacks revert the count automatically.
  const snapshotRef = useRef<{ count: number; wasFollowing: boolean } | null>(null);
  useEffect(() => {
    if (apiUser !== null && snapshotRef.current === null) {
      snapshotRef.current = { count: apiUser.followerCount, wasFollowing: isFollowing };
    }
  }, [apiUser, isFollowing]);

  const liveFollowersCount =
    snapshotRef.current !== null
      ? snapshotRef.current.count +
        (isFollowing ? 1 : 0) -
        (snapshotRef.current.wasFollowing ? 1 : 0)
      : displayFollowers;

  const isOwnProfile =
    (apiUser ? currentUser?.dbId === apiUser.id : false) ||
    currentUser?.username === user?.username;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!user && !apiUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.notFound}>
          <Ionicons name="person-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Creator not found</Text>
        </View>
      </View>
    );
  }

  // Unified display profile — seed data wins for UI decoration; API overrides real stats
  const displayProfile = user ? {
    id: followUserId,
    displayName: apiUser?.displayName ?? user.displayName,
    username: apiUser?.username ?? user.username,
    bio: displayBio,
    avatarColor: user.avatarColor,
    avatarInitials: user.avatarInitials,
    liveEligible: user.liveEligible,
    followersCount: liveFollowersCount,
    followingCount: displayFollowing,
    totalGoldenMics: displayGoldenMics,
    totalLikes: user.totalLikes,
    riseScore: user.riseScore,
    badges: user.badges as string[],
    genre: user.genre,
    location: user.location as string | null,
  } : {
    id: followUserId,
    displayName: apiUser!.displayName,
    username: apiUser!.username,
    bio: apiUser!.bio ?? "",
    avatarColor: "#A855F7",
    avatarInitials: apiUser!.displayName.slice(0, 2).toUpperCase(),
    liveEligible: false,
    followersCount: liveFollowersCount,
    followingCount: apiUser!.followingCount,
    totalGoldenMics: apiUser!.goldenMicBalance,
    totalLikes: 0,
    riseScore: 0,
    badges: [] as string[],
    genre: (apiUser!.genres ?? [])[0] ?? "Singer",
    location: null as string | null,
  };

  const eligibleCount = [
    displayProfile.liveEligible,
    displayProfile.followersCount >= 100,
    displayProfile.totalGoldenMics >= 50,
    userMMs.reduce((s, m) => s + m.views, 0) >= 2000,
    userMMs.length >= 3,
  ].filter(Boolean).length;

  const avatarUrl = apiUser?.avatarUrl ?? null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[`${displayProfile.avatarColor}40`, "#05020A"]}
        style={[styles.hero, { paddingTop: topPad + 8 }]}
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.heroTop}>
          <View style={[styles.avatar, { backgroundColor: displayProfile.avatarColor }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={styles.avatarText}>{displayProfile.avatarInitials}</Text>
            )}
            {displayProfile.liveEligible && (
              <View style={styles.liveEligibleDot}>
                <Ionicons name="radio" size={10} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.heroActions}>
            {currentUser && !isOwnProfile && (
              <TouchableOpacity
                onPress={() => toggleFollow(displayProfile.id)}
                style={[
                  styles.followBtn,
                  {
                    backgroundColor: isFollowing ? "transparent" : colors.primary,
                    borderColor: isFollowing ? colors.border : colors.primary,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.followBtnText, { color: isFollowing ? colors.mutedForeground : "#fff" }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setGmVisible(true)}
              style={[styles.gmBtn, { backgroundColor: `${colors.gold}15`, borderColor: `${colors.gold}40` }]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="microphone" size={18} color={colors.gold} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.nameBlock}>
          <Text style={[styles.displayName, { color: colors.foreground }]}>{displayProfile.displayName}</Text>
          <Text style={[styles.username, { color: colors.mutedForeground }]}>@{displayProfile.username}</Text>
          {displayProfile.bio ? (
            <Text style={[styles.bio, { color: "rgba(255,255,255,0.75)" }]} numberOfLines={3}>
              {displayProfile.bio}
            </Text>
          ) : null}
          <View style={styles.tagsRow}>
            <View style={[styles.tag, { backgroundColor: `${colors.primary}20`, borderColor: `${colors.primary}40` }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{displayProfile.genre}</Text>
            </View>
            {displayProfile.location ? (
              <View style={[styles.tag, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
                <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{displayProfile.location}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: "Followers", value: formatCount(displayProfile.followersCount) },
            { label: "Following", value: formatCount(displayProfile.followingCount) },
            { label: "Likes", value: formatCount(displayProfile.totalLikes) },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.riseRow}>
          <View style={[styles.riseCard, { backgroundColor: `${colors.gold}15`, borderColor: `${colors.gold}30` }]}>
            <MaterialCommunityIcons name="microphone" size={18} color={colors.gold} />
            <View>
              <Text style={[styles.riseCardValue, { color: colors.gold }]}>{formatCount(displayProfile.totalGoldenMics)}</Text>
              <Text style={[styles.riseCardLabel, { color: colors.mutedForeground }]}>Golden Mics</Text>
            </View>
          </View>
          <View style={[styles.riseCard, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
            <Ionicons name="trending-up" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.riseCardValue, { color: colors.primary }]}>{formatCount(displayProfile.riseScore)}</Text>
              <Text style={[styles.riseCardLabel, { color: colors.mutedForeground }]}>Rise Score</Text>
            </View>
          </View>
          <View style={[styles.riseCard, { backgroundColor: displayProfile.liveEligible ? `${colors.accent}15` : `${colors.muted}80`, borderColor: displayProfile.liveEligible ? `${colors.accent}30` : colors.border }]}>
            <Ionicons name="radio" size={18} color={displayProfile.liveEligible ? colors.accent : colors.mutedForeground} />
            <View>
              <Text style={[styles.riseCardValue, { color: displayProfile.liveEligible ? colors.accent : colors.mutedForeground, fontSize: 13 }]}>
                {displayProfile.liveEligible ? "Eligible" : `${eligibleCount}/5`}
              </Text>
              <Text style={[styles.riseCardLabel, { color: colors.mutedForeground }]}>Live Status</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {displayProfile.badges.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Badges</Text>
          <View style={styles.badgesRow}>
            {displayProfile.badges.map((badge) => (
              <View
                key={badge}
                style={[styles.badge, { backgroundColor: `${BADGE_COLORS[badge] ?? colors.primary}20`, borderColor: `${BADGE_COLORS[badge] ?? colors.primary}50` }]}
              >
                <Text style={[styles.badgeText, { color: BADGE_COLORS[badge] ?? colors.primary }]}>{badge}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Music Minutes{!postsLoading ? ` (${userMMs.length})` : ""}
        </Text>
        {postsLoading ? (
          <View style={styles.emptyMMs}>
            <ActivityIndicator color="#A855F7" size="small" />
          </View>
        ) : userMMs.length === 0 ? (
          <View style={styles.emptyMMs}>
            <MaterialCommunityIcons name="microphone-off" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyMMsText, { color: colors.mutedForeground }]}>No Music Minutes yet</Text>
          </View>
        ) : (
          <View style={styles.mmGrid}>
            {userMMs.map((mm) => (
              <View key={mm.id} style={[styles.mmTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image
                  source={SINGER_IMAGES[mm.imageIndex % 3]}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                <LinearGradient colors={["transparent", "rgba(5,2,10,0.92)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.mmTileOverlay}>
                  {mm.trackTitle && (mm.performanceType === "cover" || !!mm.musixmatchTrackId) && (
                    <TouchableOpacity
                      style={styles.mmSongTag}
                      activeOpacity={0.7}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (mm.musixmatchTrackId) {
                          router.push({ pathname: "/(tabs)/post", params: { prefillTrackId: mm.musixmatchTrackId } });
                        } else {
                          router.push({ pathname: "/(tabs)/post", params: { prefillSongQuery: `${mm.trackTitle} ${mm.trackArtist ?? ""}`.trim() } });
                        }
                      }}
                    >
                      <Ionicons name="musical-note" size={9} color={colors.primary} />
                      <Text style={[styles.mmSongText, { color: colors.primary }]} numberOfLines={1}>
                        {mm.performanceType === "cover"
                          ? mm.trackTitle
                          : mm.performanceType === "freestyle"
                            ? `Backing: ${mm.trackTitle}`
                            : `Inspired by: ${mm.trackTitle}`}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.mmTileTitle} numberOfLines={1}>{mm.title}</Text>
                  <View style={styles.mmTileStats}>
                    <MaterialCommunityIcons name="microphone" size={10} color={colors.gold} />
                    <Text style={[styles.mmTileStatText, { color: colors.gold }]}>{formatCount(mm.goldenMicsCount)}</Text>
                    <Ionicons name="heart" size={10} color="#EF4444" />
                    <Text style={[styles.mmTileStatText, { color: "rgba(255,255,255,0.6)" }]}>{formatCount(mm.likesCount)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {gmToast && (
        <View style={[styles.toast, { backgroundColor: "rgba(5,2,10,0.95)", borderColor: `${colors.gold}40` }]}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 }}>Golden Mic sent. You helped this artist rise.</Text>
        </View>
      )}

      <GoldenMicModal
        visible={gmVisible}
        musicMinuteId={userMMs[0]?.id ?? null}
        onClose={() => setGmVisible(false)}
        onSuccess={() => { setGmToast(true); setTimeout(() => setGmToast(false), 3000); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  liveEligibleDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EC4899",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#05020A",
  },
  heroActions: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8 },
  followBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  followBtnText: { fontSize: 14, fontWeight: "700" },
  gmBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  nameBlock: { gap: 6 },
  displayName: { fontSize: 24, fontWeight: "800" },
  username: { fontSize: 15 },
  bio: { fontSize: 14, lineHeight: 20 },
  tagsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: "600" },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11 },
  riseRow: { flexDirection: "row", gap: 10 },
  riseCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  riseCardValue: { fontSize: 16, fontWeight: "800" },
  riseCardLabel: { fontSize: 10 },
  section: { paddingTop: 24, paddingHorizontal: 20, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  mmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mmTile: {
    width: "30.5%",
    aspectRatio: 0.65,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  mmTileOverlay: { position: "absolute", bottom: 8, left: 8, right: 8, gap: 4 },
  mmSongTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  mmSongText: { fontSize: 9, fontWeight: "600", flex: 1 },
  mmTileTitle: { color: "#fff", fontSize: 11, fontWeight: "700" },
  mmTileStats: { flexDirection: "row", alignItems: "center", gap: 4 },
  mmTileStatText: { fontSize: 10 },
  emptyMMs: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyMMsText: { fontSize: 14 },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  notFoundText: { fontSize: 16 },
  toast: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
});

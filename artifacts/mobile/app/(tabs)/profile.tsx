import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo } from "react";
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

import { useApp } from "@/context/AppContext";
import { SEED_USERS, formatCount } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, musicMinutes, likedIds, savedIds, followingIds, directShares, logout, isLoaded } = useApp();

  const inboxCount = useMemo(() => {
    if (!currentUser) return 0;
    return directShares.filter((s) => s.recipientId === currentUser.id && !s.seenAt).length;
  }, [directShares, currentUser]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!isLoaded) {
    return (
      <View style={[styles.container, styles.loadingView, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator size="large" color="#A855F7" />
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={styles.guestView}>
          <View style={[styles.guestAvatar, { backgroundColor: colors.secondary }]}>
            <Ionicons name="person" size={48} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>Join StageOne</Text>
          <Text style={[styles.guestSubtitle, { color: colors.mutedForeground }]}>
            Sign up to track your Rise Score, give Golden Mics, and post your first Music Minute.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/onboarding")}
            activeOpacity={0.85}
            style={styles.joinBtn}
          >
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.joinBtnGradient}>
              <Text style={styles.joinBtnText}>Create Account</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.loginLink, { color: colors.mutedForeground }]}>
            Already have an account?{" "}
            <Text style={{ color: colors.primary }}>Log in</Text>
          </Text>
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trending Creators</Text>
          {SEED_USERS.slice(0, 4).map((user) => (
            <TouchableOpacity
              key={user.id}
              style={[styles.userRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push(`/creator/${user.username}`)}
              activeOpacity={0.8}
            >
              <View style={[styles.miniAvatar, { backgroundColor: user.avatarColor }]}>
                <Text style={styles.miniAvatarText}>{user.avatarInitials}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.userDisplayName, { color: colors.foreground }]}>{user.displayName}</Text>
                <Text style={[styles.userGenre, { color: colors.mutedForeground }]}>{user.genre}</Text>
              </View>
              <View style={styles.userGM}>
                <MaterialCommunityIcons name="microphone" size={12} color={colors.gold} />
                <Text style={[styles.userGMText, { color: colors.gold }]}>{formatCount(user.totalGoldenMics)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  const myMMs = musicMinutes.filter((m) => m.userId === currentUser.id);
  const savedMMs = musicMinutes.filter((m) => savedIds.has(m.id));

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={["#1A0F2E", "#05020A"]}
        style={[styles.profileHero, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.profileRow}>
          <View style={[styles.bigAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.bigAvatarText}>
              {currentUser.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{currentUser.displayName}</Text>
            <Text style={[styles.username, { color: colors.mutedForeground }]}>@{currentUser.username}</Text>
            <View style={[styles.gmBalanceBadge, { backgroundColor: `${colors.gold}15`, borderColor: `${colors.gold}40` }]}>
              <MaterialCommunityIcons name="microphone" size={14} color={colors.gold} />
              <Text style={[styles.gmBalanceText, { color: colors.gold }]}>
                {currentUser.goldenMicBalance} Golden Mic{currentUser.goldenMicBalance !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
            <View style={styles.profileActions}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/inbox" })}
              style={[styles.iconBtn, { borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <Ionicons name="mail-outline" size={20} color={colors.mutedForeground} />
              {inboxCount > 0 && (
                <View style={[styles.inboxBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.inboxBadgeText}>
                    {inboxCount > 9 ? "9+" : inboxCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => logout()} style={[styles.iconBtn, { borderColor: colors.border }]} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: "Posts", value: myMMs.length },
            { label: "Followers", value: 0 },
            { label: "Following", value: followingIds.size },
            { label: "Liked", value: likedIds.size },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(tabs)/post")}
          activeOpacity={0.85}
          style={styles.postCTABtn}
        >
          <LinearGradient colors={["#A855F7", "#EC4899", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.postCTAGradient}>
            <MaterialCommunityIcons name="microphone" size={18} color="#fff" />
            <Text style={styles.postCTAText}>Post a Music Minute</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {myMMs.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, paddingHorizontal: 16 }]}>
            My Music Minutes
          </Text>
          <View style={styles.mmGrid}>
            {myMMs.map((mm) => (
              <View key={mm.id} style={[styles.mmTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image
                  source={SINGER_IMAGES[mm.imageIndex % 3]}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                <LinearGradient colors={["transparent", "rgba(5,2,10,0.9)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.mmTileInfo}>
                  {mm.trackTitle && (mm.performanceType === "cover" || !!mm.musixmatchTrackId) && (
                    <View style={styles.mmSongTag}>
                      <Ionicons name="musical-note" size={9} color="#A855F7" />
                      <Text style={styles.mmSongText} numberOfLines={1}>
                        {mm.performanceType === "cover"
                          ? mm.trackTitle
                          : mm.performanceType === "freestyle"
                            ? `Backing: ${mm.trackTitle}`
                            : `Inspired by: ${mm.trackTitle}`}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.mmTileTitle} numberOfLines={1}>{mm.title}</Text>
                  <View style={styles.mmTileStats}>
                    <Ionicons name="heart" size={10} color="#EF4444" />
                    <Text style={styles.mmTileStatText}>{formatCount(mm.likesCount)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {myMMs.length === 0 && (
        <View style={styles.emptyMMs}>
          <MaterialCommunityIcons name="microphone-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyMMsTitle, { color: colors.foreground }]}>Your stage is waiting…</Text>
          <Text style={[styles.emptyMMsSub, { color: colors.mutedForeground }]}>
            Post your first Music Minute and let the world hear your voice.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/post")}
            activeOpacity={0.85}
            style={styles.emptyMMsCTA}
          >
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyMMsCTAGradient}>
              <MaterialCommunityIcons name="microphone" size={16} color="#fff" />
              <Text style={styles.emptyMMsCTAText}>Post a Music Minute</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {savedMMs.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, paddingHorizontal: 16 }]}>
            Saved
          </Text>
          <View style={styles.mmGrid}>
            {savedMMs.slice(0, 6).map((mm) => (
              <View key={mm.id} style={[styles.mmTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image
                  source={SINGER_IMAGES[mm.imageIndex % 3]}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                <LinearGradient colors={["transparent", "rgba(5,2,10,0.9)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.mmTileInfo}>
                  {mm.trackTitle && (mm.performanceType === "cover" || !!mm.musixmatchTrackId) && (
                    <View style={styles.mmSongTag}>
                      <Ionicons name="musical-note" size={9} color="#A855F7" />
                      <Text style={styles.mmSongText} numberOfLines={1}>
                        {mm.performanceType === "cover"
                          ? mm.trackTitle
                          : mm.performanceType === "freestyle"
                            ? `Backing: ${mm.trackTitle}`
                            : `Inspired by: ${mm.trackTitle}`}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.mmTileTitle} numberOfLines={1}>{mm.title}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guestView: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
    gap: 14,
  },
  guestAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  guestTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  guestSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  joinBtn: { width: "100%", borderRadius: 16, overflow: "hidden" },
  joinBtnGradient: { paddingVertical: 14, alignItems: "center" },
  joinBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  loginLink: { fontSize: 13 },
  profileHero: { paddingHorizontal: 20, paddingBottom: 24, gap: 20 },
  profileRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  bigAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  bigAvatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  profileInfo: { flex: 1, gap: 4 },
  displayName: { fontSize: 20, fontWeight: "800" },
  username: { fontSize: 14 },
  gmBalanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  gmBalanceText: { fontSize: 12, fontWeight: "700" },
  profileActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  inboxBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  inboxBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  statsGrid: { flexDirection: "row", justifyContent: "space-around" },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "500" },
  postCTABtn: { borderRadius: 14, overflow: "hidden" },
  postCTAGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13 },
  postCTAText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  section: { paddingTop: 24, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  miniAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  miniAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  userInfo: { flex: 1 },
  userDisplayName: { fontSize: 14, fontWeight: "700" },
  userGenre: { fontSize: 12 },
  userGM: { flexDirection: "row", alignItems: "center", gap: 3 },
  userGMText: { fontSize: 12, fontWeight: "600" },
  mmGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  mmTile: {
    width: "30.5%",
    aspectRatio: 0.65,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  mmTileInfo: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    gap: 3,
  },
  mmSongTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  mmSongText: { color: "#A855F7", fontSize: 9, fontWeight: "600", flex: 1 },
  mmTileTitle: { color: "#fff", fontSize: 11, fontWeight: "600" },
  mmTileStats: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  mmTileStatText: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
  loadingView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMMs: { alignItems: "center", paddingVertical: 48, gap: 10, paddingHorizontal: 32 },
  emptyMMsTitle: { fontSize: 17, fontWeight: "700" },
  emptyMMsSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  emptyMMsCTA: { borderRadius: 14, overflow: "hidden", marginTop: 6 },
  emptyMMsCTAGradient: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 24 },
  emptyMMsCTAText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

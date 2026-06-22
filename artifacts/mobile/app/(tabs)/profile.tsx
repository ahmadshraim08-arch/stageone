import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";

import { useApp, apiPostToMusicMinute } from "@/context/AppContext";
import { SEED_USERS, formatCount, MusicMinute } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";
import { apiBase, getMyPosts, getMySaved } from "@/lib/api";
import { uploadAvatar } from "@/lib/uploads";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { currentUser, musicMinutes, likedIds, savedIds, unreadMessages, logout, isLoaded, updateAvatar, updateProfile } = useApp();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [myApiPosts, setMyApiPosts] = useState<MusicMinute[]>([]);
  const [savedApiPosts, setSavedApiPosts] = useState<MusicMinute[]>([]);

  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState(false);
  const fetchedOnceRef = useRef(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openEditModal = () => {
    setEditDisplayName(currentUser?.displayName ?? "");
    setEditBio(currentUser?.bio ?? "");
    setEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!editDisplayName.trim()) {
      Alert.alert("Display name required", "Please enter a display name.");
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile(editDisplayName.trim(), editBio.trim());
      setEditModalVisible(false);
    } catch {
      Alert.alert("Save failed", "Could not update your profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const fetchMyPosts = useCallback(async () => {
    if (!currentUser || currentUser.isGuest) return;
    setPostsLoading(true);
    setPostsError(false);
    try {
      const token = await getToken();
      if (!token) return;
      const result = await getMyPosts(token);
      setMyApiPosts(result.items.map(apiPostToMusicMinute));
    } catch {
      setPostsError(true);
    } finally {
      setPostsLoading(false);
    }
  }, [currentUser?.id, getToken]);

  const fetchMySaved = useCallback(async () => {
    if (!currentUser || currentUser.isGuest) return;
    try {
      const token = await getToken();
      if (!token) return;
      const result = await getMySaved(token, { limit: 20 });
      setSavedApiPosts(result.items.map(apiPostToMusicMinute));
    } catch {
      // saved section failing silently is acceptable
    }
  }, [currentUser?.id, getToken]);

  // Initial fetch on mount
  useEffect(() => {
    if (!fetchedOnceRef.current && currentUser && !currentUser.isGuest) {
      fetchedOnceRef.current = true;
      fetchMyPosts();
      fetchMySaved();
    }
  }, [currentUser?.id]);

  // Refresh on focus so edits/deletes from post detail are reflected immediately
  useFocusEffect(
    useCallback(() => {
      if (fetchedOnceRef.current && currentUser && !currentUser.isGuest) {
        fetchMyPosts();
        fetchMySaved();
      }
    }, [fetchMyPosts, fetchMySaved]),
  );

  const handleAvatarUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setIsUploadingAvatar(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const mimeType = asset.mimeType ?? (asset.uri.endsWith(".png") ? "image/png" : "image/jpeg");
      const { avatarUrl, avatarObjectKey } = await uploadAvatar(asset.uri, mimeType, token);
      const patchRes = await fetch(`${apiBase()}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl, avatarObjectKey }),
      });
      if (!patchRes.ok) {
        throw new Error(`Failed to save avatar (HTTP ${patchRes.status})`);
      }
      updateAvatar(avatarUrl);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not upload avatar.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const inboxCount = unreadMessages;

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

  const myMMs = myApiPosts;
  const savedMMs = savedApiPosts;

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
          <TouchableOpacity onPress={handleAvatarUpload} activeOpacity={0.8} style={styles.bigAvatarWrapper}>
            {currentUser.avatarUrl ? (
              <Image source={{ uri: currentUser.avatarUrl }} style={styles.bigAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.bigAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.bigAvatarText}>
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {isUploadingAvatar
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="camera" size={12} color={colors.primary} />}
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            <View style={styles.displayNameRow}>
              <Text style={[styles.displayName, { color: colors.foreground }]}>{currentUser.displayName}</Text>
              <TouchableOpacity
                onPress={openEditModal}
                activeOpacity={0.7}
                style={[styles.editProfileBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="pencil" size={12} color={colors.mutedForeground} />
                <Text style={[styles.editProfileBtnText, { color: colors.mutedForeground }]}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.username, { color: colors.mutedForeground }]}>@{currentUser.username}</Text>
            {currentUser.bio ? (
              <Text style={[styles.bioText, { color: colors.foreground }]} numberOfLines={2}>{currentUser.bio}</Text>
            ) : null}
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
            <TouchableOpacity onPress={() => router.push("/diagnostic")} style={[styles.iconBtn, { borderColor: colors.border }]} activeOpacity={0.7}>
              <Ionicons name="settings-outline" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => logout()} style={[styles.iconBtn, { borderColor: colors.border }]} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: "Posts", value: fetchedOnceRef.current ? myApiPosts.length : currentUser.postCount },
            { label: "Followers", value: currentUser.followerCount },
            { label: "Following", value: currentUser.followingCount },
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

      {(myMMs.length > 0 || postsLoading || postsError) && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, paddingHorizontal: 16 }]}>
            My Music Minutes
          </Text>
          {postsLoading ? (
            <View style={styles.postsLoadingRow}>
              <ActivityIndicator color="#A855F7" size="small" />
            </View>
          ) : postsError ? (
            <View style={styles.postsLoadingRow}>
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                Could not load your posts.
              </Text>
              <TouchableOpacity onPress={fetchMyPosts} activeOpacity={0.7} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mmGrid}>
              {myMMs.map((mm) => (
                <TouchableOpacity
                  key={mm.id}
                  style={[styles.mmTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.82}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/post/${mm.id}`);
                  }}
                >
                  <Image
                    source={mm.videoUri ? { uri: mm.videoUri } : SINGER_IMAGES[mm.imageIndex % 3]}
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
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {myMMs.length === 0 && !postsLoading && !postsError && (
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

      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Display Name</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editDisplayName}
              onChangeText={setEditDisplayName}
              placeholder="Your display name"
              placeholderTextColor={colors.mutedForeground}
              maxLength={50}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bio</Text>
            <TextInput
              style={[styles.textInput, styles.bioInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Tell the world about your voice…"
              placeholderTextColor={colors.mutedForeground}
              maxLength={200}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{editBio.length}/200</Text>

            <TouchableOpacity
              onPress={handleSaveProfile}
              activeOpacity={0.85}
              disabled={isSaving}
              style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            >
              <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGradient}>
                {isSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                      <Ionicons name="musical-note" size={9} color="#A855F7" />
                      <Text style={styles.mmSongText} numberOfLines={1}>
                        {mm.performanceType === "cover"
                          ? mm.trackTitle
                          : mm.performanceType === "freestyle"
                            ? `Backing: ${mm.trackTitle}`
                            : `Inspired by: ${mm.trackTitle}`}
                      </Text>
                    </TouchableOpacity>
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
  bigAvatarWrapper: {
    position: "relative",
    width: 70,
    height: 70,
  },
  bigAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  bigAvatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  profileInfo: { flex: 1, gap: 4 },
  displayNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  displayName: { fontSize: 20, fontWeight: "800" },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  editProfileBtnText: { fontSize: 11, fontWeight: "600" },
  bioText: { fontSize: 13, lineHeight: 18, marginTop: 2 },
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
  postsLoadingRow: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: { fontSize: 14, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(168,85,247,0.15)",
  },
  retryBtnText: { color: "#A855F7", fontSize: 14, fontWeight: "600" },
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
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  bioInput: {
    minHeight: 90,
    paddingTop: 12,
  },
  charCount: { fontSize: 11, textAlign: "right", marginTop: -4 },
  saveBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  saveBtnGradient: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

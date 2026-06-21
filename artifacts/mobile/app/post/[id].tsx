import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Video, ResizeMode } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
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
import { useColors } from "@/hooks/useColors";
import { ApiPost, getPost, getPosts, patchPost, deletePost } from "@/lib/api";
import { formatCount } from "@/data/seedData";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

function StatPill({ icon, value, color }: { icon: string; value: number; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Ionicons name={icon as "heart"} size={14} color={color} />
      <Text style={[styles.pillText, { color: colors.foreground }]}>{formatCount(value)}</Text>
    </View>
  );
}

export default function PostDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id, depth: depthParam } = useLocalSearchParams<{ id: string; depth?: string }>();
  const depth = parseInt(depthParam ?? "1", 10) || 1;
  const MAX_POST_DEPTH = 3;
  const { getToken, isSignedIn } = useAuth();
  const { likedIds, savedIds, currentUser, removeFromFeed, patchInFeed, adjustPostCount } = useApp();

  const [post, setPost] = useState<ApiPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [relatedPosts, setRelatedPosts] = useState<ApiPost[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const tapIconOpacity = useRef(new Animated.Value(0)).current;
  const [tapIcon, setTapIcon] = useState<"play" | "pause">("play");

  // Edit state
  const [editVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const postId = parseInt(id ?? "", 10);
    if (isNaN(postId)) {
      setError(true);
      setLoading(false);
      return;
    }
    (async () => {
      const token = isSignedIn ? (await getToken()) : null;
      try {
        const p = await getPost(token, postId);
        setPost(p);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isSignedIn]);

  useEffect(() => {
    if (!post) return;
    const currentPostId = post.id;
    const creatorId = post.userId;
    setRelatedLoading(true);
    (async () => {
      const token = isSignedIn ? (await getToken()) : null;
      try {
        const result = await getPosts(token, { userId: creatorId, limit: 7 });
        setRelatedPosts(result.items.filter((p) => p.id !== currentPostId).slice(0, 6));
      } catch {
        setRelatedPosts([]);
      } finally {
        setRelatedLoading(false);
      }
    })();
  }, [post?.id, post?.userId, isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        videoRef.current?.pauseAsync().catch(() => {});
        setIsPlaying(false);
      };
    }, [])
  );

  const handleVideoTap = useCallback(() => {
    if (!post?.videoUrl || videoError) return;

    const willBePaused = isPlaying;
    setIsPlaying(!isPlaying);

    if (videoRef.current) {
      if (willBePaused) {
        videoRef.current.pauseAsync().catch(() => {});
      } else {
        videoRef.current.playAsync().catch(() => {});
      }
    }

    setTapIcon(willBePaused ? "play" : "pause");
    tapIconOpacity.stopAnimation();
    tapIconOpacity.setValue(0.85);
    Animated.timing(tapIconOpacity, {
      toValue: 0,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, [isPlaying, post?.videoUrl, videoError, tapIconOpacity]);

  const isLiked = post ? likedIds.has(String(post.id)) : false;
  const isSaved = post ? savedIds.has(String(post.id)) : false;
  const placeholderImg = post ? SINGER_IMAGES[post.id % SINGER_IMAGES.length] : SINGER_IMAGES[0];
  const isOwner = !!(currentUser && post && currentUser.dbId === post.userId);

  const openEdit = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditCaption(post.caption ?? "");
    setEditGenre(post.genre ?? "");
    setEditLanguage(post.language ?? "");
    setEditVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!post) return;
    if (!editTitle.trim()) {
      Alert.alert("Title required", "Please enter a title.");
      return;
    }
    setIsSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const serverPost = await patchPost(token, post.id, {
        title: editTitle.trim(),
        caption: editCaption.trim() || undefined,
        genre: editGenre.trim() || undefined,
        language: editLanguage.trim() || undefined,
      });
      const updated: ApiPost = serverPost;
      setPost(updated);
      patchInFeed(String(post.id), {
        title: updated.title,
        caption: updated.caption ?? "",
        genre: updated.genre ?? undefined,
        language: updated.language ?? "English",
      });
      setEditVisible(false);
    } catch {
      Alert.alert("Save failed", "Could not update this post. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!post) return;
    Alert.alert(
      "Delete post?",
      "Delete this Music Minute? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const token = await getToken();
              if (!token) throw new Error("Not authenticated");
              await deletePost(token, post.id);
              removeFromFeed(String(post.id));
              adjustPostCount(-1);
              router.back();
            } catch {
              setIsDeleting(false);
              Alert.alert("Delete failed", "Could not delete this post. Please try again.");
            }
          },
        },
      ],
    );
  };

  const showOwnerMenu = () => {
    Alert.alert(
      post?.title ?? "Music Minute",
      undefined,
      [
        { text: "Edit post", onPress: openEdit },
        { text: "Delete post", style: "destructive", onPress: handleDelete },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Music Minute</Text>
        {isOwner ? (
          <TouchableOpacity onPress={showOwnerMenu} style={styles.menuBtn} activeOpacity={0.7} disabled={isDeleting}>
            {isDeleting
              ? <ActivityIndicator size="small" color={colors.mutedForeground} />
              : <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A855F7" size="large" />
        </View>
      ) : error || !post ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Post not found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.thumbnailWrapper}>
            {post.videoUrl && !videoError ? (
              <>
                <Video
                  ref={videoRef}
                  source={{ uri: post.videoUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay={false}
                  isLooping
                  isMuted={false}
                  onPlaybackStatusUpdate={(status) => {
                    if (status.isLoaded) {
                      setIsPlaying(status.isPlaying);
                    }
                  }}
                  onError={() => setVideoError(true)}
                />
                <LinearGradient
                  colors={["transparent", "rgba(5,2,10,0.75)"]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Pressable style={StyleSheet.absoluteFill} onPress={handleVideoTap} />
                <Animated.View
                  style={[styles.tapIconOverlay, { opacity: tapIconOpacity }]}
                  pointerEvents="none"
                >
                  <View style={styles.tapIconCircle}>
                    <Ionicons
                      name={tapIcon === "play" ? "play" : "pause"}
                      size={36}
                      color="#fff"
                    />
                  </View>
                </Animated.View>
                {!isPlaying && (
                  <Pressable style={styles.playBtnOverlay} onPress={handleVideoTap}>
                    <View style={styles.playBtn}>
                      <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 4 }} />
                    </View>
                  </Pressable>
                )}
              </>
            ) : post.videoUrl && videoError ? (
              <>
                <Image
                  source={placeholderImg}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(5,2,10,0.85)"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.videoErrorOverlay}>
                  <Ionicons name="alert-circle-outline" size={36} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.videoErrorText}>Video failed to load</Text>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => setVideoError(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Image
                  source={placeholderImg}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(5,2,10,0.85)"]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            )}
            <View style={styles.thumbnailBadge}>
              <Ionicons name="musical-notes" size={14} color="#fff" />
              <Text style={styles.thumbnailBadgeText}>Music Minute</Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={[styles.title, { color: colors.foreground }]}>{post.title}</Text>

            {!!post.caption && (
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{post.caption}</Text>
            )}

            {(post.trackTitle || post.trackArtist) && (
              <View style={[styles.trackRow, { borderColor: colors.border }]}>
                <Ionicons name="musical-note" size={14} color="#A855F7" />
                <Text style={[styles.trackText, { color: colors.mutedForeground }]}>
                  {[post.trackTitle, post.trackArtist].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}

            <View style={styles.stats}>
              <StatPill icon={isLiked ? "heart" : "heart-outline"} value={post.likesCount} color="#EC4899" />
              <StatPill icon="chatbubble-outline" value={post.commentsCount} color="#3B82F6" />
              <StatPill icon="mic" value={post.goldenMicCount} color="#F59E0B" />
              {isSaved && <StatPill icon="bookmark" value={post.savesCount} color="#A855F7" />}
            </View>

            <TouchableOpacity
              style={styles.creatorCard}
              activeOpacity={0.8}
              onPress={() => router.push(`/creator/${post.creator.username}`)}
            >
              {post.creator.avatarUrl ? (
                <Image source={{ uri: post.creator.avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>
                    {(post.creator.displayName ?? post.creator.username)[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.creatorInfo}>
                <Text style={[styles.creatorDisplay, { color: colors.foreground }]}>
                  {post.creator.displayName}
                </Text>
                <Text style={[styles.creatorUsername, { color: colors.mutedForeground }]}>
                  @{post.creator.username}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {(post.genre || post.language || post.performanceType) && (
              <View style={styles.tags}>
                {post.genre && (
                  <View style={[styles.tag, { borderColor: colors.border }]}>
                    {post.genreDetectionSource === "musixmatch_metadata" && (
                      <MaterialCommunityIcons
                        name="music-note"
                        size={11}
                        color="#A78BFA"
                        style={{ marginRight: 3 }}
                      />
                    )}
                    <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{post.genre}</Text>
                  </View>
                )}
                {post.language && (
                  <View style={[styles.tag, { borderColor: colors.border }]}>
                    <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{post.language}</Text>
                  </View>
                )}
                {post.performanceType && (
                  <View style={[styles.tag, { borderColor: colors.border }]}>
                    <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                      {post.performanceType}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {isOwner && (
              <View style={styles.ownerActions}>
                <TouchableOpacity
                  style={[styles.ownerBtn, { borderColor: colors.border }]}
                  activeOpacity={0.8}
                  onPress={openEdit}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.foreground} />
                  <Text style={[styles.ownerBtnText, { color: colors.foreground }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ownerBtn, styles.deleteBtn]}
                  activeOpacity={0.8}
                  onPress={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? <ActivityIndicator size="small" color="#EF4444" />
                    : <Ionicons name="trash-outline" size={16} color="#EF4444" />}
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {(relatedLoading || relatedPosts.length > 0) && (
            <View style={styles.relatedSection}>
              <Text style={[styles.relatedTitle, { color: colors.foreground }]}>
                More from {post.creator.displayName ?? post.creator.username}
              </Text>
              {relatedLoading ? (
                <ActivityIndicator color="#A855F7" size="small" style={{ marginTop: 12 }} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.relatedScroll}
                >
                  {relatedPosts.map((rp) => {
                    const rpPlaceholder = SINGER_IMAGES[rp.id % SINGER_IMAGES.length];
                    const rpThumbnailSource = rp.thumbnailUrl
                      ? { uri: rp.thumbnailUrl }
                      : rpPlaceholder;
                    return (
                      <TouchableOpacity
                        key={rp.id}
                        style={[styles.relatedTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                        activeOpacity={0.85}
                        onPress={() => {
                          const nextDepth = depth + 1;
                          if (depth >= MAX_POST_DEPTH) {
                            router.replace(`/post/${rp.id}?depth=${MAX_POST_DEPTH}`);
                          } else {
                            router.push(`/post/${rp.id}?depth=${nextDepth}`);
                          }
                        }}
                      >
                        <Image
                          source={rpThumbnailSource}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                        <LinearGradient
                          colors={["transparent", "rgba(5,2,10,0.92)"]}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.relatedTileOverlay}>
                          {rp.genre ? (
                            <View style={styles.relatedGenreChip}>
                              {rp.genreDetectionSource === "musixmatch_metadata" && (
                                <MaterialCommunityIcons name="music-note" size={8} color="#A78BFA" />
                              )}
                              <Text style={styles.relatedGenreText} numberOfLines={1}>{rp.genre}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.relatedTileTitle} numberOfLines={2}>{rp.title}</Text>
                          <View style={styles.relatedTileStats}>
                            <Ionicons name="heart" size={10} color="#EF4444" />
                            <Text style={styles.relatedTileStatText}>{formatCount(rp.likesCount)}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Post</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Post title"
              placeholderTextColor={colors.mutedForeground}
              maxLength={120}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Caption</Text>
            <TextInput
              style={[styles.textInput, styles.captionInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editCaption}
              onChangeText={setEditCaption}
              placeholder="Add a caption…"
              placeholderTextColor={colors.mutedForeground}
              maxLength={300}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.twoCol}>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Genre</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={editGenre}
                  onChangeText={setEditGenre}
                  placeholder="e.g. Pop"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={40}
                  returnKeyType="next"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Language</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={editLanguage}
                  onChangeText={setEditLanguage}
                  placeholder="e.g. English"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={40}
                  returnKeyType="done"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSaveEdit}
              activeOpacity={0.85}
              disabled={isSaving}
              style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            >
              <LinearGradient
                colors={["#A855F7", "#EC4899"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtnGradient}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
  },
  headerSpacer: { width: 36 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: { fontSize: 16, marginTop: 8 },
  content: { paddingBottom: 32 },
  thumbnailWrapper: {
    width: "100%",
    height: 320,
    backgroundColor: "#1a0f2e",
    position: "relative",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  thumbnailBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    position: "absolute",
    bottom: 12,
    left: 16,
    backgroundColor: "rgba(168,85,247,0.8)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  thumbnailBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  playBtnOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
  },
  tapIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  tapIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  videoErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(5,2,10,0.5)",
  },
  videoErrorText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(168,85,247,0.8)",
  },
  retryBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  body: { padding: 20, gap: 16 },
  title: { fontSize: 22, fontWeight: "800", lineHeight: 28 },
  caption: { fontSize: 14, lineHeight: 20 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  trackText: { fontSize: 13, flex: 1 },
  stats: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillText: { fontSize: 13, fontWeight: "600" },
  creatorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.08)",
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: "#A855F7",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 18, fontWeight: "700" },
  creatorInfo: { flex: 1 },
  creatorDisplay: { fontSize: 15, fontWeight: "700" },
  creatorUsername: { fontSize: 13, marginTop: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  tagText: { fontSize: 12, fontWeight: "500" },
  ownerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  ownerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  ownerBtnText: { fontSize: 14, fontWeight: "600" },
  deleteBtn: {
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.07)",
  },
  deleteBtnText: { fontSize: 14, fontWeight: "600", color: "#EF4444" },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
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
  captionInput: {
    minHeight: 72,
    paddingTop: 12,
  },
  twoCol: { flexDirection: "row", gap: 10 },
  halfField: { flex: 1, gap: 4 },
  saveBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  saveBtnGradient: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  relatedSection: { paddingTop: 4, paddingBottom: 8 },
  relatedTitle: { fontSize: 16, fontWeight: "800", paddingHorizontal: 20, marginBottom: 12 },
  relatedScroll: { paddingHorizontal: 20, gap: 10 },
  relatedTile: {
    width: 120,
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  relatedTileOverlay: { position: "absolute", bottom: 8, left: 8, right: 8, gap: 3 },
  relatedGenreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  relatedGenreText: { color: "#CBD5E1", fontSize: 8, fontWeight: "600" },
  relatedTileTitle: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14 },
  relatedTileStats: { flexDirection: "row", alignItems: "center", gap: 4 },
  relatedTileStatText: { color: "rgba(255,255,255,0.6)", fontSize: 10 },
});

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/expo";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { ApiPost, getPost } from "@/lib/api";
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const { likedIds, savedIds } = useApp();

  const [post, setPost] = useState<ApiPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const postId = parseInt(id ?? "", 10);
    if (isNaN(postId)) {
      setError(true);
      setLoading(false);
      return;
    }
    (async () => {
      const token = await getToken();
      if (!token) {
        setError(true);
        setLoading(false);
        return;
      }
      try {
        const p = await getPost(token, postId);
        setPost(p);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isLiked = post ? likedIds.has(String(post.id)) : false;
  const isSaved = post ? savedIds.has(String(post.id)) : false;
  const placeholderImg = post ? SINGER_IMAGES[post.id % SINGER_IMAGES.length] : SINGER_IMAGES[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Music Minute</Text>
        <View style={styles.headerSpacer} />
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
            <Image
              source={post.thumbnailUrl ? { uri: post.thumbnailUrl } : placeholderImg}
              style={styles.thumbnail}
              contentFit="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(5,2,10,0.85)"]}
              style={StyleSheet.absoluteFill}
            />
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
          </View>
        </ScrollView>
      )}
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
    height: 260,
    backgroundColor: "#1a0f2e",
    position: "relative",
    justifyContent: "flex-end",
  },
  thumbnail: { ...StyleSheet.absoluteFillObject },
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
  },
  tagText: { fontSize: 12, fontWeight: "500" },
});

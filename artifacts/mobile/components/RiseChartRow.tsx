import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useApp } from "@/context/AppContext";
import { User, formatCount } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

interface Props {
  user: User;
  rank: number;
}

const RANK_COLORS = ["#F59E0B", "#9CA3AF", "#B45309"];

export function RiseChartRow({ user, rank }: Props) {
  const colors = useColors();
  const { followingIds, toggleFollow, currentUser } = useApp();
  const isFollowing = followingIds.has(user.id);

  const rankColor = rank <= 3 ? RANK_COLORS[rank - 1] : colors.mutedForeground;

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/creator/${user.username}`)}
      activeOpacity={0.8}
    >
      <Text style={[styles.rank, { color: rankColor, fontWeight: rank <= 3 ? "800" : "600" }]}>
        #{rank}
      </Text>

      <View style={[styles.avatar, { backgroundColor: user.avatarColor }]}>
        <Text style={styles.avatarText}>{user.avatarInitials}</Text>
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>
            @{user.username}
          </Text>
          {user.liveEligible && (
            <View style={[styles.eligibleBadge, { backgroundColor: `${colors.gold}20`, borderColor: `${colors.gold}50` }]}>
              <Ionicons name="radio" size={10} color={colors.gold} />
              <Text style={[styles.eligibleText, { color: colors.gold }]}>Live</Text>
            </View>
          )}
        </View>
        <Text style={[styles.genre, { color: colors.mutedForeground }]} numberOfLines={1}>
          {user.genre} · {user.location}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="microphone" size={12} color={colors.gold} />
            <Text style={[styles.statText, { color: colors.gold }]}>
              {formatCount(user.totalGoldenMics)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="heart" size={12} color={colors.accent} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>
              {formatCount(user.totalLikes)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="trending-up" size={12} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.primary }]}>
              {formatCount(user.riseScore)}
            </Text>
          </View>
        </View>
      </View>

      {currentUser && (
        <TouchableOpacity
          onPress={() => toggleFollow(user.id)}
          style={[
            styles.followBtn,
            {
              backgroundColor: isFollowing ? "transparent" : colors.primary,
              borderColor: isFollowing ? colors.border : colors.primary,
            },
          ]}
          activeOpacity={0.8}
        >
          <Text style={[styles.followText, { color: isFollowing ? colors.mutedForeground : "#fff" }]}>
            {isFollowing ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  rank: {
    fontSize: 15,
    width: 30,
    textAlign: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  username: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  eligibleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  eligibleText: {
    fontSize: 9,
    fontWeight: "700",
  },
  genre: {
    fontSize: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    fontSize: 11,
    fontWeight: "600",
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  followText: {
    fontSize: 12,
    fontWeight: "700",
  },
});

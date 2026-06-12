import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChallengeCard } from "@/components/ChallengeCard";
import { RiseChartRow } from "@/components/RiseChartRow";
import { useApp } from "@/context/AppContext";
import { SEED_CHALLENGES, User, formatCount } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

const GENRES = ["Pop", "R&B", "Soul", "Rap", "Acoustic", "Indie", "Latin Pop", "Arabic Pop", "Singer-Songwriter"];

function SingerCard({ user }: { user: User }) {
  const colors = useColors();
  const { followingIds, toggleFollow, currentUser } = useApp();
  const isFollowing = followingIds.has(user.id);

  return (
    <TouchableOpacity
      style={[styles.singerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/creator/${user.username}`)}
      activeOpacity={0.8}
    >
      <View style={[styles.singerAvatar, { backgroundColor: user.avatarColor }]}>
        <Text style={styles.singerAvatarText}>{user.avatarInitials}</Text>
        {user.liveEligible && (
          <View style={styles.liveDot}>
            <Ionicons name="radio" size={8} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[styles.singerUsername, { color: colors.foreground }]} numberOfLines={1}>
        @{user.username}
      </Text>
      <Text style={[styles.singerGenre, { color: colors.mutedForeground }]} numberOfLines={1}>
        {user.genre}
      </Text>
      <View style={styles.singerStats}>
        <MaterialCommunityIcons name="microphone" size={10} color={colors.gold} />
        <Text style={[styles.singerStatText, { color: colors.gold }]}>
          {formatCount(user.totalGoldenMics)}
        </Text>
      </View>
      {currentUser && (
        <TouchableOpacity
          onPress={() => toggleFollow(user.id)}
          style={[
            styles.miniFollowBtn,
            {
              backgroundColor: isFollowing ? "transparent" : colors.primary,
              borderColor: isFollowing ? colors.border : colors.primary,
            },
          ]}
          activeOpacity={0.8}
        >
          <Text style={[styles.miniFollowText, { color: isFollowing ? colors.mutedForeground : "#fff" }]}>
            {isFollowing ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { users, musicMinutes } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const filteredUsers = useMemo(() => {
    let result = users.filter((u) => u.isCreator);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.genre.toLowerCase().includes(q) ||
          u.location.toLowerCase().includes(q)
      );
    }
    if (activeGenre) {
      result = result.filter((u) => u.genre.toLowerCase().includes(activeGenre.toLowerCase()));
    }
    return result;
  }, [users, searchQuery, activeGenre]);

  const topRisingUsers = [...users]
    .filter((u) => u.isCreator)
    .sort((a, b) => b.riseScore - a.riseScore)
    .slice(0, 5);

  const trendingMMs = [...musicMinutes].sort((a, b) => b.views - a.views).slice(0, 3);

  const isSearching = searchQuery.trim() || activeGenre;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Discover</Text>
        <TouchableOpacity onPress={() => router.push("/rise-chart")} activeOpacity={0.8}>
          <View style={[styles.riseChartBtn, { backgroundColor: `${colors.gold}15`, borderColor: `${colors.gold}40` }]}>
            <Ionicons name="trophy-outline" size={14} color={colors.gold} />
            <Text style={[styles.riseChartText, { color: colors.gold }]}>Rise Chart</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search singers, songs, genres..."
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreScroll} contentContainerStyle={styles.genreList}>
        {GENRES.map((genre) => (
          <TouchableOpacity
            key={genre}
            onPress={() => setActiveGenre(activeGenre === genre ? null : genre)}
            style={[
              styles.genreTag,
              {
                backgroundColor: activeGenre === genre ? colors.primary : colors.muted,
                borderColor: activeGenre === genre ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <Text style={[styles.genreTagText, { color: activeGenre === genre ? "#fff" : colors.mutedForeground }]}>
              {genre}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isSearching ? (
        <FlatList
          data={filteredUsers}
          keyExtractor={(u) => u.id}
          renderItem={({ item, index }) => <RiseChartRow user={item} rank={index + 1} />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.noResultsText, { color: colors.mutedForeground }]}>
                No singers found
              </Text>
            </View>
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trending Singers</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.singersRow}>
              {topRisingUsers.map((user) => (
                <SingerCard key={user.id} user={user} />
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Challenges</Text>
              <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
            </View>
            <View style={styles.challengesList}>
              {SEED_CHALLENGES.map((ch) => (
                <ChallengeCard key={ch.id} challenge={ch} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rising Voices</Text>
              <TouchableOpacity onPress={() => router.push("/rise-chart")} activeOpacity={0.8}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>Full Chart</Text>
              </TouchableOpacity>
            </View>
            {topRisingUsers.map((user, idx) => (
              <RiseChartRow key={user.id} user={user} rank={idx + 1} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
  },
  riseChartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  riseChartText: {
    fontSize: 12,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  genreScroll: {
    maxHeight: 40,
    marginBottom: 4,
  },
  genreList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreTagText: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "600",
  },
  singersRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  singerCard: {
    width: 130,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  singerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  singerAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  liveDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EC4899",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#110C1E",
  },
  singerUsername: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  singerGenre: {
    fontSize: 11,
    textAlign: "center",
  },
  singerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  singerStatText: {
    fontSize: 11,
    fontWeight: "600",
  },
  miniFollowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 2,
  },
  miniFollowText: {
    fontSize: 11,
    fontWeight: "700",
  },
  challengesList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  noResults: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },
  noResultsText: {
    fontSize: 15,
  },
});

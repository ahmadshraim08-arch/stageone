import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RiseChartRow } from "@/components/RiseChartRow";
import { useApp } from "@/context/AppContext";
import { User } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

type SortBy = "riseScore" | "goldenMics" | "followers" | "likes";

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "riseScore", label: "Rise Score" },
  { value: "goldenMics", label: "Golden Mics" },
  { value: "followers", label: "Followers" },
  { value: "likes", label: "Likes" },
];

export default function RiseChartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { users } = useApp();
  const [sortBy, setSortBy] = useState<SortBy>("riseScore");

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const sortedUsers: User[] = [...users]
    .filter((u) => u.isCreator)
    .sort((a, b) => {
      switch (sortBy) {
        case "goldenMics": return b.totalGoldenMics - a.totalGoldenMics;
        case "followers": return b.followersCount - a.followersCount;
        case "likes": return b.totalLikes - a.totalLikes;
        default: return b.riseScore - a.riseScore;
      }
    });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.subHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.subHeaderDesc, { color: colors.mutedForeground }]}>
          Rankings update in real time based on Golden Mics, likes, views, and engagement.
        </Text>
      </View>

      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setSortBy(opt.value)}
            style={[
              styles.sortChip,
              {
                backgroundColor: sortBy === opt.value ? colors.primary : colors.muted,
                borderColor: sortBy === opt.value ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <Text style={[styles.sortChipText, { color: sortBy === opt.value ? "#fff" : colors.mutedForeground }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={sortedUsers}
        keyExtractor={(u) => u.id}
        renderItem={({ item, index }) => <RiseChartRow user={item} rank={index + 1} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={[styles.topThreeBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="trophy" size={18} color={colors.gold} />
            <Text style={[styles.topThreeText, { color: colors.foreground }]}>
              Top 3 this week are eligible for StageOne Live
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  subHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  subHeaderDesc: { fontSize: 13, lineHeight: 18 },
  sortRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexWrap: "wrap",
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortChipText: { fontSize: 12, fontWeight: "600" },
  topThreeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  topThreeText: { fontSize: 13, fontWeight: "600", flex: 1 },
});

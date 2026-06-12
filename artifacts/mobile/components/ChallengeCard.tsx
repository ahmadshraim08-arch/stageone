import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Challenge, formatCount } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

interface Props {
  challenge: Challenge;
}

export function ChallengeCard({ challenge }: Props) {
  const colors = useColors();

  const timeLeft = () => {
    const diff = new Date(challenge.endsAt).getTime() - Date.now();
    const days = Math.floor(diff / 86400000);
    if (days <= 0) return "Ended";
    if (days === 1) return "1 day left";
    return `${days} days left`;
  };

  const handleJoin = () => {
    router.push("/(tabs)/post");
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: `${challenge.accentColor}40`,
        },
      ]}
    >
      <LinearGradient
        colors={[`${challenge.accentColor}15`, "transparent"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: `${challenge.accentColor}25`, borderColor: `${challenge.accentColor}60` }]}>
          <Ionicons name="trophy-outline" size={12} color={challenge.accentColor} />
          <Text style={[styles.badgeText, { color: challenge.accentColor }]}>
            {challenge.genre}
          </Text>
        </View>
        <Text style={[styles.timeLeft, { color: colors.mutedForeground }]}>
          {timeLeft()}
        </Text>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
        {challenge.title}
      </Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
        {challenge.description}
      </Text>
      {challenge.trackTitle && (
        <View style={styles.songRow}>
          <Ionicons name="musical-note" size={12} color={challenge.accentColor} />
          <Text style={[styles.songText, { color: challenge.accentColor }]} numberOfLines={1}>
            {challenge.trackTitle}
            {challenge.artistName ? ` — ${challenge.artistName}` : ""}
          </Text>
        </View>
      )}
      <View style={styles.footer}>
        <View style={styles.entriesRow}>
          <Ionicons name="people-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.entries, { color: colors.mutedForeground }]}>
            {formatCount(challenge.entriesCount)} entries
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleJoin}
          activeOpacity={0.8}
          style={[styles.joinBtn, { backgroundColor: challenge.accentColor }]}
        >
          <Text style={styles.joinText}>Join</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    overflow: "hidden",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  timeLeft: {
    fontSize: 11,
    fontWeight: "500",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  songText: {
    fontSize: 12,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  entriesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  entries: {
    fontSize: 12,
  },
  joinBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, router } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useApp } from "@/context/AppContext";
import { SEED_CHALLENGES, formatCount, getUserById } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

const LANG_LABELS: Record<string, string> = {
  en: "EN",
  es: "ES",
  ar: "AR",
  fr: "FR",
  pt: "PT",
};

export default function LyricChallengeScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { musicMinutes } = useApp();

  const challenge = SEED_CHALLENGES.find((ch) => ch.id === id);

  if (!challenge || challenge.challengeType !== "lyric_stage") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <MaterialCommunityIcons name="music-off" size={48} color={colors.mutedForeground} />
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Challenge not found</Text>
      </View>
    );
  }

  const performers = musicMinutes.filter(
    (mm) =>
      mm.musixmatchTrackId === challenge.musixmatchTrackId &&
      mm.lyricSection !== undefined &&
      (challenge.lyricSectionId === undefined ||
        mm.lyricSection.sectionId === challenge.lyricSectionId),
  );

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[`${challenge.accentColor}28`, "transparent"]}
          style={styles.heroGradient}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="musical-note" size={13} color={challenge.accentColor} />
            <Text style={[styles.heroBadgeText, { color: challenge.accentColor }]}>
              LyricStage Challenge
            </Text>
          </View>

          <Text style={[styles.challengeTitle, { color: colors.foreground }]}>
            {challenge.title}
          </Text>

          {challenge.trackTitle && (
            <View style={styles.trackRow}>
              <Ionicons name="musical-notes" size={13} color={colors.mutedForeground} />
              <Text style={[styles.trackText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {challenge.trackTitle}
                {challenge.artistName ? ` — ${challenge.artistName}` : ""}
              </Text>
            </View>
          )}

          {challenge.lyricSectionLabel && (
            <View style={[styles.sectionBadge, { backgroundColor: `${challenge.accentColor}18`, borderColor: `${challenge.accentColor}40` }]}>
              <Text style={[styles.sectionBadgeText, { color: challenge.accentColor }]}>
                {challenge.lyricSectionLabel}
              </Text>
            </View>
          )}

          <Text style={[styles.challengeDesc, { color: colors.mutedForeground }]}>
            {challenge.description}
          </Text>

          <View style={[styles.statsRow, { borderColor: colors.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {formatCount(challenge.entriesCount)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Entries</Text>
            </View>
            {challenge.performerCount !== undefined && (
              <View style={[styles.statItem, { borderLeftWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {formatCount(challenge.performerCount)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Performers</Text>
              </View>
            )}
            <View style={[styles.statItem, { borderLeftWidth: 1, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {new Date(challenge.endsAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Ends</Text>
            </View>
          </View>

          {challenge.representedLanguages && challenge.representedLanguages.length > 0 && (
            <View style={styles.langRow}>
              <Text style={[styles.langLabel, { color: colors.mutedForeground }]}>Sung in:</Text>
              {challenge.representedLanguages.map((lang) => (
                <View
                  key={lang}
                  style={[styles.langPill, { backgroundColor: `${challenge.accentColor}20`, borderColor: `${challenge.accentColor}50` }]}
                >
                  <Text style={[styles.langPillText, { color: challenge.accentColor }]}>
                    {LANG_LABELS[lang] ?? lang.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent Performances
          </Text>

          {performers.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="microphone-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Be the First</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No performances yet. Join and kick things off.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.performanceList}
            >
              {performers.map((mm) => {
                const creator = getUserById(mm.userId);
                return (
                  <View
                    key={mm.id}
                    style={[styles.performanceCard, { borderColor: `${challenge.accentColor}30` }]}
                  >
                    <Image
                      source={SINGER_IMAGES[mm.imageIndex % 3]}
                      style={styles.performanceImage}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(5,2,10,0.92)"]}
                      locations={[0.4, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View
                      style={[styles.lyricBadge, { backgroundColor: `${challenge.accentColor}CC` }]}
                    >
                      <Ionicons name="musical-note" size={9} color="#fff" />
                      <Text style={styles.lyricBadgeText}>LyricStage</Text>
                    </View>
                    <View style={styles.cardBottom}>
                      <View
                        style={[styles.cardAvatar, { backgroundColor: creator?.avatarColor ?? "#A855F7" }]}
                      >
                        <Text style={styles.cardAvatarText}>
                          {creator?.avatarInitials ?? "?"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardUsername} numberOfLines={1}>
                          @{creator?.username ?? mm.userId}
                        </Text>
                        {mm.lyricSection && (
                          <Text style={styles.cardSection} numberOfLines={1}>
                            {mm.lyricSection.sectionLabel}
                            {mm.lyricSection.startMs !== undefined
                              ? ` · ${formatMs(mm.lyricSection.startMs)}`
                              : ""}
                          </Text>
                        )}
                      </View>
                      <View style={styles.cardLikes}>
                        <Ionicons name="heart" size={12} color="#EF4444" />
                        <Text style={styles.cardLikesText}>{formatCount(mm.likesCount)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <View style={[styles.joinFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/(tabs)/post",
              params: {
                prefillTrackId: challenge.musixmatchTrackId ?? "",
                prefillSectionId: challenge.lyricSectionId ?? "",
              },
            })
          }
          style={styles.joinBtn}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[challenge.accentColor, "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.joinBtnGradient}
          >
            <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
            <Text style={styles.joinBtnText}>Join This Challenge</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  notFoundText: {
    fontSize: 15,
    marginTop: 12,
  },
  heroGradient: {
    padding: 20,
    paddingTop: 24,
    gap: 12,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  challengeTitle: {
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trackText: {
    fontSize: 13,
    flex: 1,
  },
  sectionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  challengeDesc: {
    fontSize: 14,
    lineHeight: 21,
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
  },
  statItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  langLabel: {
    fontSize: 12,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  langPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    paddingTop: 8,
    paddingHorizontal: 20,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  performanceList: {
    gap: 12,
    paddingRight: 4,
  },
  performanceCard: {
    width: 180,
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  performanceImage: {
    ...StyleSheet.absoluteFillObject,
  },
  lyricBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  lyricBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  cardBottom: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  cardUsername: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  cardSection: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    marginTop: 1,
  },
  cardLikes: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  cardLikesText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  joinFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  joinBtn: {
    borderRadius: 16,
    overflow: "hidden",
  },
  joinBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  joinBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldenMicModal } from "@/components/GoldenMicModal";
import { useApp } from "@/context/AppContext";
import { SEED_USERS, formatCount, getUserById } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

const SINGER_IMAGES = [
  require("@/assets/images/singer_placeholder_1.png"),
  require("@/assets/images/singer_placeholder_2.png"),
  require("@/assets/images/singer_placeholder_3.png"),
];

const LIVE_CHAT: Array<{ id: string; username: string; text: string; color: string }> = [
  { id: "1", username: "VocalQueen", text: "Goosebumps! That high note!", color: "#A855F7" },
  { id: "2", username: "MicLover", text: "This voice! Incredible", color: "#0EA5E9" },
  { id: "3", username: "StarGazer", text: "Future superstar right here!", color: "#EC4899" },
  { id: "4", username: "EchoFan", text: "That high note! Wow!", color: "#10B981" },
  { id: "5", username: "TuneMaster", text: "Pure emotion. So good.", color: "#F59E0B" },
  { id: "6", username: "MelodyMaker", text: "Rooting for you!", color: "#8B5CF6" },
  { id: "7", username: "SoulSeeker", text: "Golden Mic sent!", color: "#F97316" },
  { id: "8", username: "RisingFan", text: "StageOne Live needs this voice!", color: "#14B8A6" },
];

const ELIGIBILITY_ITEMS = [
  { label: "Account age: 7+ days", done: true },
  { label: "At least 3 Music Minutes", done: false },
  { label: "100+ followers", done: false },
  { label: "50 Golden Mics from unique users", done: false },
  { label: "2,000+ total views", done: false },
  { label: "Email verified", done: true },
];

function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const colors = useColors();
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    const update = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ h: 0, m: 0, s: 0 }); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ h, m, s });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <View style={styles.countdown}>
      {[{ val: timeLeft.h, label: "HRS" }, { val: timeLeft.m, label: "MIN" }, { val: timeLeft.s, label: "SEC" }].map(({ val, label }, i) => (
        <React.Fragment key={label}>
          {i > 0 && <Text style={[styles.countdownSep, { color: colors.mutedForeground }]}>:</Text>}
          <View style={[styles.countdownUnit, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.countdownNum, { color: colors.foreground }]}>{pad(val)}</Text>
            <Text style={[styles.countdownLabel, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export default function LiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, musicMinutes } = useApp();

  const [goldenMicVisible, setGoldenMicVisible] = useState(false);
  const [gmToast, setGmToast] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const nextEvent = new Date(Date.now() + 3 * 3600000 + 24 * 60000);
  const featuredCreator = SEED_USERS[0];
  const finalists = [SEED_USERS[0], SEED_USERS[1], SEED_USERS[2], SEED_USERS[3], SEED_USERS[4]];
  const topSupporters = [
    { username: "MicKing", count: 1200, color: "#F59E0B" },
    { username: "GoldenSoul", count: 980, color: "#9CA3AF" },
    { username: "SuperFan", count: 780, color: "#B45309" },
  ];

  const myMMs = currentUser ? musicMinutes.filter((m) => m.userId === currentUser.id) : [];
  const eligibilityItems = [
    { label: "Account age: 7+ days", done: true },
    { label: "At least 3 Music Minutes posted", done: myMMs.length >= 3 },
    { label: "100+ followers", done: false },
    { label: "50+ Golden Mics from unique users", done: false },
    { label: "2,000+ total views", done: myMMs.reduce((s, m) => s + m.views, 0) >= 2000 },
    { label: "Email verified", done: !!currentUser?.email },
  ];
  const eligibleCount = eligibilityItems.filter((e) => e.done).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={["#1A0F2E", "#05020A"]}
        style={[styles.heroGradient, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.liveHeader}>
          <View style={styles.liveBadgeRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <Text style={[styles.liveTitle, { color: colors.foreground }]}>StageOne Live</Text>
          </View>
          <Text style={[styles.liveSubtitle, { color: colors.mutedForeground }]}>
            Weekly live competition
          </Text>
        </View>

        <View style={[styles.featuredCard, { backgroundColor: "rgba(5,2,10,0.7)", borderColor: `${colors.primary}40` }]}>
          <Image
            source={SINGER_IMAGES[0]}
            style={styles.featuredImage}
            contentFit="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(5,2,10,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.featuredOverlay}>
            <View style={styles.featuredTop}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>LIVE  1.2K</Text>
              </View>
              <View style={[styles.showEnds, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.showEndsText}>Show ends in 23:47</Text>
              </View>
            </View>
            <View style={styles.featuredBottom}>
              <View style={styles.featuredInfo}>
                <Text style={styles.featuredName}>@{featuredCreator.username}</Text>
                <Text style={styles.featuredSong}>Original Song — Written From The Heart</Text>
                <View style={styles.rankRow}>
                  <Text style={[styles.rankText, { color: colors.gold }]}>RANK 3</Text>
                  <Text style={[styles.nextRank, { color: colors.mutedForeground }]}>TO NEXT  854</Text>
                </View>
              </View>
              <View style={styles.featuredGM}>
                <MaterialCommunityIcons name="microphone" size={28} color={colors.gold} />
                <Text style={[styles.featuredGMCount, { color: colors.gold }]}>
                  {formatCount(featuredCreator.totalGoldenMics)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.chatList}>
          {LIVE_CHAT.map((msg) => (
            <View key={msg.id} style={styles.chatMsg}>
              <Text style={[styles.chatUsername, { color: msg.color }]}>{msg.username}</Text>
              <Text style={[styles.chatText, { color: "rgba(255,255,255,0.8)" }]}>{msg.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => setGoldenMicVisible(true)}
          activeOpacity={0.85}
          style={styles.gmBtn}
        >
          <LinearGradient
            colors={["#F59E0B", "#D97706", "#B45309"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gmBtnGradient}
          >
            <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
            <Text style={styles.gmBtnText}>Support with Golden Mic</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Next Show</Text>
        <CountdownTimer targetDate={nextEvent} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Supporters</Text>
        <View style={styles.supportersRow}>
          {topSupporters.map((s, i) => (
            <View key={s.username} style={[styles.supporterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.supporterRank, { color: ["#F59E0B", "#9CA3AF", "#B45309"][i] }]}>#{i + 1}</Text>
              <View style={[styles.supporterAvatar, { backgroundColor: s.color }]}>
                <Text style={styles.supporterAvatarText}>{s.username.charAt(0)}</Text>
              </View>
              <Text style={[styles.supporterName, { color: colors.foreground }]} numberOfLines={1}>@{s.username}</Text>
              <View style={styles.supporterGM}>
                <MaterialCommunityIcons name="microphone" size={10} color={colors.gold} />
                <Text style={[styles.supporterGMCount, { color: colors.gold }]}>{formatCount(s.count)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>This Week's Finalists</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.finalistsList}>
          {finalists.map((user) => (
            <TouchableOpacity
              key={user.id}
              onPress={() => router.push(`/creator/${user.username}`)}
              style={[styles.finalistCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <View style={[styles.finalistAvatar, { backgroundColor: user.avatarColor }]}>
                <Text style={styles.finalistAvatarText}>{user.avatarInitials}</Text>
                <View style={styles.finalistLiveDot} />
              </View>
              <Text style={[styles.finalistName, { color: colors.foreground }]} numberOfLines={1}>
                @{user.username}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.section, { marginHorizontal: 16 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {currentUser ? "Your Live Eligibility" : "StageOne Live Eligibility"}
        </Text>
        <Text style={[styles.eligibilitySubtitle, { color: colors.mutedForeground }]}>
          StageOne Live is where top rising singers perform in front of the community. Fans support them with Golden Mics, and top voices win the spotlight.
        </Text>
        <View style={[styles.eligibilityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.eligibilityHeader}>
            <Text style={[styles.eligibilityProgress, { color: colors.foreground }]}>
              {eligibleCount}/{eligibilityItems.length} requirements met
            </Text>
            {eligibleCount === eligibilityItems.length && (
              <View style={[styles.eligibleBadge, { backgroundColor: `${colors.gold}20`, borderColor: `${colors.gold}50` }]}>
                <Ionicons name="radio" size={12} color={colors.gold} />
                <Text style={[styles.eligibleText, { color: colors.gold }]}>Live Ready</Text>
              </View>
            )}
          </View>
          {eligibilityItems.map((item, i) => (
            <View key={i} style={styles.eligibilityItem}>
              <Ionicons
                name={item.done ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={item.done ? "#10B981" : colors.mutedForeground}
              />
              <Text style={[styles.eligibilityItemText, { color: item.done ? colors.foreground : colors.mutedForeground }]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
        {!currentUser && (
          <TouchableOpacity
            onPress={() => router.push("/onboarding")}
            activeOpacity={0.85}
            style={{ borderRadius: 16, overflow: "hidden", marginTop: 12 }}
          >
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Join StageOne to Track Progress</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {gmToast && (
        <View style={[styles.toast, { backgroundColor: "rgba(5,2,10,0.95)", borderColor: `${colors.gold}40` }]}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={[styles.toastText, { color: "#fff" }]}>Golden Mic sent. You helped this artist rise.</Text>
        </View>
      )}

      <GoldenMicModal
        visible={goldenMicVisible}
        musicMinuteId="live_event_001"
        onClose={() => setGoldenMicVisible(false)}
        onSuccess={() => {
          setGmToast(true);
          setTimeout(() => setGmToast(false), 3000);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroGradient: { paddingHorizontal: 16, paddingBottom: 20, gap: 16 },
  liveHeader: { gap: 4 },
  liveBadgeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  liveBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  liveTitle: { fontSize: 22, fontWeight: "800" },
  liveSubtitle: { fontSize: 13 },
  featuredCard: {
    height: 300,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  featuredImage: { ...StyleSheet.absoluteFillObject },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 14,
  },
  featuredTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  livePillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  showEnds: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  showEndsText: { color: "#fff", fontSize: 11 },
  featuredBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  featuredInfo: { flex: 1 },
  featuredName: { color: "#fff", fontSize: 17, fontWeight: "800" },
  featuredSong: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  rankText: { fontSize: 12, fontWeight: "700" },
  nextRank: { fontSize: 12 },
  featuredGM: { alignItems: "center", gap: 2 },
  featuredGMCount: { fontSize: 14, fontWeight: "800" },
  chatList: { gap: 6 },
  chatMsg: { flexDirection: "row", gap: 6 },
  chatUsername: { fontSize: 12, fontWeight: "700", flexShrink: 0 },
  chatText: { fontSize: 12, flex: 1 },
  gmBtn: { borderRadius: 16, overflow: "hidden" },
  gmBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  gmBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  section: { paddingTop: 24, paddingHorizontal: 16, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  countdown: { flexDirection: "row", alignItems: "center", gap: 8 },
  countdownSep: { fontSize: 24, fontWeight: "700" },
  countdownUnit: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 70,
  },
  countdownNum: { fontSize: 28, fontWeight: "800" },
  countdownLabel: { fontSize: 10, fontWeight: "700" },
  supportersRow: { flexDirection: "row", gap: 10 },
  supporterCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  supporterRank: { fontSize: 11, fontWeight: "700" },
  supporterAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  supporterAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  supporterName: { fontSize: 11, fontWeight: "600" },
  supporterGM: { flexDirection: "row", alignItems: "center", gap: 3 },
  supporterGMCount: { fontSize: 11, fontWeight: "600" },
  finalistsList: { gap: 10, paddingVertical: 4 },
  finalistCard: {
    width: 90,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  finalistAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  finalistAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  finalistLiveDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#110C1E",
  },
  finalistName: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  eligibilitySubtitle: { fontSize: 13, lineHeight: 18 },
  eligibilityCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  eligibilityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eligibilityProgress: { fontSize: 14, fontWeight: "700" },
  eligibleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  eligibleText: { fontSize: 11, fontWeight: "700" },
  eligibilityItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  eligibilityItemText: { fontSize: 13, flex: 1 },
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
  toastText: { fontSize: 13, fontWeight: "600", flex: 1 },
});

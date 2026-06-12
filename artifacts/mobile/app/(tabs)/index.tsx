import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommentsSheet } from "@/components/CommentsSheet";
import { GoldenMicModal } from "@/components/GoldenMicModal";
import { MusicMinuteCard } from "@/components/MusicMinuteCard";
import { useApp } from "@/context/AppContext";
import { MusicMinute } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

type FeedTab = "forYou" | "following";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { musicMinutes, followingIds, currentUser } = useApp();

  const [activeTab, setActiveTab] = useState<FeedTab>("forYou");
  const [commentsMmId, setCommentsMmId] = useState<string | null>(null);
  const [goldenMicMmId, setGoldenMicMmId] = useState<string | null>(null);
  const [gmToast, setGmToast] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const feedData: MusicMinute[] =
    activeTab === "forYou"
      ? musicMinutes
      : musicMinutes.filter((mm) => followingIds.has(mm.userId));

  const handleTabChange = useCallback((tab: FeedTab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleGoldenMicSuccess = useCallback(() => {
    setGmToast(true);
    setTimeout(() => setGmToast(false), 3000);
  }, []);

  const cardHeight = Platform.OS === "web" ? 680 : screenHeight;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
        <Text style={styles.logo}>StageOne</Text>
        <View style={styles.tabsRow}>
          <Pressable onPress={() => handleTabChange("forYou")} style={styles.tabBtn}>
            <Text style={[styles.tabText, activeTab === "forYou" && styles.tabTextActive]}>
              For You
            </Text>
            {activeTab === "forYou" && <View style={styles.tabLine} />}
          </Pressable>
          <Pressable onPress={() => handleTabChange("following")} style={styles.tabBtn}>
            <Text style={[styles.tabText, activeTab === "following" && styles.tabTextActive]}>
              Following
            </Text>
            {activeTab === "following" && <View style={styles.tabLine} />}
          </Pressable>
        </View>
        <TouchableOpacity onPress={() => {}} style={styles.searchBtn} activeOpacity={0.7}>
          <Ionicons name="search" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {feedData.length === 0 ? (
        <View style={styles.emptyFeed}>
          <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {activeTab === "following" ? "No one followed yet" : "No videos yet"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            {activeTab === "following"
              ? "Follow some singers to see their Music Minutes here"
              : "Be the first to post a Music Minute"}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/discover")}
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyBtnText}>Discover Singers</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={feedData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MusicMinuteCard
              item={item}
              onCommentPress={(id) => setCommentsMmId(id)}
              onGoldenMicPress={(id) => {
                if (!currentUser) {
                  router.push("/onboarding");
                  return;
                }
                setGoldenMicMmId(id);
              }}
            />
          )}
          pagingEnabled
          snapToInterval={cardHeight}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: cardHeight,
            offset: cardHeight * index,
            index,
          })}
        />
      )}

      {gmToast && (
        <View style={styles.toast}>
          <Ionicons name="star" size={16} color="#F59E0B" />
          <Text style={styles.toastText}>Golden Mic sent. You helped this artist rise.</Text>
        </View>
      )}

      <CommentsSheet
        visible={!!commentsMmId}
        musicMinuteId={commentsMmId}
        onClose={() => setCommentsMmId(null)}
      />
      <GoldenMicModal
        visible={!!goldenMicMmId}
        musicMinuteId={goldenMicMmId}
        onClose={() => setGoldenMicMmId(null)}
        onSuccess={handleGoldenMicSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  logo: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 20,
  },
  tabBtn: {
    alignItems: "center",
    paddingBottom: 4,
  },
  tabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  tabLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  searchBtn: {
    padding: 2,
  },
  emptyFeed: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  toast: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "rgba(5,2,10,0.95)",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});

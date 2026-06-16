import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
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

const MIN_VIEW_DURATION_MS = 500;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { musicMinutes, followingFeed, followingLoading, fetchFollowingFeed, currentUser, isLoaded, feedLoading, refreshFeed, unreadNotifications, recordView } = useApp();

  const [activeTab, setActiveTab] = useState<FeedTab>("forYou");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [commentsMmId, setCommentsMmId] = useState<string | null>(null);
  const [goldenMicMmId, setGoldenMicMmId] = useState<string | null>(null);
  const [gmToast, setGmToast] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isScreenActive, setIsScreenActive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  // Refs for view-event tracking (stable across renders)
  const viewStartRef = useRef<{ id: string; startMs: number } | null>(null);
  const currentUserRef = useRef(currentUser);
  const recordViewRef = useRef(recordView);

  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { recordViewRef.current = recordView; }, [recordView]);

  const fireViewEvent = useCallback((postId: string, startMs: number) => {
    const user = currentUserRef.current;
    if (!user || user.isGuest) return;
    const watchDurationMs = Date.now() - startMs;
    if (watchDurationMs < MIN_VIEW_DURATION_MS) return;
    const numericId = parseInt(postId, 10);
    if (!isNaN(numericId)) {
      recordViewRef.current(numericId, watchDurationMs);
    }
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const incoming = viewableItems.length > 0
        ? (viewableItems[0].item as { id: string }).id
        : null;

      // Fire event for the post that just scrolled away
      const prev = viewStartRef.current;
      if (prev && prev.id !== incoming) {
        const user = currentUserRef.current;
        if (user && !user.isGuest) {
          const watchDurationMs = Date.now() - prev.startMs;
          if (watchDurationMs >= MIN_VIEW_DURATION_MS) {
            const numericId = parseInt(prev.id, 10);
            if (!isNaN(numericId)) {
              recordViewRef.current(numericId, watchDurationMs);
            }
          }
        }
        viewStartRef.current = null;
      }

      if (incoming) {
        setActiveId(incoming);
        if (!viewStartRef.current || viewStartRef.current.id !== incoming) {
          viewStartRef.current = { id: incoming, startMs: Date.now() };
        }
      } else {
        setActiveId(null);
      }
    }
  ).current;

  useFocusEffect(
    useCallback(() => {
      setIsScreenActive(true);
      // Reset watch start time when screen regains focus
      if (viewStartRef.current) {
        viewStartRef.current = { ...viewStartRef.current, startMs: Date.now() };
      }

      const subscription = AppState.addEventListener(
        "change",
        (state: AppStateStatus) => {
          if (state !== "active") {
            // App backgrounded — fire view event for the current post
            const prev = viewStartRef.current;
            if (prev) {
              fireViewEvent(prev.id, prev.startMs);
              // Reset so we don't double-count when app comes back
              viewStartRef.current = null;
            }
          } else {
            // App foregrounded — restart watch timer for the active post
            if (viewStartRef.current) {
              viewStartRef.current = { ...viewStartRef.current, startMs: Date.now() };
            }
          }
          setIsScreenActive(state === "active");
        }
      );

      return () => {
        // Screen lost focus — fire view event for the current post
        const prev = viewStartRef.current;
        if (prev) {
          fireViewEvent(prev.id, prev.startMs);
        }
        viewStartRef.current = null;
        setIsScreenActive(false);
        subscription.remove();
      };
    }, [fireViewEvent])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFeed();
    setRefreshing(false);
  }, [refreshFeed]);

  const rawFeedData: MusicMinute[] = activeTab === "forYou" ? musicMinutes : followingFeed;

  const feedGenres = useMemo(() => {
    const seen = new Set<string>();
    const genres: string[] = [];
    for (const mm of rawFeedData) {
      if (mm.genre && mm.genre !== "Any" && !seen.has(mm.genre)) {
        seen.add(mm.genre);
        genres.push(mm.genre);
      }
    }
    return genres;
  }, [rawFeedData]);

  const feedData: MusicMinute[] = useMemo(() => {
    if (!selectedGenre) return rawFeedData;
    return rawFeedData.filter(
      (mm) => mm.genre && mm.genre.toLowerCase().includes(selectedGenre.toLowerCase()),
    );
  }, [rawFeedData, selectedGenre]);

  const handleTabChange = useCallback((tab: FeedTab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    setSelectedGenre(null);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    if (tab === "following" && currentUser && !currentUser.isGuest) {
      fetchFollowingFeed();
    }
  }, [currentUser, fetchFollowingFeed]);

  const handleGenreSelect = useCallback((genre: string | null) => {
    Haptics.selectionAsync();
    setSelectedGenre(genre);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleGoldenMicSuccess = useCallback(() => {
    setGmToast(true);
    setTimeout(() => setGmToast(false), 3000);
  }, []);

  const cardHeight = Platform.OS === "web" ? 680 : screenHeight;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const showLoading = activeTab === "forYou" ? (!isLoaded || feedLoading) : followingLoading;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <LinearGradient
        colors={["rgba(5,2,10,0.9)", "rgba(5,2,10,0.5)", "transparent"]}
        style={[styles.headerGradient, { height: topPad + 130 }]}
        pointerEvents="none"
      />
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
        <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.searchBtn} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color="#fff" />
          {unreadNotifications > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {feedGenres.length > 0 && (
        <View style={[styles.genreRow, { top: topPad + 58 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genreRowContent}
          >
            <TouchableOpacity
              onPress={() => handleGenreSelect(null)}
              style={[
                styles.genreChip,
                !selectedGenre && styles.genreChipActive,
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.genreChipText, !selectedGenre && styles.genreChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {feedGenres.map((genre) => (
              <TouchableOpacity
                key={genre}
                onPress={() => handleGenreSelect(selectedGenre === genre ? null : genre)}
                style={[
                  styles.genreChip,
                  selectedGenre === genre && styles.genreChipActive,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.genreChipText,
                    selectedGenre === genre && styles.genreChipTextActive,
                  ]}
                >
                  {genre}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {showLoading && feedData.length === 0 ? (
        <View style={styles.loadingFeed}>
          <ActivityIndicator size="large" color="#A855F7" />
        </View>
      ) : feedData.length === 0 ? (
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
              isActive={item.id === activeId && isScreenActive}
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
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          refreshControl={
            currentUser && !currentUser.isGuest ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#A855F7"
                colors={["#A855F7"]}
              />
            ) : undefined
          }
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 1,
    zIndex: 9,
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
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EC4899",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
  },
  loadingFeed: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
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
  genreRow: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  genreRowContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
    paddingVertical: 6,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  genreChipActive: {
    backgroundColor: "#A855F7",
    borderColor: "#A855F7",
  },
  genreChipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
  },
  genreChipTextActive: {
    color: "#fff",
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

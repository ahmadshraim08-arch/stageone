import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { ApiNotification, getNotifications, markNotificationsRead } from "@/lib/api";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function notificationLabel(n: ApiNotification): string {
  const actor = n.actor?.displayName ?? "Someone";
  switch (n.type) {
    case "like": return `${actor} liked your Music Minute`;
    case "comment": return `${actor} commented on your Music Minute`;
    case "follow": return `${actor} started following you`;
    case "golden_mic": return `${actor} gave you a Golden Mic 🎤`;
    default: return `${actor} interacted with you`;
  }
}

function notificationIcon(type: string): string {
  switch (type) {
    case "like": return "heart";
    case "comment": return "chatbubble";
    case "follow": return "person-add";
    case "golden_mic": return "mic";
    default: return "notifications";
  }
}

function notificationColor(type: string): string {
  switch (type) {
    case "like": return "#EC4899";
    case "comment": return "#3B82F6";
    case "follow": return "#A855F7";
    case "golden_mic": return "#F59E0B";
    default: return "#6366F1";
  }
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { currentUser } = useApp();

  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    const token = await getToken();
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getNotifications(token);
      setNotifications(result.items);
      await markNotificationsRead(token).catch(() => {});
    } catch {}
    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }, [getToken]);

  useEffect(() => {
    if (currentUser) fetchNotifications();
  }, [currentUser?.dbId]);

  const topPad = insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!currentUser ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sign in to see notifications</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A855F7" size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => String(n.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={notifications.length === 0 ? styles.emptyFlex : { paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchNotifications(true)}
              tintColor="#A855F7"
              colors={["#A855F7"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No notifications yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                When people like, comment, or follow you — it'll appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = !item.readAt;
            const icon = notificationIcon(item.type);
            const iconColor = notificationColor(item.type);
            return (
              <View style={[styles.row, { borderBottomColor: colors.border }, unread && { backgroundColor: `${colors.primary}08` }]}>
                <View style={[styles.iconCircle, { backgroundColor: `${iconColor}20` }]}>
                  <Ionicons name={icon as "heart"} size={20} color={iconColor} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowText, { color: colors.foreground }]}>
                    {notificationLabel(item)}
                  </Text>
                  <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>
                {unread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
              </View>
            );
          }}
        />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyFlex: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
    marginTop: -60,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  rowBody: { flex: 1, gap: 4 },
  rowText: { fontSize: 14, lineHeight: 20 },
  rowTime: { fontSize: 12 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
});

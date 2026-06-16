import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, getInboxShares, markShareSeen } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const shares = currentUser ? getInboxShares(currentUser.id) : [];

  useEffect(() => {
    if (!currentUser) return;
    for (const share of shares) {
      if (!share.seenAt) {
        markShareSeen(share.id);
      }
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Inbox</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!currentUser ? (
        <View style={styles.emptyState}>
          <Ionicons name="mail-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sign in to view your inbox</Text>
        </View>
      ) : shares.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="mail-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No messages yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            When someone shares a Music Minute with you, it'll appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>
            {shares.length} shared {shares.length === 1 ? "Music Minute" : "Music Minutes"}
          </Text>
          {shares.map((share) => (
            <TouchableOpacity
              key={share.id}
              style={[
                styles.shareRow,
                {
                  backgroundColor: share.seenAt ? "transparent" : `${colors.primary}10`,
                  borderBottomColor: colors.border,
                },
              ]}
              activeOpacity={0.8}
              onPress={() => {
                markShareSeen(share.id);
              }}
            >
              <View style={[styles.senderAvatar, { backgroundColor: share.senderAvatarColor }]}>
                <Text style={styles.senderAvatarText}>
                  {share.senderDisplayName.charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.shareContent}>
                <View style={styles.shareTopRow}>
                  <Text style={[styles.senderName, { color: colors.foreground }]}>
                    {share.senderDisplayName}
                  </Text>
                  <Text style={[styles.shareTime, { color: colors.mutedForeground }]}>
                    {timeAgo(share.createdAt)}
                  </Text>
                </View>

                <Text style={[styles.shareAction, { color: colors.mutedForeground }]}>
                  shared a Music Minute with you
                </Text>

                <View style={[styles.mmPreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="musical-note" size={14} color={colors.primary} />
                  <Text style={[styles.mmTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {share.musicMinuteTitle}
                  </Text>
                </View>

                {share.message ? (
                  <Text style={[styles.shareMessage, { color: colors.foreground }]} numberOfLines={2}>
                    "{share.message}"
                  </Text>
                ) : null}
              </View>

              {!share.seenAt && (
                <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
              )}
            </TouchableOpacity>
          ))}
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
  headerSpacer: {
    width: 36,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
    marginTop: -60,
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
  listHeader: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  senderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  senderAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  shareContent: {
    flex: 1,
    gap: 4,
  },
  shareTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  senderName: {
    fontSize: 15,
    fontWeight: "700",
  },
  shareTime: {
    fontSize: 12,
  },
  shareAction: {
    fontSize: 13,
  },
  mmPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  mmTitle: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  shareMessage: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
});

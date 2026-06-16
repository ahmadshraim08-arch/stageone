import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  ApiConversation,
  ApiMessage,
  getConversations,
  getMessages,
  markConversationRead,
  sendMessage,
} from "@/lib/api";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface ParsedBody { displayText: string; isShare: boolean }

function parseMessageBody(raw: string): ParsedBody {
  try {
    const p = JSON.parse(raw) as { type?: string; text?: string; musicMinuteId?: string };
    if (p.type === "text") return { displayText: p.text ?? raw, isShare: false };
    if (p.type === "music_minute_share") return { displayText: "🎵 Shared a Music Minute", isShare: true };
    return { displayText: raw, isShare: false };
  } catch {
    return { displayText: raw, isShare: raw.startsWith("🎵") };
  }
}

function avatarInitials(displayName: string): string {
  return displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Message Thread Modal (inline within screen)
// ---------------------------------------------------------------------------

interface ThreadViewProps {
  conversation: ApiConversation;
  currentDbId: number;
  token: string;
  onClose: () => void;
}

function ThreadView({ conversation, currentDbId, token, onClose }: ThreadViewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      setLoadingMsgs(true);
      try {
        const result = await getMessages(token, conversation.id);
        setMessages(result.items);
        await markConversationRead(token, conversation.id).catch(() => {});
      } catch {}
      setLoadingMsgs(false);
    })();
  }, [conversation.id, token]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText("");
    try {
      const msg = await sendMessage(token, conversation.id, { type: "text", text: body });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(body);
    }
    setSending(false);
  }, [text, token, conversation.id]);

  const other = conversation.otherUser;
  const otherInitials = avatarInitials(other.displayName);

  return (
    <View style={[styles.threadContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.threadHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.threadAvatar, { backgroundColor: "#A855F7" }]}>
          <Text style={styles.threadAvatarText}>{otherInitials}</Text>
        </View>
        <View style={styles.threadHeaderInfo}>
          <Text style={[styles.threadOtherName, { color: colors.foreground }]}>{other.displayName}</Text>
          <Text style={[styles.threadOtherUsername, { color: colors.mutedForeground }]}>@{other.username}</Text>
        </View>
      </View>

      {loadingMsgs ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color="#A855F7" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          style={styles.messageList}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyMsgs}>
              <Text style={[styles.emptyMsgsText, { color: colors.mutedForeground }]}>
                No messages yet. Say hello!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === currentDbId;
            const { displayText, isShare } = parseMessageBody(item.body);
            return (
              <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                <View
                  style={[
                    styles.msgBubble,
                    {
                      backgroundColor: isMine ? "#A855F7" : colors.card,
                      borderColor: isMine ? "#A855F7" : colors.border,
                    },
                    isShare && { borderLeftWidth: 3, borderLeftColor: "#F59E0B" },
                  ]}
                >
                  <Text style={[styles.msgText, { color: isMine ? "#fff" : colors.foreground }]}>
                    {displayText}
                  </Text>
                  <Text style={[styles.msgTime, { color: isMine ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
                    {timeAgo(item.sentAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.inputRow, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.msgInput, { color: colors.foreground }]}
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              multiline
              maxLength={500}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: text.trim() ? "#A855F7" : colors.muted }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Conversation Row
// ---------------------------------------------------------------------------

function ConversationRow({
  conv,
  onPress,
}: {
  conv: ApiConversation;
  onPress: () => void;
}) {
  const colors = useColors();
  const other = conv.otherUser;
  const initials = avatarInitials(other.displayName);
  const hasUnread = conv.unreadCount > 0;

  return (
    <TouchableOpacity
      style={[styles.convRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.convAvatar, { backgroundColor: "#A855F7" }]}>
        <Text style={styles.convAvatarText}>{initials}</Text>
        {hasUnread && <View style={[styles.unreadDot, { backgroundColor: "#A855F7" }]} />}
      </View>
      <View style={styles.convBody}>
        <View style={styles.convTopRow}>
          <Text style={[styles.convName, { color: colors.foreground }, hasUnread && styles.convNameBold]}>
            {other.displayName}
          </Text>
          {conv.lastMessage && (
            <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
              {timeAgo(conv.lastMessage.sentAt)}
            </Text>
          )}
        </View>
        <View style={styles.convBottomRow}>
          <Text
            style={[styles.convLastMsg, { color: hasUnread ? colors.foreground : colors.mutedForeground }]}
            numberOfLines={1}
          >
            {conv.lastMessage ? parseMessageBody(conv.lastMessage.body).displayText : "No messages yet"}
          </Text>
          {hasUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: "#A855F7" }]}>
              <Text style={styles.unreadBadgeText}>{conv.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useApp();
  const { getToken } = useAuth();

  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeConv, setActiveConv] = useState<ApiConversation | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const fetchToken = useCallback(async (): Promise<string | null> => {
    const t = await getToken();
    if (t) setToken(t);
    return t;
  }, [getToken]);

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const t = await fetchToken();
      if (!t) return;
      const result = await getConversations(t);
      setConversations(result.items);
    } catch {}
    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }, [fetchToken]);

  useEffect(() => {
    if (currentUser) {
      fetchConversations();
    }
  }, [currentUser?.dbId]);

  // Poll every 15 s while screen is focused
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useFocusEffect(
    useCallback(() => {
      pollRef.current = setInterval(() => {
        if (currentUser && !activeConv) fetchConversations();
      }, 15000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [currentUser, activeConv, fetchConversations]),
  );

  const handleOpenConv = useCallback(async (conv: ApiConversation) => {
    await fetchToken();
    setActiveConv(conv);
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
    );
  }, [fetchToken]);

  // If a conversation thread is open, show the thread view
  if (activeConv && token) {
    return (
      <ThreadView
        conversation={activeConv}
        currentDbId={currentUser?.dbId ?? 0}
        token={token}
        onClose={() => {
          setActiveConv(null);
          fetchConversations();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Messages</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!currentUser ? (
        <View style={styles.emptyState}>
          <Ionicons name="mail-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sign in to view your messages</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color="#A855F7" size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => String(c.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={conversations.length === 0 ? styles.emptyFlex : { paddingBottom: insets.bottom + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchConversations(true)}
              tintColor="#A855F7"
              colors={["#A855F7"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No conversations yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Share a Music Minute with someone to start a conversation.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ConversationRow conv={item} onPress={() => handleOpenConv(item)} />
          )}
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
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFlex: { flex: 1 },
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

  // Conversation list
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  convAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    position: "relative",
  },
  convAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#05020A",
  },
  convBody: { flex: 1, gap: 3 },
  convTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  convName: { fontSize: 15, fontWeight: "600" },
  convNameBold: { fontWeight: "800" },
  convTime: { fontSize: 12 },
  convBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  convLastMsg: { fontSize: 13, flex: 1 },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  // Thread view
  threadContainer: { flex: 1 },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  threadAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  threadAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  threadHeaderInfo: { flex: 1 },
  threadOtherName: { fontSize: 15, fontWeight: "700" },
  threadOtherUsername: { fontSize: 12 },
  messageList: { flex: 1 },
  emptyMsgs: { flex: 1, alignItems: "center", paddingTop: 60 },
  emptyMsgsText: { fontSize: 14, textAlign: "center" },

  // Message bubbles
  msgRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 8,
  },
  msgRowMine: { justifyContent: "flex-end" },
  msgBubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, textAlign: "right" },

  // Input
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputBox: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    maxHeight: 100,
  },
  msgInput: { fontSize: 15, lineHeight: 20 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});

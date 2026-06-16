import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useApp } from "@/context/AppContext";
import { SEED_USERS } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  musicMinuteId: string;
  musicMinuteTitle: string;
}

type SendState = "idle" | "sending" | "sent" | "error";

export function ShareSheet({ visible, onClose, musicMinuteId, musicMinuteTitle }: Props) {
  const colors = useColors();
  const { currentUser, followingIds, sendDirectShare } = useApp();

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [copyDone, setCopyDone] = useState(false);

  const followedUsers = useMemo(() => {
    return SEED_USERS.filter((u) => followingIds.has(u.id));
  }, [followingIds]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return followedUsers;
    const q = search.toLowerCase();
    return followedUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }, [followedUsers, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    if (!currentUser || selectedIds.size === 0) return;
    setSendState("sending");
    try {
      let ok = true;
      for (const recipientId of selectedIds) {
        const result = sendDirectShare(recipientId, musicMinuteId, musicMinuteTitle, message.trim());
        if (!result) ok = false;
      }
      setSendState(ok ? "sent" : "error");
      if (ok) {
        setTimeout(() => {
          setSendState("idle");
          setSelectedIds(new Set());
          setMessage("");
          setSearch("");
          onClose();
        }, 1500);
      }
    } catch {
      setSendState("error");
    }
  }, [currentUser, selectedIds, message, musicMinuteId, musicMinuteTitle, sendDirectShare, onClose]);

  const handleCopyLink = useCallback(async () => {
    const link = `stageone://musicminute/${musicMinuteId}`;
    await Clipboard.setStringAsync(link);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }, [musicMinuteId]);

  const handleNativeShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out "${musicMinuteTitle}" on StageOne! stageone://musicminute/${musicMinuteId}`,
        title: musicMinuteTitle,
      });
    } catch {}
  }, [musicMinuteId, musicMinuteTitle]);

  const handleClose = useCallback(() => {
    setSelectedIds(new Set());
    setMessage("");
    setSearch("");
    setSendState("idle");
    setCopyDone(false);
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Share</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {musicMinuteTitle}
        </Text>

        {/* Section 1: Send on StageOne */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Send on StageOne</Text>

        {!currentUser ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Sign in to send to other users.
          </Text>
        ) : followedUsers.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            You're not following anyone yet. Follow creators to send them Music Minutes.
          </Text>
        ) : (
          <>
            <View style={[styles.searchRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search people you follow…"
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>

            <ScrollView
              style={styles.userList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredUsers.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No results for "{search}"
                </Text>
              ) : (
                filteredUsers.map((user) => {
                  const selected = selectedIds.has(user.id);
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[
                        styles.userRow,
                        { borderColor: colors.border },
                        selected && { backgroundColor: `${colors.primary}12` },
                      ]}
                      onPress={() => toggleSelect(user.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.avatar, { backgroundColor: user.avatarColor }]}>
                        <Text style={styles.avatarText}>{user.avatarInitials}</Text>
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={[styles.userDisplayName, { color: colors.foreground }]}>
                          {user.displayName}
                        </Text>
                        <Text style={[styles.userUsername, { color: colors.mutedForeground }]}>
                          @{user.username}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            backgroundColor: selected ? colors.primary : "transparent",
                            borderColor: selected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {selectedIds.size > 0 && (
              <>
                <View style={[styles.messageRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.messageInput, { color: colors.foreground }]}
                    placeholder="Add a message (optional)…"
                    placeholderTextColor={colors.mutedForeground}
                    value={message}
                    onChangeText={setMessage}
                    maxLength={200}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor:
                        sendState === "sent"
                          ? "#10B981"
                          : sendState === "error"
                          ? "#EF4444"
                          : colors.primary,
                      opacity: sendState === "sending" ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleSend}
                  activeOpacity={0.85}
                  disabled={sendState === "sending" || sendState === "sent"}
                >
                  {sendState === "sending" ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : sendState === "sent" ? (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.sendBtnText}>Sent!</Text>
                    </>
                  ) : sendState === "error" ? (
                    <>
                      <Ionicons name="alert-circle" size={18} color="#fff" />
                      <Text style={styles.sendBtnText}>Failed — try again</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={styles.sendBtnText}>
                        Send to {selectedIds.size} {selectedIds.size === 1 ? "person" : "people"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* Section 2: External share */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Share Externally</Text>

        <View style={styles.externalRow}>
          <TouchableOpacity
            style={[styles.externalBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleCopyLink}
            activeOpacity={0.8}
          >
            <Ionicons
              name={copyDone ? "checkmark-circle" : "link"}
              size={22}
              color={copyDone ? "#10B981" : colors.primary}
            />
            <Text style={[styles.externalBtnText, { color: copyDone ? "#10B981" : colors.foreground }]}>
              {copyDone ? "Copied!" : "Copy Link"}
            </Text>
          </TouchableOpacity>

          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.externalBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={handleNativeShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social" size={22} color={colors.primary} />
              <Text style={[styles.externalBtnText, { color: colors.foreground }]}>More Options</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  userList: {
    maxHeight: 200,
    marginBottom: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginBottom: 2,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
  },
  userDisplayName: {
    fontSize: 14,
    fontWeight: "700",
  },
  userUsername: {
    fontSize: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  messageRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  messageInput: {
    fontSize: 14,
    maxHeight: 80,
    padding: 0,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: 16,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  externalRow: {
    flexDirection: "row",
    gap: 12,
  },
  externalBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  externalBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

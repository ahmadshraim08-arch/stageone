import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { SeedComment } from "@/data/seedData";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  musicMinuteId: string | null;
  onClose: () => void;
}

function CommentRow({ comment }: { comment: SeedComment }) {
  const colors = useColors();
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <View style={styles.commentRow}>
      <View style={[styles.commentAvatar, { backgroundColor: comment.avatarColor }]}>
        <Text style={styles.commentAvatarText}>{comment.displayName.charAt(0)}</Text>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentUsername, { color: colors.foreground }]}>
            {comment.username}
          </Text>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
            {timeAgo(comment.createdAt)}
          </Text>
        </View>
        <Text style={[styles.commentContent, { color: "rgba(255,255,255,0.85)" }]}>
          {comment.content}
        </Text>
      </View>
      <TouchableOpacity style={styles.commentLike} activeOpacity={0.7}>
        <Ionicons name="heart-outline" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

export function CommentsSheet({ visible, musicMinuteId, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { comments, addComment, loadComments, currentUser } = useApp();
  const [inputText, setInputText] = useState("");
  const slideAnim = useRef(new Animated.Value(500)).current;

  const sheetComments = musicMinuteId
    ? (comments[musicMinuteId] ?? [])
    : [];

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
      if (musicMinuteId) {
        loadComments(musicMinuteId);
      }
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, musicMinuteId, slideAnim]);

  const handleSend = () => {
    if (!inputText.trim() || !musicMinuteId || !currentUser) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addComment(musicMinuteId, inputText.trim());
    setInputText("");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 8,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
            {sheetComments.length} comments
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={sheetComments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CommentRow comment={item} />}
          style={styles.commentsList}
          contentContainerStyle={{ paddingVertical: 8 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No comments yet. Be the first.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
            <View style={[styles.inputContainer, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder={currentUser ? "Add a comment..." : "Sign in to comment"}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground }]}
                editable={!!currentUser}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
            </View>
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || !currentUser}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    inputText.trim() && currentUser ? colors.primary : colors.muted,
                },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "65%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  commentsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  commentAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  commentBody: {
    flex: 1,
    gap: 3,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: "700",
  },
  commentTime: {
    fontSize: 11,
  },
  commentContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  commentLike: {
    padding: 4,
    flexShrink: 0,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
  },
  inputContainer: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});

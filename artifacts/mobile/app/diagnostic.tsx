import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { apiBase, checkHealth, getLastApiError, HealthResponse } from "@/lib/api";

type CheckState = "idle" | "loading" | "done" | "error";

interface StatusRowProps {
  label: string;
  value: string;
  ok?: boolean;
}

function StatusRow({ label, value, ok }: StatusRowProps) {
  const colors = useColors();
  const okColor = "#10B981";
  const errColor = "#EF4444";
  const neutralColor = colors.mutedForeground;

  const dotColor = ok === true ? okColor : ok === false ? errColor : neutralColor;

  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.statusValueRow}>
        {ok !== undefined && (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        )}
        <Text style={[styles.statusValue, { color: ok === false ? errColor : colors.foreground }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function DiagnosticScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useApp();

  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runCheck = useCallback(async () => {
    setCheckState("loading");
    setHealthError(null);
    try {
      const result = await checkHealth();
      setHealth(result);
      setCheckState("done");
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "Check failed");
      setCheckState("error");
    }
    setLastError(getLastApiError());
  }, []);

  useEffect(() => {
    runCheck();
  }, []);

  const handleCopy = useCallback(async () => {
    const lines: string[] = [
      `=== StageOne Diagnostics ===`,
      `Date: ${new Date().toISOString()}`,
      `Platform: ${Platform.OS}`,
      ``,
      `--- Backend ---`,
      `API Base: ${apiBase()}`,
      `API: ${health?.api ?? "unknown"}`,
      `DB: ${health?.db ?? "unknown"}`,
      `Musixmatch: ${health?.musixmatch ?? "unknown"}`,
      ``,
      `--- Current User ---`,
      `Clerk ID: ${currentUser?.id ?? "not signed in"}`,
      `DB ID: ${currentUser?.dbId ?? "n/a"}`,
      `Username: ${currentUser?.username ?? "n/a"}`,
      ``,
      `--- Last Error ---`,
      lastError ?? "none",
    ];
    await Clipboard.setStringAsync(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [health, currentUser, lastError]);

  const apiOk = health?.api === "ok";
  const dbOk = health?.db === "ok";
  const mxOk = health?.musixmatch !== undefined && health.musixmatch !== "error";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.section, { color: colors.mutedForeground }]}>BACKEND HEALTH</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {checkState === "loading" ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Checking backend…
            </Text>
          </View>
        ) : checkState === "error" ? (
          <StatusRow label="Health Check" value={healthError ?? "Failed"} ok={false} />
        ) : (
          <>
            <StatusRow label="API Server" value={health?.api ?? "—"} ok={apiOk} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatusRow label="Database" value={health?.db ?? "—"} ok={dbOk} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatusRow
              label="Musixmatch"
              value={health?.musixmatch ?? "—"}
              ok={mxOk}
            />
          </>
        )}
      </View>

      <TouchableOpacity
        style={[styles.refreshBtn, { borderColor: colors.border }]}
        onPress={runCheck}
        activeOpacity={0.7}
        disabled={checkState === "loading"}
      >
        <Ionicons name="refresh" size={16} color={colors.primary} />
        <Text style={[styles.refreshText, { color: colors.primary }]}>
          {checkState === "loading" ? "Checking…" : "Refresh Health Check"}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.section, { color: colors.mutedForeground }]}>API CONFIG</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <StatusRow label="Base URL" value={apiBase()} />
      </View>

      <Text style={[styles.section, { color: colors.mutedForeground }]}>CURRENT SESSION</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {currentUser ? (
          <>
            <StatusRow label="Clerk ID" value={currentUser.id} ok={true} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatusRow label="DB Integer ID" value={String(currentUser.dbId)} ok={true} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatusRow label="Username" value={currentUser.username} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatusRow label="Display Name" value={currentUser.displayName} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatusRow
              label="Golden Mic Balance"
              value={String(currentUser.goldenMicBalance)}
            />
          </>
        ) : (
          <StatusRow label="Session" value="Not signed in" ok={false} />
        )}
      </View>

      <Text style={[styles.section, { color: colors.mutedForeground }]}>LAST API ERROR</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text
          style={[
            styles.errorText,
            { color: lastError ? "#EF4444" : colors.mutedForeground },
          ]}
          selectable
        >
          {lastError ?? "No errors recorded"}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.copyBtn,
          { backgroundColor: copied ? "#10B981" : colors.primary },
        ]}
        onPress={handleCopy}
        activeOpacity={0.85}
      >
        <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color="#fff" />
        <Text style={styles.copyText}>{copied ? "Copied!" : "Copy Diagnostic Summary"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  statusValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 14,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  refreshText: {
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    lineHeight: 18,
    padding: 14,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  copyText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const GENRES = ["Pop", "R&B", "Soul", "Rap", "Acoustic", "Indie", "Latin Pop", "Arabic Pop", "Singer-Songwriter", "Jazz", "Gospel", "Country"];
type Path = "watch" | "post" | "both";

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useApp();

  const [step, setStep] = useState<"welcome" | "form" | "genres" | "path">("welcome");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [path, setPath] = useState<Path>("both");
  const [isLoading, setIsLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
    Haptics.selectionAsync();
  };

  const handleSignUp = async () => {
    if (!displayName.trim() || !username.trim() || !email.trim()) return;
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    await signUp({
      username: username.trim().replace(/\s/g, ""),
      displayName: displayName.trim(),
      email: email.trim(),
      genres: selectedGenres,
    });
    setIsLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#1A0F2E", "#05020A", "#05020A"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: topPad + 8 }]}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>

      {step === "welcome" && (
        <View style={[styles.welcomeView, { paddingTop: topPad + 60 }]}>
          <MaterialCommunityIcons name="microphone" size={72} color={colors.primary} style={styles.micIcon} />
          <Text style={[styles.logoText, { color: colors.foreground }]}>StageOne</Text>
          <Text style={[styles.tagline, { color: colors.accent }]}>
            The early TikTok for singing talent.
          </Text>
          <Text style={[styles.welcomeDesc, { color: colors.mutedForeground }]}>
            Upload a 60-second Music Minute, get discovered in a TikTok-style feed, and earn Golden Mics from fans to rise toward StageOne Live.
          </Text>
          <View style={styles.statsRow}>
            {[["1M+", "Singers"], ["10M+", "Performances"], ["5M+", "Golden Mics"]].map(([val, lbl]) => (
              <View key={lbl} style={styles.statItem}>
                <Text style={[styles.statVal, { color: colors.foreground }]}>{val}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{lbl}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setStep("form")} style={styles.ctaBtn} activeOpacity={0.85}>
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
              <Text style={styles.ctaText}>Create Account</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await signUp({ username: "demo_user", displayName: "Demo Fan", email: "demo@stageone.app", genres: ["Pop"] });
              router.replace("/(tabs)");
            }}
            style={styles.demoBtn}
            activeOpacity={0.8}
          >
            <Text style={[styles.demoBtnText, { color: colors.mutedForeground }]}>Continue as Demo Fan</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === "form" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={[styles.formContent, { paddingTop: topPad + 60, paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.formTitle, { color: colors.foreground }]}>Create your account</Text>
            <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>
              Your stage, your way.
            </Text>

            <View style={styles.fields}>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Display Name</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="How should we call you?"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Username</Text>
                <TextInput
                  value={username}
                  onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ""))}
                  placeholder="@yourusername"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  autoCapitalize="none"
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (!displayName.trim() || !username.trim() || !email.trim()) return;
                setStep("genres");
              }}
              style={[styles.ctaBtn, { opacity: displayName && username && email ? 1 : 0.5 }]}
              activeOpacity={0.85}
            >
              <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Text style={styles.ctaText}>Continue</Text>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {step === "genres" && (
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={[styles.formContent, { paddingTop: topPad + 60, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.formTitle, { color: colors.foreground }]}>What music do you love?</Text>
          <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>
            Choose your favorite genres to personalize your feed.
          </Text>
          <View style={styles.genresGrid}>
            {GENRES.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => toggleGenre(g)}
                style={[
                  styles.genreChip,
                  {
                    backgroundColor: selectedGenres.includes(g) ? `${colors.primary}20` : colors.muted,
                    borderColor: selectedGenres.includes(g) ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                {selectedGenres.includes(g) && (
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                )}
                <Text style={[styles.genreChipText, { color: selectedGenres.includes(g) ? colors.primary : colors.mutedForeground }]}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setStep("path")} style={styles.ctaBtn} activeOpacity={0.85}>
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
              <Text style={styles.ctaText}>Continue</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      )}

      {step === "path" && (
        <View style={[styles.formScroll, { paddingTop: topPad + 60 }]}>
          <ScrollView contentContainerStyle={[styles.formContent, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>Choose your path</Text>
            <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>
              Watch talent or Post your voice. Your Stage, Your way.
            </Text>
            {([
              { value: "watch", label: "Watch Talent", desc: "Discover emerging singers, give Golden Mics, and support rising voices.", icon: "eye-outline" },
              { value: "post", label: "Post Your Voice", desc: "Upload Music Minutes, build your audience, and rise toward StageOne Live.", icon: "microphone" },
              { value: "both", label: "Both", desc: "Watch and participate. The full StageOne experience.", icon: "star-outline" },
            ] as Array<{ value: Path; label: string; desc: string; icon: string }>).map(({ value, label, desc, icon }) => (
              <TouchableOpacity
                key={value}
                onPress={() => { setPath(value); Haptics.selectionAsync(); }}
                style={[
                  styles.pathOption,
                  {
                    backgroundColor: path === value ? `${colors.primary}15` : colors.card,
                    borderColor: path === value ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons name={icon as any} size={24} color={path === value ? colors.primary : colors.mutedForeground} />
                <View style={styles.pathText}>
                  <Text style={[styles.pathLabel, { color: path === value ? colors.primary : colors.foreground }]}>{label}</Text>
                  <Text style={[styles.pathDesc, { color: colors.mutedForeground }]}>{desc}</Text>
                </View>
                {path === value && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={handleSignUp}
              disabled={isLoading}
              style={[styles.ctaBtn, { opacity: isLoading ? 0.7 : 1 }]}
              activeOpacity={0.85}
            >
              <LinearGradient colors={["#A855F7", "#EC4899", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
                <Text style={styles.ctaText}>{isLoading ? "Setting up your stage..." : "Enter StageOne"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  micIcon: {
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  welcomeView: { flex: 1, paddingHorizontal: 32, alignItems: "center", gap: 16 },
  logoText: { fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  tagline: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  welcomeDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  statsRow: { flexDirection: "row", justifyContent: "space-around", width: "100%", paddingVertical: 8 },
  statItem: { alignItems: "center", gap: 2 },
  statVal: { fontSize: 20, fontWeight: "800" },
  statLbl: { fontSize: 11 },
  ctaBtn: { width: "100%", borderRadius: 16, overflow: "hidden" },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  demoBtn: { paddingVertical: 8 },
  demoBtnText: { fontSize: 14 },
  formScroll: { flex: 1 },
  formContent: { paddingHorizontal: 24, gap: 20 },
  formTitle: { fontSize: 26, fontWeight: "800" },
  formSubtitle: { fontSize: 14, lineHeight: 20, marginTop: -8 },
  fields: { gap: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
  genresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  genreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
  },
  genreChipText: { fontSize: 13, fontWeight: "600" },
  pathOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  pathText: { flex: 1, gap: 4 },
  pathLabel: { fontSize: 16, fontWeight: "700" },
  pathDesc: { fontSize: 12, lineHeight: 16 },
});

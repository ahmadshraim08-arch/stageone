import { useUser } from "@clerk/expo";
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
  const { login } = useApp();
  const { user } = useUser();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const clerkName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const [step, setStep] = useState<"profile" | "genres" | "path">("profile");
  const [displayName, setDisplayName] = useState(clerkName || "");
  const [username, setUsername] = useState(
    (user?.username || clerkEmail.split("@")[0] || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20)
  );
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [path, setPath] = useState<Path>("both");
  const [isLoading, setIsLoading] = useState(false);

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
    Haptics.selectionAsync();
  };

  const handleFinish = async () => {
    if (!displayName.trim() || !username.trim()) return;
    setIsLoading(true);

    await login({
      username: username.trim().replace(/\s/g, ""),
      displayName: displayName.trim(),
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

      {step === "profile" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={[styles.formContent, { paddingTop: topPad + 40, paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <MaterialCommunityIcons name="microphone" size={48} color={colors.primary} style={styles.micIcon} />
            <Text style={[styles.formTitle, { color: colors.foreground }]}>Set up your profile</Text>
            <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>
              How should the world know you on StageOne?
            </Text>

            <View style={styles.fields}>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Display Name</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your stage name"
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
            </View>

            <TouchableOpacity
              onPress={() => {
                if (!displayName.trim() || !username.trim()) return;
                setStep("genres");
              }}
              style={[styles.ctaBtn, { opacity: displayName && username ? 1 : 0.5 }]}
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
          contentContainerStyle={[styles.formContent, { paddingTop: topPad + 40, paddingBottom: 40 }]}
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
        <View style={[styles.formScroll, { paddingTop: topPad + 40 }]}>
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
              onPress={handleFinish}
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
  micIcon: {
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    marginBottom: 8,
  },
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
  ctaBtn: { width: "100%", borderRadius: 16, overflow: "hidden" },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

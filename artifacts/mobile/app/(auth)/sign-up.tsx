import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useSignUp, useSSO } from "@clerk/expo";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function SignUpScreen() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleEmailSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code: verifyCode });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) return;
          router.replace("/onboarding");
        },
      });
    }
  };

  const handleGoogleSignUp = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId) {
        setActive!({
          session: createdSessionId,
          navigate: async ({ decorateUrl }) => {
            router.replace("/onboarding");
          },
        });
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  }, []);

  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0
  ) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad + 24 }]}>
        <LinearGradient colors={["#1A0F2E", "#05020A"]} locations={[0, 0.5]} style={StyleSheet.absoluteFill} />
        <View style={styles.verifyBox}>
          <Ionicons name="mail-outline" size={48} color={colors.primary} style={{ marginBottom: 16 }} />
          <Text style={[styles.verifyTitle, { color: colors.foreground }]}>Verify your email</Text>
          <Text style={[styles.verifySubtitle, { color: colors.mutedForeground }]}>
            We sent a 6-digit code to{"\n"}{email}
          </Text>
          <TextInput
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="000000"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            maxLength={6}
            style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground, textAlign: "center", letterSpacing: 8, fontSize: 22 }]}
          />
          {errors.fields.code && (
            <Text style={styles.errorText}>{errors.fields.code.message}</Text>
          )}
          <TouchableOpacity
            onPress={handleVerify}
            disabled={verifyCode.length < 6 || fetchStatus === "fetching"}
            style={[styles.primaryBtn, { opacity: verifyCode.length < 6 || fetchStatus === "fetching" ? 0.6 : 1 }]}
            activeOpacity={0.85}
          >
            <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGradient}>
              {fetchStatus === "fetching" ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify email</Text>}
            </LinearGradient>
          </TouchableOpacity>
          <Pressable onPress={() => signUp.verifications.sendEmailCode()} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Resend code</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 24, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={["#1A0F2E", "#05020A"]} locations={[0, 0.5]} style={StyleSheet.absoluteFill} />

        <View style={styles.brandRow}>
          <MaterialCommunityIcons name="microphone" size={36} color={colors.primary} style={styles.micGlow} />
          <Text style={[styles.brandName, { color: colors.foreground }]}>StageOne</Text>
        </View>
        <Text style={[styles.headline, { color: colors.foreground }]}>Join StageOne</Text>
        <Text style={[styles.subheadline, { color: colors.mutedForeground }]}>
          The early stage for singing talent
        </Text>

        <TouchableOpacity onPress={handleGoogleSignUp} style={styles.googleBtn} activeOpacity={0.85}>
          <View style={[styles.googleBtnInner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="logo-google" size={20} color="#EA4335" />
            <Text style={[styles.googleBtnText, { color: colors.foreground }]}>Continue with Google</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        />
        {errors.fields.emailAddress && (
          <Text style={styles.errorText}>{errors.fields.emailAddress.message}</Text>
        )}

        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 characters"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPassword}
            style={[styles.input, styles.passwordInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        {errors.fields.password && (
          <Text style={styles.errorText}>{errors.fields.password.message}</Text>
        )}

        <TouchableOpacity
          onPress={handleEmailSignUp}
          disabled={!email || !password || fetchStatus === "fetching"}
          style={[styles.primaryBtn, { opacity: !email || !password || fetchStatus === "fetching" ? 0.6 : 1, marginTop: 8 }]}
          activeOpacity={0.85}
        >
          <LinearGradient colors={["#A855F7", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGradient}>
            {fetchStatus === "fetching" ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </Text>

        <View style={styles.switchRow}>
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[styles.switchLink, { color: colors.primary }]}>Sign in</Text>
            </Pressable>
          </Link>
        </View>

        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, gap: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  micGlow: {
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  brandName: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  headline: { fontSize: 26, fontWeight: "800", marginTop: 4 },
  subheadline: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  googleBtn: { width: "100%", borderRadius: 14, overflow: "hidden" },
  googleBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  googleBtnText: { fontSize: 15, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: -4 },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: "absolute", right: 14, top: 14 },
  primaryBtn: { width: "100%", borderRadius: 14, overflow: "hidden" },
  btnGradient: {
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  termsText: { fontSize: 11, textAlign: "center", lineHeight: 16, marginTop: -4 },
  switchRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 4 },
  switchText: { fontSize: 14 },
  switchLink: { fontSize: 14, fontWeight: "700" },
  errorText: { color: "#F87171", fontSize: 12, marginTop: -6 },
  verifyBox: { flex: 1, paddingHorizontal: 24, alignItems: "center", gap: 14 },
  verifyTitle: { fontSize: 24, fontWeight: "800" },
  verifySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  linkBtn: { paddingVertical: 8 },
  linkText: { fontSize: 14 },
});

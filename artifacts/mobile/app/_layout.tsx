import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ClerkLoaded, ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider, useApp } from "@/context/AppContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

const cache = Platform.OS !== "web" ? tokenCache : undefined;

function ClerkBridge() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { login } = useApp();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    const currentUserId = user?.id ?? null;

    if (prevUserIdRef.current === currentUserId) return;
    prevUserIdRef.current = currentUserId;

    if (!isSignedIn || !user) return;

    const profileKey = `stageone_profile_${user.id}`;
    AsyncStorage.getItem(profileKey).then((profileStr) => {
      if (profileStr) {
        try {
          login(JSON.parse(profileStr));
        } catch {}
      }
    });
  }, [isSignedIn, authLoaded, userLoaded, user?.id]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <ClerkBridge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#05020A" } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen
          name="creator/[username]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#05020A" },
            headerTintColor: "#fff",
            headerBackTitle: "",
            headerTitle: "",
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="rise-chart"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#05020A" },
            headerTintColor: "#fff",
            headerTitle: "Rise Chart",
            headerTitleStyle: { color: "#fff", fontWeight: "700" },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="lyric-challenge/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#05020A" },
            headerTintColor: "#fff",
            headerBackTitle: "",
            headerTitle: "LyricStage",
            headerTitleStyle: { color: "#fff", fontWeight: "700" },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="inbox"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={cache} proxyUrl={proxyUrl}>
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <AppProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </AppProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

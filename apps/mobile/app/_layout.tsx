import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";
import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OnboardingModal } from "@/components/OnboardingModal";
import { AuthProvider, useAuth } from "@/lib/auth";
import { attachNotificationResponseHandler } from "@/lib/push";
import { useEffect } from "react";

function RootNav() {
  const { session, loading } = useAuth();

  useEffect(() => {
    return attachNotificationResponseHandler();
  }, []);

  if (loading) return null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b0b0f" } }}>
        {session ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)/sign-in" />
        )}
      </Stack>
      <OnboardingModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

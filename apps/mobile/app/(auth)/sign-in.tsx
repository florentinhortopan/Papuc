import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

export default function SignIn() {
  const { signInWithEmail, signUpWithEmail, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!configured) {
      Alert.alert(
        "Supabase not configured",
        "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env",
      );
      return;
    }
    if (!email || !password) return;
    setSubmitting(true);
    try {
      if (mode === "sign-in") await signInWithEmail(email, password);
      else await signUpWithEmail(email, password);
    } catch (err: any) {
      Alert.alert("Auth error", err?.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-6 justify-center"
      >
        <View className="mb-10">
          <Text className="text-text text-4xl font-bold mb-2">Papuc</Text>
          <Text className="text-textMuted text-base">
            DSCR-loan rental deals on autopilot.
          </Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-5">
          <Text className="text-text text-lg font-semibold mb-4">
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Text>

          <Text className="text-textMuted text-xs mb-1">Email</Text>
          <TextInput
            className="bg-surfaceAlt border border-border rounded-xl px-4 py-3 text-text mb-3"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#6e6e7a"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          <Text className="text-textMuted text-xs mb-1">Password</Text>
          <TextInput
            className="bg-surfaceAlt border border-border rounded-xl px-4 py-3 text-text mb-5"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#6e6e7a"
            secureTextEntry
            autoComplete="password"
          />

          <Pressable
            onPress={submit}
            disabled={submitting}
            className="bg-primary rounded-xl py-3 items-center active:opacity-80"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-primaryFg font-semibold">
                {mode === "sign-in" ? "Sign in" : "Sign up"}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            className="mt-4 items-center"
          >
            <Text className="text-textMuted text-sm">
              {mode === "sign-in"
                ? "Need an account? Sign up"
                : "Already have an account? Sign in"}
            </Text>
          </Pressable>
        </View>

        {!configured && (
          <View className="mt-6 bg-warning/10 border border-warning/30 rounded-xl p-4">
            <Text className="text-warning text-xs">
              Supabase env vars not detected. Auth is disabled until you fill in
              apps/mobile/.env.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

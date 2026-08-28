import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Card } from "@/components/Card";
import { DebugFooter } from "@/components/DebugFooter";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { useAuth } from "@/lib/auth";
import { apiBaseUrl } from "@/lib/api";
import { setLastError } from "@/lib/debug";
import { getProfile, updateProfile } from "@/lib/profile";
import type { ProfileRow } from "@/lib/database.types";
import { registerPushToken } from "@/lib/push";
import { supabase } from "@/lib/supabase";

const PUSH_PREF_KEY = "papuc.push_enabled";
const PRIVACY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() ||
  `${apiBaseUrl() || "https://papuc.app"}/privacy`;
const SUPPORT_URL =
  process.env.EXPO_PUBLIC_SUPPORT_URL?.trim() ||
  `${apiBaseUrl() || "https://papuc.app"}/support`;

export default function Settings() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pushOn, setPushOn] = useState(true);
  const [emailOn, setEmailOn] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const p = await getProfile();
        setProfile(p);
        setDisplayName(p?.display_name ?? "");
        setEmailOn(p?.email_digests_enabled !== false);
        const stored = await AsyncStorage.getItem(PUSH_PREF_KEY);
        setPushOn(stored !== "0");
      })();
    }, []),
  );

  const tier = profile?.subscription_tier ?? "free";

  const togglePush = async (next: boolean) => {
    setPushOn(next);
    await AsyncStorage.setItem(PUSH_PREF_KEY, next ? "1" : "0");
    try {
      if (next) {
        await registerPushToken();
      } else {
        const uid = user?.id;
        if (uid) {
          await supabase.from("device_tokens").delete().eq("user_id", uid);
        }
      }
    } catch (e) {
      setLastError(e);
    }
  };

  const toggleEmail = async (next: boolean) => {
    setEmailOn(next);
    try {
      await updateProfile({ email_digests_enabled: next });
    } catch (e) {
      setLastError(e);
      setEmailOn(!next);
    }
  };

  const saveDisplayName = async () => {
    setSavingName(true);
    try {
      const trimmed = displayName.trim().slice(0, 80);
      await updateProfile({ display_name: trimmed || null });
      setDisplayName(trimmed);
      Alert.alert("Saved", "Display name updated.");
    } catch (e) {
      setLastError(e);
      Alert.alert(
        "Couldn't save",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSavingName(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 pt-4">
        <Text className="mb-6 text-3xl font-bold text-text">Settings</Text>

        <Card className="mb-3">
          <Text className="text-xs text-textMuted">Signed in as</Text>
          <Text className="mt-1 text-base text-text">{user?.email ?? "—"}</Text>
          {user?.id ? (
            <Pressable
              onPress={() => router.push(`/(tabs)/u/${user.id}`)}
              className="mt-2"
            >
              <Text className="text-sm text-primary">View public profile →</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card className="mb-3">
          <Text className="mb-2 text-xs text-textMuted">Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Shown on your investor profile"
            placeholderTextColor="#9aa0aa"
            maxLength={80}
            className="mb-2 rounded-xl border border-border bg-background px-3 py-2.5 text-text"
          />
          <Pressable
            onPress={() => void saveDisplayName()}
            disabled={savingName}
            className="items-center rounded-xl bg-primary py-2.5"
          >
            <Text className="font-semibold text-white">
              {savingName ? "Saving…" : "Save name"}
            </Text>
          </Pressable>
        </Card>

        <Card className="mb-3">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-xs text-textMuted">Plan</Text>
            <View
              className={`rounded-full border px-2 py-1 ${tier === "pro" ? "border-primary/40 bg-primary/15" : "border-border bg-surfaceAlt"}`}
            >
              <Text
                className={`text-xs font-semibold ${tier === "pro" ? "text-primary" : "text-text"}`}
              >
                {tier.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-base text-text">
            {tier === "pro"
              ? "Nightly scout + push for high-score deals"
              : "Free plan — manual scouting only"}
          </Text>
          {tier !== "pro" ? (
            <Pressable
              onPress={() => setShowUpgrade(true)}
              className="mt-3 items-center rounded-xl border border-primary/40 bg-primary/15 py-2"
            >
              <Text className="text-sm font-semibold text-primary">
                See Papuc Pro
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <Card className="mb-3">
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base text-text">Push alerts</Text>
              <Text className="mt-1 text-xs text-textMuted">
                New high-score deals on this phone
              </Text>
            </View>
            <Switch
              value={pushOn}
              onValueChange={(v) => void togglePush(v)}
              trackColor={{ true: "#7c5cff", false: "#2a2a36" }}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base text-text">Email digests</Text>
              <Text className="mt-1 text-xs text-textMuted">
                Morning Resend summary (web cron)
              </Text>
            </View>
            <Switch
              value={emailOn}
              onValueChange={(v) => void toggleEmail(v)}
              trackColor={{ true: "#7c5cff", false: "#2a2a36" }}
            />
          </View>
        </Card>

        <Pressable
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          className="mb-2 rounded-2xl border border-border bg-surface py-3"
        >
          <Text className="text-center text-text">Privacy Policy</Text>
        </Pressable>
        <Pressable
          onPress={() => void Linking.openURL(SUPPORT_URL)}
          className="mb-2 rounded-2xl border border-border bg-surface py-3"
        >
          <Text className="text-center text-text">Support</Text>
        </Pressable>

        <Pressable
          onPress={signOut}
          className="mt-3 items-center rounded-2xl border border-border bg-surface py-3"
        >
          <Text className="font-semibold text-danger">Sign out</Text>
        </Pressable>
      </View>

      <DebugFooter />

      <UpgradeSheet
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Unlock background scouting, push notifications, and pro-forma exports."
      />
    </SafeAreaView>
  );
}

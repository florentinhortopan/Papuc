import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { useAuth } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import type { ProfileRow } from "@/lib/database.types";

export default function Settings() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setProfile(await getProfile());
      })();
    }, []),
  );

  const tier = profile?.subscription_tier ?? "free";

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4">
        <Text className="text-text text-3xl font-bold mb-6">Settings</Text>

        <Card className="mb-3">
          <Text className="text-textMuted text-xs">Signed in as</Text>
          <Text className="text-text text-base mt-1">{user?.email ?? "—"}</Text>
        </Card>

        <Card className="mb-3">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-textMuted text-xs">Plan</Text>
            <View
              className={`rounded-full px-2 py-1 border ${tier === "pro" ? "bg-primary/15 border-primary/40" : "bg-surfaceAlt border-border"}`}
            >
              <Text
                className={`text-xs font-semibold ${tier === "pro" ? "text-primary" : "text-text"}`}
              >
                {tier.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text className="text-text text-base mt-1">
            {tier === "pro"
              ? "Background scouting + notifications enabled"
              : "Free plan — manual scouting only"}
          </Text>
          {tier !== "pro" ? (
            <Pressable
              onPress={() => setShowUpgrade(true)}
              className="bg-primary/15 border border-primary/40 rounded-xl py-2 items-center mt-3 active:opacity-80"
            >
              <Text className="text-primary text-sm font-semibold">
                See Papuc Pro
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <Pressable
          onPress={signOut}
          className="bg-surface border border-border rounded-2xl py-3 items-center mt-3 active:opacity-70"
        >
          <Text className="text-danger font-semibold">Sign out</Text>
        </Pressable>
      </View>

      <UpgradeSheet
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Unlock background scouting, push notifications, and pro-forma exports."
      />
    </SafeAreaView>
  );
}

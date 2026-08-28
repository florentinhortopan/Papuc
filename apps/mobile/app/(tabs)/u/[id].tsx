import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { setLastError } from "@/lib/debug";
import { formatMarket } from "@/lib/format";
import {
  followUser,
  getInvestorProfile,
  listPublicProjectsForOwner,
  publicDisplayName,
  unfollowUser,
  type InvestorProfile,
} from "@/lib/social";
import { ProjectConstraintsSchema } from "@papuc/core";

type PublicProject = {
  id: string;
  name: string;
  constraints: unknown;
};

export default function InvestorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, pubs] = await Promise.all([
        getInvestorProfile(id),
        listPublicProjectsForOwner(id),
      ]);
      setProfile(p);
      setProjects(pubs as PublicProject[]);
    } catch (e) {
      setLastError(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!profile || profile.isSelf) return;
    setBusy(true);
    const next = !profile.isFollowing;
    setProfile({
      ...profile,
      isFollowing: next,
      followerCount: Math.max(0, profile.followerCount + (next ? 1 : -1)),
    });
    try {
      if (next) await followUser(profile.id);
      else await unfollowUser(profile.id);
    } catch (e) {
      setLastError(e);
      setProfile({
        ...profile,
        isFollowing: !next,
        followerCount: Math.max(
          0,
          profile.followerCount + (next ? -1 : 1),
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#7c5cff" />
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6 pt-4">
        <Pressable onPress={() => router.back()} className="mb-4">
          <Text className="text-textMuted">← Back</Text>
        </Pressable>
        <Text className="text-danger">{error ?? "Profile not found"}</Text>
      </SafeAreaView>
    );
  }

  const name = publicDisplayName(profile);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-4">
            <Pressable onPress={() => router.back()} className="mb-3">
              <Text className="text-textMuted">← Back</Text>
            </Pressable>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-2xl font-bold text-text">{name}</Text>
                <Text className="mt-1 text-sm text-textMuted">
                  {profile.followerCount} followers · {profile.followingCount}{" "}
                  following · {profile.publicProjectCount} public scouts
                </Text>
                {profile.subscription_tier === "pro" ? (
                  <View className="mt-2 self-start rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5">
                    <Text className="text-xs font-semibold text-primary">
                      PRO
                    </Text>
                  </View>
                ) : null}
              </View>
              {!profile.isSelf ? (
                <Pressable
                  disabled={busy}
                  onPress={() => void toggleFollow()}
                  className={`rounded-xl px-4 py-2.5 ${
                    profile.isFollowing
                      ? "border border-border bg-surface"
                      : "bg-primary"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      profile.isFollowing ? "text-text" : "text-white"
                    }`}
                  >
                    {profile.isFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push("/(tabs)/settings")}
                  className="rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <Text className="text-sm text-textMuted">Edit in Settings</Text>
                </Pressable>
              )}
            </View>
            <Text className="mt-6 mb-2 text-lg font-semibold text-text">
              Public scouts
            </Text>
            {projects.length === 0 ? (
              <Text className="text-sm text-textMuted">
                No public projects yet.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          let market = "";
          let strategy = "";
          try {
            const c = ProjectConstraintsSchema.parse(item.constraints);
            strategy = c.strategy;
            market = c.markets.slice(0, 2).map((m) => formatMarket(m)).join(" · ");
          } catch {
            /* ignore */
          }
          return (
            <Pressable
              onPress={() => router.push(`/(tabs)/projects/${item.id}`)}
              className="mb-2"
            >
              <Card>
                <Text className="text-base font-medium text-text">{item.name}</Text>
                <Text className="mt-1 text-xs text-textMuted" numberOfLines={1}>
                  {[strategy, market].filter(Boolean).join(" · ")}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { DealCard } from "@/components/DealCard";
import { listDeals, scoutProject, type DealWithScore } from "@/lib/deals";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import { deleteProject, getProject, type ProjectRow } from "@/lib/projects";
import { supabase } from "@/lib/supabase";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [deals, setDeals] = useState<DealWithScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [scoutStatus, setScoutStatus] = useState<string | null>(null);
  const projectIdRef = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, d] = await Promise.all([getProject(id), listDeals(id)]);
      setProject(p);
      setDeals(rankByScore(d));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Realtime: refetch deals when deal_scores in this project change
  useEffect(() => {
    if (!id) return;
    projectIdRef.current = id;
    const channel = supabase
      .channel(`project:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals",
          filter: `project_id=eq.${id}`,
        },
        () => void refreshDeals(id),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deal_scores",
          filter: `project_id=eq.${id}`,
        },
        () => void refreshDeals(id),
      )
      .subscribe();

    async function refreshDeals(projectId: string) {
      if (projectIdRef.current !== projectId) return;
      try {
        const d = await listDeals(projectId);
        setDeals(rankByScore(d));
      } catch {
        /* ignore */
      }
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  async function runScout() {
    if (!id) return;
    setScouting(true);
    setScoutStatus("Scouting…");
    try {
      const res = await scoutProject(id);
      setScoutStatus(
        `Saw ${res.candidatesSeen} candidates · ${res.dealsAdded} match your goals`,
      );
      await loadAll();
    } catch (err: any) {
      Alert.alert("Scout failed", err?.message ?? String(err));
      setScoutStatus(null);
    } finally {
      setScouting(false);
    }
  }

  async function onDelete() {
    if (!project) return;
    Alert.alert("Delete project?", "This removes the project and all scouted deals.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProject(project.id);
            router.back();
          } catch (err: any) {
            Alert.alert("Couldn't delete", err?.message ?? String(err));
          }
        },
      },
    ]);
  }

  if (!project && !error) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Text className="text-textMuted m-6">Loading…</Text>
      </SafeAreaView>
    );
  }
  if (error || !project) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="m-6">
          <Pressable onPress={() => router.back()} className="mb-4">
            <Text className="text-textMuted">← Back</Text>
          </Pressable>
          <Text className="text-danger">{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const c = project.constraints;
  const marketLabel = formatMarket(c.markets[0]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={
          <RefreshControl
            refreshing={loading || scouting}
            onRefresh={runScout}
            tintColor="#7c5cff"
          />
        }
        ListHeaderComponent={
          <View>
            <View className="px-2 pt-2">
              <Pressable onPress={() => router.back()} className="mb-2">
                <Text className="text-textMuted">← Projects</Text>
              </Pressable>
              <Text className="text-text text-2xl font-bold">{project.name}</Text>
              <Text className="text-textMuted text-sm mt-1">{marketLabel}</Text>
            </View>

            <View className="mt-3 mb-3">
              <Card>
                <Text className="text-textMuted text-xs mb-2">Constraints</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Tag label={c.strategy} />
                  {c.priceMax ? <Tag label={`≤ ${formatMoney(c.priceMax)}`} /> : null}
                  {c.bedsMin ? <Tag label={`≥ ${c.bedsMin} bd`} /> : null}
                  {c.bathsMin ? <Tag label={`≥ ${c.bathsMin} ba`} /> : null}
                  {c.downPayment ? <Tag label={`Down ${formatMoney(c.downPayment)}`} /> : null}
                  {c.targetMonthlyCashflow ? (
                    <Tag label={`${formatMoney(c.targetMonthlyCashflow)}/mo`} />
                  ) : null}
                  <Tag label={`DSCR ≥ ${c.minDSCR.toFixed(2)}`} />
                  <Tag label={`${(c.mortgage.rateAPR * 100).toFixed(2)}% APR`} />
                </View>
                {project.last_scout_at ? (
                  <Text className="text-textMuted text-xs mt-3">
                    Last scout {formatDate(project.last_scout_at)}
                  </Text>
                ) : null}
              </Card>
            </View>

            <View className="flex-row gap-2 mb-3">
              <Pressable
                onPress={runScout}
                disabled={scouting}
                className={`flex-1 rounded-xl py-3 items-center ${scouting ? "bg-primary/40" : "bg-primary active:opacity-80"}`}
              >
                <Text className="text-primaryFg font-semibold">
                  {scouting ? "Scouting…" : "Scout deals"}
                </Text>
              </Pressable>
            </View>
            {scoutStatus ? (
              <Text className="text-textMuted text-xs mb-3">{scoutStatus}</Text>
            ) : null}

            <Text className="text-text text-lg font-semibold mb-2">
              Deals {deals.length ? `(${deals.length})` : ""}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <Text className="text-textMuted text-sm text-center">
              No deals yet. Tap "Scout deals" to find listings that match your goals.
            </Text>
          </View>
        }
        renderItem={({ item }) => <DealCard deal={item} />}
        ListFooterComponent={
          <View className="mt-6">
            <Pressable
              onPress={onDelete}
              className="border border-border rounded-xl py-3 items-center active:opacity-70"
            >
              <Text className="text-danger text-sm font-semibold">
                Delete project
              </Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function rankByScore(deals: DealWithScore[]): DealWithScore[] {
  return [...deals].sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0));
}

function Tag({ label }: { label: string }) {
  return (
    <View className="bg-surfaceAlt border border-border rounded-full px-2 py-1">
      <Text className="text-text text-xs">{label}</Text>
    </View>
  );
}

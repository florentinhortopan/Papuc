import {
  ProjectConstraintsSchema,
  type ProjectConstraints,
} from "@papuc/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { ConstraintEditor } from "@/components/ConstraintEditor";
import { DealCard } from "@/components/DealCard";
import { listDeals, scoutProject, type DealWithScore } from "@/lib/deals";
import type { ScoutMode, SubscriptionTier } from "@/lib/database.types";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import {
  deleteProject,
  getProject,
  updateProject,
  type ProjectRow,
} from "@/lib/projects";
import {
  followUser,
  getSessionUserId,
  isFollowingUser,
  isWatchingProject,
  unfollowUser,
  unwatchProject,
  watchProject,
} from "@/lib/social";
import { supabase } from "@/lib/supabase";

type DealShelf = "live" | "archived" | "all";

const SHELVES: Array<{ id: DealShelf; label: string }> = [
  { id: "live", label: "Live" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [deals, setDeals] = useState<DealWithScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [scoutStatus, setScoutStatus] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [watching, setWatching] = useState(false);
  const [following, setFollowing] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [publicBusy, setPublicBusy] = useState(false);
  const [shelf, setShelf] = useState<DealShelf>("live");
  const [shelfCounts, setShelfCounts] = useState({
    live: 0,
    archived: 0,
    all: 0,
  });
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [constraintsDraft, setConstraintsDraft] =
    useState<ProjectConstraints | null>(null);
  const [savingConstraints, setSavingConstraints] = useState(false);
  const projectIdRef = useRef<string | null>(null);
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;

  const isPro = tier === "pro";

  useEffect(() => {
    void getSessionUserId().then(setViewerId);
    void getProfile()
      .then((p) => {
        if (p?.subscription_tier === "pro") setTier("pro");
      })
      .catch(() => undefined);
  }, []);

  const refreshShelfCounts = useCallback(async (projectId: string) => {
    const base = () =>
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
    const [liveRes, archivedRes, allRes] = await Promise.all([
      base().eq("inventory_status", "live"),
      base().eq("inventory_status", "archived"),
      base(),
    ]);
    setShelfCounts({
      live: liveRes.count ?? 0,
      archived: archivedRes.count ?? 0,
      all: allRes.count ?? 0,
    });
  }, []);

  const loadDeals = useCallback(
    async (projectId: string, nextShelf: DealShelf = shelfRef.current) => {
      const d = await listDeals(projectId, { shelf: nextShelf });
      setDeals(rankByScore(d));
      await refreshShelfCounts(projectId);
    },
    [refreshShelfCounts],
  );

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await getProject(id);
      setProject(p);
      setConstraintsDraft(p.constraints);
      await loadDeals(id, shelf);
      const uid = (await getSessionUserId()) ?? viewerId;
      if (uid && p.owner_id !== uid && p.is_public) {
        const [w, f] = await Promise.all([
          isWatchingProject(p.id),
          isFollowingUser(p.owner_id),
        ]);
        setWatching(w);
        setFollowing(f);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [id, viewerId, shelf, loadDeals]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
        await loadDeals(projectId);
      } catch {
        /* ignore */
      }
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, loadDeals]);

  async function runScout(mode: ScoutMode = "append") {
    if (!id) return;
    setScouting(true);
    setScoutStatus(
      mode === "substitute" ? "Substituting inventory…" : "Scouting…",
    );
    try {
      const res = await scoutProject(id, { mode });
      setScoutStatus(
        mode === "substitute"
          ? `Substituted · saw ${res.candidatesSeen} · ${res.dealsAdded} now live`
          : `Saw ${res.candidatesSeen} candidates · ${res.dealsAdded} match your goals`,
      );
      setShelf("live");
      shelfRef.current = "live";
      await loadAll();
    } catch (err: any) {
      Alert.alert("Scout failed", err?.message ?? String(err));
      setScoutStatus(null);
    } finally {
      setScouting(false);
    }
  }

  async function saveConstraints() {
    if (!project || !constraintsDraft) return;
    setSavingConstraints(true);
    try {
      const validated = ProjectConstraintsSchema.parse(constraintsDraft);
      await updateProject(project.id, { constraints: validated });
      setProject({ ...project, constraints: validated });
      setConstraintsDraft(validated);
      Alert.alert("Saved", "Constraints updated. Scout to apply them.");
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? String(err));
    } finally {
      setSavingConstraints(false);
    }
  }

  async function saveAndScout(mode: ScoutMode) {
    if (!project || !constraintsDraft) return;
    setSavingConstraints(true);
    try {
      const validated = ProjectConstraintsSchema.parse(constraintsDraft);
      await updateProject(project.id, { constraints: validated });
      setProject({ ...project, constraints: validated });
      setConstraintsDraft(validated);
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? String(err));
      setSavingConstraints(false);
      return;
    }
    setSavingConstraints(false);
    if (mode === "substitute") {
      Alert.alert(
        "Substitute live deals?",
        "Current live deals move to Archived. They stay searchable. New matches become live.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Substitute & scout",
            style: "destructive",
            onPress: () => void runScout("substitute"),
          },
        ],
      );
      return;
    }
    await runScout("append");
  }

  async function onDelete() {
    if (!project) return;
    Alert.alert(
      "Delete project?",
      "This removes the project and all scouted deals.",
      [
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
      ],
    );
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

  const c = constraintsDraft ?? project.constraints;
  const marketLabel = formatMarket(c.markets[0]);
  const isOwner = viewerId != null && project.owner_id === viewerId;

  async function toggleWatch() {
    if (!project) return;
    setWatchBusy(true);
    const next = !watching;
    setWatching(next);
    try {
      if (next) await watchProject(project.id);
      else await unwatchProject(project.id);
    } catch (err: any) {
      setWatching(!next);
      Alert.alert("Watch failed", err?.message ?? String(err));
    } finally {
      setWatchBusy(false);
    }
  }

  async function toggleFollow() {
    if (!project) return;
    setWatchBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(project.owner_id);
      else await unfollowUser(project.owner_id);
    } catch (err: any) {
      setFollowing(!next);
      Alert.alert("Follow failed", err?.message ?? String(err));
    } finally {
      setWatchBusy(false);
    }
  }

  async function togglePublic(next: boolean) {
    if (!project) return;
    setPublicBusy(true);
    setProject({ ...project, is_public: next });
    try {
      await updateProject(project.id, { is_public: next });
    } catch (err: any) {
      setProject({ ...project, is_public: !next });
      Alert.alert("Couldn't update", err?.message ?? String(err));
    } finally {
      setPublicBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={
          <RefreshControl
            refreshing={loading || scouting}
            onRefresh={
              isOwner ? () => void runScout("append") : () => void loadAll()
            }
            tintColor="#7c5cff"
          />
        }
        ListHeaderComponent={
          <View>
            <View className="px-2 pt-2">
              <Pressable onPress={() => router.back()} className="mb-2">
                <Text className="text-textMuted">
                  ← {isOwner ? "Projects" : "Back"}
                </Text>
              </Pressable>
              <Text className="text-text text-2xl font-bold">{project.name}</Text>
              <Text className="text-textMuted text-sm mt-1">{marketLabel}</Text>
              {!isOwner ? (
                <Pressable
                  onPress={() => router.push(`/(tabs)/u/${project.owner_id}`)}
                  className="mt-2"
                >
                  <Text className="text-sm text-primary">View investor →</Text>
                </Pressable>
              ) : null}
            </View>

            <View className="mt-3 mb-3">
              <Card>
                <Pressable
                  onPress={() => {
                    if (isOwner && isPro) setConstraintsOpen((o) => !o);
                  }}
                  disabled={!isOwner || !isPro}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-textMuted text-xs">
                      {isOwner && isPro
                        ? "Search constraints"
                        : "Constraints"}
                    </Text>
                    {isOwner && isPro ? (
                      <Text className="text-primary text-xs font-semibold">
                        {constraintsOpen ? "Hide" : "Edit"}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Tag label={c.strategy} />
                    {c.priceMax ? (
                      <Tag label={`≤ ${formatMoney(c.priceMax)}`} />
                    ) : null}
                    {c.bedsMin ? <Tag label={`≥ ${c.bedsMin} bd`} /> : null}
                    {c.bathsMin ? <Tag label={`≥ ${c.bathsMin} ba`} /> : null}
                    {c.downPayment ? (
                      <Tag label={`Down ${formatMoney(c.downPayment)}`} />
                    ) : null}
                    {c.targetMonthlyCashflow ? (
                      <Tag
                        label={`${formatMoney(c.targetMonthlyCashflow)}/mo`}
                      />
                    ) : null}
                    <Tag label={`DSCR ≥ ${c.minDSCR.toFixed(2)}`} />
                    <Tag
                      label={`${(c.mortgage.rateAPR * 100).toFixed(2)}% APR`}
                    />
                  </View>
                </Pressable>
                {project.last_scout_at ? (
                  <Text className="text-textMuted text-xs mt-3">
                    Last scout {formatDate(project.last_scout_at)}
                  </Text>
                ) : null}
                {isOwner && !isPro ? (
                  <Text className="text-textMuted text-xs mt-3 leading-5">
                    Pro unlocks editing these constraints and Substitute
                    re-scout (archive live deals, keep them searchable).
                  </Text>
                ) : null}
                {isOwner && isPro && constraintsOpen && constraintsDraft ? (
                  <View className="mt-4 border-t border-border pt-3">
                    <ConstraintEditor
                      constraints={constraintsDraft}
                      onChange={setConstraintsDraft}
                    />
                    <Pressable
                      onPress={() => void saveConstraints()}
                      disabled={savingConstraints || scouting}
                      className="mt-2 rounded-xl border border-border py-3 items-center"
                    >
                      <Text className="text-text font-semibold">
                        {savingConstraints ? "Saving…" : "Save constraints"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void saveAndScout("append")}
                      disabled={savingConstraints || scouting}
                      className="mt-2 rounded-xl bg-primary py-3 items-center"
                    >
                      <Text className="text-primaryFg font-semibold">
                        Scout: Append
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void saveAndScout("substitute")}
                      disabled={savingConstraints || scouting}
                      className="mt-2 rounded-xl border border-primary/50 bg-primary/15 py-3 items-center"
                    >
                      <Text className="text-primary font-semibold">
                        Scout: Substitute
                      </Text>
                    </Pressable>
                    <Text className="text-textMuted text-[11px] mt-2 leading-5">
                      Append adds new matches. Substitute archives live deals
                      (still searchable) then scouts a fresh live set.
                    </Text>
                  </View>
                ) : null}
              </Card>
            </View>

            {isOwner ? (
              <View className="mb-3 gap-2">
                <View className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-text font-medium">
                      Show on Discover
                    </Text>
                    <Text className="text-textMuted text-xs mt-0.5">
                      Public deals can appear in Friends feeds
                    </Text>
                  </View>
                  <Switch
                    value={Boolean(project.is_public)}
                    onValueChange={(v) => void togglePublic(v)}
                    disabled={publicBusy}
                    trackColor={{ true: "#7c5cff", false: "#2a2a36" }}
                  />
                </View>
                {!isPro || !constraintsOpen ? (
                  <Pressable
                    onPress={() => void runScout("append")}
                    disabled={scouting}
                    className={`rounded-xl py-3 items-center ${
                      scouting
                        ? "bg-primary/40"
                        : "bg-primary active:opacity-80"
                    }`}
                  >
                    <Text className="text-primaryFg font-semibold">
                      {scouting
                        ? "Scouting…"
                        : isPro
                          ? "Scout: Append"
                          : "Scout deals"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : project.is_public ? (
              <View className="mb-3 gap-2">
                <Pressable
                  onPress={() => void toggleFollow()}
                  disabled={watchBusy}
                  className={`rounded-xl py-3 items-center ${
                    following
                      ? "border border-border bg-surface"
                      : "border border-border bg-surfaceAlt"
                  }`}
                >
                  <Text className="font-semibold text-text">
                    {following ? "Following investor" : "Follow investor"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void toggleWatch()}
                  disabled={watchBusy}
                  className={`rounded-xl py-3 items-center ${
                    watching ? "border border-border bg-surface" : "bg-primary"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      watching ? "text-text" : "text-primaryFg"
                    }`}
                  >
                    {watching ? "Watching" : "Watch"}
                  </Text>
                </Pressable>
                <Text className="text-textMuted text-xs">
                  Watch to see new public deals in Friends.
                </Text>
              </View>
            ) : null}
            {scoutStatus ? (
              <Text className="text-textMuted text-xs mb-3">{scoutStatus}</Text>
            ) : null}

            <Text className="text-text text-lg font-semibold mb-2">
              Deals {deals.length ? `(${deals.length})` : ""}
            </Text>
            {isOwner ? (
              <View className="flex-row gap-2 mb-3">
                {SHELVES.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setShelf(s.id);
                      shelfRef.current = s.id;
                      if (id) void loadDeals(id, s.id);
                    }}
                    className={`rounded-full border px-3 py-1.5 ${
                      shelf === s.id
                        ? "border-primary bg-primary/20"
                        : "border-border bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        shelf === s.id ? "text-primary" : "text-textMuted"
                      }`}
                    >
                      {s.label} {shelfCounts[s.id]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <Text className="text-textMuted text-sm text-center">
              {isOwner
                ? shelf === "archived"
                  ? "No archived deals yet. Substitute re-scout moves live deals here."
                  : 'No deals yet. Tap "Scout deals" to find listings that match your goals.'
                : "No deals in this public scout yet."}
            </Text>
          </View>
        }
        renderItem={({ item }) => <DealCard deal={item} />}
        ListFooterComponent={
          isOwner ? (
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
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function rankByScore(deals: DealWithScore[]): DealWithScore[] {
  return [...deals].sort(
    (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View className="bg-surfaceAlt border border-border rounded-full px-2 py-1">
      <Text className="text-text text-xs">{label}</Text>
    </View>
  );
}

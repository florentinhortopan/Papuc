import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useEffect, useMemo, useState, type ReactNode, type Ref } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";

import { actOnDeal } from "@/lib/deals";
import { setLastError } from "@/lib/debug";
import {
  dealImageUrl,
  dealLabel,
  type FeedDeal,
} from "@/lib/feed";
import { formatMoney } from "@/lib/format";
import { getDeal, type DealWithScore } from "@/lib/deals";
import {
  followUser,
  getSessionUserId,
  isFollowingUser,
  isWatchingProject,
  scoutLikeThis,
  unfollowUser,
  unwatchProject,
  watchProject,
} from "@/lib/social";
import { useRouter } from "expo-router";

type Props = {
  deal: FeedDeal | null;
  onClose: () => void;
  onSaved?: () => void;
  onSkipped?: () => void;
};

export const DealPeekSheet = forwardRef(function DealPeekSheet(
  { deal, onClose, onSaved, onSkipped }: Props,
  ref: Ref<BottomSheet>,
) {
  const snapPoints = useMemo(() => ["48%", "92%"], []);
  const [busy, setBusy] = useState<"saved" | "dismissed" | "social" | null>(
    null,
  );
  const [full, setFull] = useState<DealWithScore | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [socialNote, setSocialNote] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [watching, setWatching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void getSessionUserId().then(setViewerId);
  }, []);

  useEffect(() => {
    setFollowing(false);
    setWatching(false);
    setSocialNote(null);
    if (!deal?.project?.owner_id || !deal.project.id) return;
    const ownerId = deal.project.owner_id;
    const projectId = deal.project.id;
    void (async () => {
      try {
        const [f, w] = await Promise.all([
          isFollowingUser(ownerId),
          isWatchingProject(projectId),
        ]);
        setFollowing(f);
        setWatching(w);
      } catch (e) {
        setLastError(e);
      }
    })();
  }, [deal?.id, deal?.project?.owner_id, deal?.project?.id]);

  const isOwn =
    deal?.isOwn === true ||
    (viewerId != null && deal?.project.owner_id === viewerId);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
      />
    ),
    [],
  );

  const loadFull = async () => {
    if (!deal || full) return;
    try {
      setFull(await getDeal(deal.id));
    } catch (e) {
      setLastError(e);
    }
  };

  const act = async (action: "saved" | "dismissed") => {
    if (!deal) return;
    setBusy(action);
    try {
      await actOnDeal({
        dealId: deal.id,
        projectId: deal.project_id ?? deal.project.id,
        action,
      });
      if (action === "saved") onSaved?.();
      else onSkipped?.();
      onClose();
    } catch (e) {
      setLastError(e);
    } finally {
      setBusy(null);
    }
  };

  const img = deal ? dealImageUrl(deal) : null;
  const score = deal?.score?.score ?? full?.score?.score;
  const dscr = deal?.score?.dscr ?? full?.score?.dscr;
  const cf = deal?.score?.monthly_cashflow ?? full?.score?.monthly_cashflow;

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#16161d" }}
      handleIndicatorStyle={{ backgroundColor: "#9aa0aa", width: 40 }}
      onChange={(i) => {
        if (i < 0) {
          setExpanded(false);
          setFull(null);
          onClose();
        } else if (i >= 1) {
          setExpanded(true);
          void loadFull();
        }
      }}
    >
      {!deal ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-textMuted">Select a deal</Text>
        </View>
      ) : (
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <View className="px-4 pt-1">
            {img ? (
              <Image
                source={{ uri: img }}
                className="mb-3 h-36 w-full rounded-xl"
                resizeMode="cover"
              />
            ) : null}
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-xl font-semibold text-text">
                {dealLabel(deal)}
              </Text>
              {score != null ? (
                <View className="rounded-full bg-primary px-3 py-1.5">
                  <Text className="font-bold text-white">
                    {Math.round(Number(score))}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-2 text-sm text-textMuted">
              {[
                dscr != null ? `${Number(dscr).toFixed(2)}x DSCR` : null,
                cf != null ? `${formatMoney(Number(cf))}/mo` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {!isOwn && deal.project.owner_id ? (
              <Pressable
                onPress={() => {
                  onClose();
                  router.push(`/(tabs)/u/${deal.project.owner_id}`);
                }}
                className="mt-2 self-start"
              >
                <Text className="text-sm text-primary">
                  {deal.ownerDisplayName ?? "View investor"} →
                </Text>
              </Pressable>
            ) : null}

            {!isOwn ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                <Pressable
                  disabled={busy === "social"}
                  onPress={() => {
                    void (async () => {
                      if (!deal) return;
                      setBusy("social");
                      setSocialNote(null);
                      const next = !following;
                      setFollowing(next);
                      try {
                        if (next) await followUser(deal.project.owner_id);
                        else await unfollowUser(deal.project.owner_id);
                        setSocialNote(next ? "Following" : "Unfollowed");
                      } catch (e) {
                        setFollowing(!next);
                        setLastError(e);
                      } finally {
                        setBusy(null);
                      }
                    })();
                  }}
                  className={`rounded-full px-3 py-1.5 ${
                    following
                      ? "border border-border bg-surface"
                      : "border border-border bg-surfaceAlt"
                  }`}
                >
                  <Text className="text-xs font-semibold text-text">
                    {following ? "Following" : "Follow"}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy === "social"}
                  onPress={() => {
                    void (async () => {
                      if (!deal) return;
                      setBusy("social");
                      setSocialNote(null);
                      const next = !watching;
                      setWatching(next);
                      try {
                        if (next) await watchProject(deal.project.id);
                        else await unwatchProject(deal.project.id);
                        setSocialNote(next ? "Watching scout" : "Unwatched");
                      } catch (e) {
                        setWatching(!next);
                        setLastError(e);
                      } finally {
                        setBusy(null);
                      }
                    })();
                  }}
                  className="rounded-full border border-border bg-surfaceAlt px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-text">
                    {watching ? "Watching" : "Watch"}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy === "social"}
                  onPress={() => {
                    void (async () => {
                      if (!deal) return;
                      setBusy("social");
                      setSocialNote(null);
                      try {
                        const { projectId } = await scoutLikeThis(deal.id);
                        onClose();
                        router.push(`/(tabs)/projects/${projectId}`);
                      } catch (e) {
                        setLastError(e);
                        setBusy(null);
                      }
                    })();
                  }}
                  className="rounded-full bg-primary px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-white">
                    Scout like this
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {socialNote ? (
              <Text className="mt-2 text-xs text-primary">{socialNote}</Text>
            ) : null}

            {expanded ? (
              <View className="mt-4 gap-2">
                <ContainedPanel title="Basics">
                  <Row
                    label="Price"
                    value={formatMoney(deal.price ?? deal.est_value)}
                  />
                  <Row
                    label="Beds / baths"
                    value={
                      full
                        ? `${full.beds ?? "—"} / ${full.baths ?? "—"}`
                        : "…"
                    }
                  />
                  <Row label="Sqft" value={full?.sqft ? String(full.sqft) : "…"} />
                </ContainedPanel>
                <ContainedPanel title="Underwriting">
                  <Text className="text-sm text-textMuted">
                    Pull up for full sheet · tweak assumptions on web for now.
                    Scout used your project mortgage, DSCR, and cash targets.
                  </Text>
                </ContainedPanel>
              </View>
            ) : (
              <Text className="mt-3 text-xs text-textMuted">
                Swipe up for more · Save or Skip below
              </Text>
            )}
          </View>
        </BottomSheetScrollView>
      )}

      {deal ? (
        <View className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t border-border bg-surface px-4 pb-8 pt-3">
          <Pressable
            onPress={() => void act("dismissed")}
            disabled={!!busy}
            className="flex-1 items-center rounded-xl border border-border py-3.5"
          >
            {busy === "dismissed" ? (
              <ActivityIndicator color="#f5f5f7" />
            ) : (
              <Text className="font-semibold text-text">Skip</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => void act("saved")}
            disabled={!!busy}
            className="flex-1 items-center rounded-xl bg-primary py-3.5"
          >
            {busy === "saved" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">Save</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </BottomSheet>
  );
});

function ContainedPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="rounded-xl border border-border bg-surfaceAlt p-3">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-1 flex-row justify-between">
      <Text className="text-sm text-textMuted">{label}</Text>
      <Text className="text-sm text-text">{value}</Text>
    </View>
  );
}

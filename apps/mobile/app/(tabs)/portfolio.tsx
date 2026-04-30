import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DSCRBadge } from "@/components/DSCRBadge";
import type { DealWithScore } from "@/lib/deals";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import { listSavedDeals } from "@/lib/portfolio";

export default function Portfolio() {
  const router = useRouter();
  const [deals, setDeals] = useState<DealWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDeals(await listSavedDeals());
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function toggleSelect(id: string) {
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id],
    );
  }

  const selectedDeals = deals.filter((d) => selectedIds.includes(d.id));

  if (comparing && selectedDeals.length >= 2) {
    return (
      <ComparePane
        deals={selectedDeals}
        onClose={() => setComparing(false)}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-text text-3xl font-bold">Portfolio</Text>
        <Text className="text-textMuted text-sm mt-1">
          Saved deals. Tap to select 2-3 and compare side-by-side.
        </Text>
      </View>

      {error ? (
        <View className="mx-6 my-2 bg-danger/10 border border-danger/30 rounded-xl p-3">
          <Text className="text-danger text-xs">{error}</Text>
        </View>
      ) : null}

      {selectedIds.length >= 2 ? (
        <View className="px-4 pb-2">
          <Button
            label={`Compare ${selectedIds.length} deals`}
            onPress={() => setComparing(true)}
          />
        </View>
      ) : null}

      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#7c5cff" />
        }
        ListEmptyComponent={
          loading ? null : (
            <View className="px-6 mt-12 items-center">
              <Text className="text-textMuted text-center">
                Save deals from the Deal Detail screen and they'll show up here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const photo =
            item.primary_image_url ??
            (Array.isArray(item.photos) ? (item.photos as string[])[0] : undefined);
          return (
            <Pressable
              onPress={() => toggleSelect(item.id)}
              onLongPress={() =>
                router.push({ pathname: "/(tabs)/deals/[id]", params: { id: item.id } })
              }
              className={`bg-surface border ${selected ? "border-primary" : "border-border"} rounded-2xl p-3 active:opacity-90`}
            >
              <View className="flex-row gap-3 items-center">
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 72, height: 72, borderRadius: 8 }} />
                ) : (
                  <View className="w-[72px] h-[72px] bg-surfaceAlt rounded-lg" />
                )}
                <View className="flex-1">
                  <Text className="text-text font-semibold" numberOfLines={1}>
                    {item.address ?? "Address pending"}
                  </Text>
                  <Text className="text-textMuted text-xs mt-0.5">
                    {[
                      item.beds ? `${item.beds} bd` : null,
                      item.baths ? `${item.baths} ba` : null,
                      item.sqft ? `${Math.round(Number(item.sqft))} sqft` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-text text-sm font-semibold">
                      {formatMoney(item.price ?? 0)}
                    </Text>
                    <DSCRBadge dscr={item.score?.dscr ?? null} />
                  </View>
                </View>
                <View className="ml-1">
                  <Text className="text-textMuted text-xs">
                    {selected ? "Selected" : "Tap to select"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function ComparePane({
  deals,
  onClose,
}: {
  deals: DealWithScore[];
  onClose: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 flex-row items-center justify-between">
        <Text className="text-text text-2xl font-bold">Compare</Text>
        <Pressable onPress={onClose} className="active:opacity-80">
          <Text className="text-textMuted">Close</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View className="w-72">
            <Card>
              <Text className="text-text font-semibold" numberOfLines={2}>
                {item.address ?? "Address pending"}
              </Text>
              <Text className="text-textMuted text-xs mb-3">
                {[
                  item.beds ? `${item.beds} bd` : null,
                  item.baths ? `${item.baths} ba` : null,
                  item.sqft ? `${Math.round(Number(item.sqft))} sqft` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Row label="Price" value={formatMoney(item.price ?? 0)} />
              <Row
                label="Monthly cashflow"
                value={
                  item.score?.monthly_cashflow != null
                    ? `${item.score.monthly_cashflow >= 0 ? "+" : ""}${formatMoney(item.score.monthly_cashflow)}`
                    : "—"
                }
              />
              <Row label="DSCR" value={formatDscr(item.score?.dscr ?? null)} />
              <Row
                label="DSCR (75% rent)"
                value={formatDscr(item.score?.dscr_lender_haircut ?? null)}
              />
              <Row
                label="Cash-on-cash"
                value={formatPct(item.score?.cash_on_cash ?? null)}
              />
              <Row
                label="5-yr IRR"
                value={formatPct(item.score?.irr_5yr ?? null)}
              />
              <Row
                label="Score"
                value={item.score?.score != null ? String(item.score.score) : "—"}
              />
              <Row
                label="Payout (yrs)"
                value={
                  item.score?.payout_years != null
                    ? item.score.payout_years.toFixed(2)
                    : "—"
                }
              />
              {item.score?.rationale ? (
                <Text className="text-textMuted text-xs mt-3 leading-5">
                  {item.score.rationale}
                </Text>
              ) : null}
            </Card>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-textMuted text-xs">{label}</Text>
      <Text className="text-text text-xs font-semibold">{value}</Text>
    </View>
  );
}

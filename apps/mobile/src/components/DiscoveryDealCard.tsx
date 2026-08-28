import { useRouter } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";

import {
  dealImageUrl,
  dealLabel,
  type FeedDeal,
} from "@/lib/feed";
import { formatMoney } from "@/lib/format";

type Props = {
  deal: FeedDeal;
  onPress: () => void;
};

export function DiscoveryDealCard({ deal, onPress }: Props) {
  const router = useRouter();
  const img = dealImageUrl(deal);
  const score = deal.score?.score;
  const dscr = deal.score?.dscr;
  const cf = deal.score?.monthly_cashflow;
  const price = deal.price ?? deal.est_value;
  const ownerId = deal.project?.owner_id;
  const showOwner = Boolean(ownerId && !deal.isOwn);

  return (
    <Pressable
      onPress={onPress}
      className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface"
      style={{ height: 420 }}
    >
      {img ? (
        <Image source={{ uri: img }} className="absolute inset-0 h-full w-full" />
      ) : (
        <View className="absolute inset-0 items-center justify-center bg-surfaceAlt">
          <Text className="text-textMuted">No photo</Text>
        </View>
      )}
      <View className="absolute inset-0 justify-end">
        <View className="px-4 pb-4 pt-16">
          <View
            className="rounded-2xl px-3 py-3"
            style={{ backgroundColor: "rgba(11,11,15,0.72)" }}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="flex-1 text-base font-semibold text-text"
                numberOfLines={2}
              >
                {dealLabel(deal)}
              </Text>
              {score != null ? (
                <View className="rounded-full bg-primary px-2.5 py-1">
                  <Text className="text-xs font-bold text-white">
                    {Math.round(Number(score))}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-1 text-sm text-textMuted">
              {[
                price != null ? formatMoney(price) : null,
                dscr != null && Number.isFinite(Number(dscr))
                  ? `${Number(dscr).toFixed(2)}x DSCR`
                  : null,
                cf != null && Number.isFinite(Number(cf))
                  ? `${formatMoney(Number(cf))}/mo`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {deal.project?.id ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/(tabs)/projects/${deal.project.id}`);
                  }}
                  className="rounded-full border border-border bg-surfaceAlt px-2 py-0.5"
                >
                  <Text className="text-[11px] text-textMuted" numberOfLines={1}>
                    {deal.isOwn ? "Your project · " : ""}
                    {deal.project.name}
                  </Text>
                </Pressable>
              ) : null}
              {showOwner ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/(tabs)/u/${ownerId}`);
                  }}
                  className="rounded-full border border-border bg-surface px-2 py-0.5"
                >
                  <Text className="text-[11px] text-primary" numberOfLines={1}>
                    {deal.ownerDisplayName ?? "Investor"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

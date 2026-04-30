import { useRouter } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";

import type { DealWithScore } from "@/lib/deals";
import { formatMoney } from "@/lib/format";

import { DSCRBadge } from "./DSCRBadge";

export function DealCard({ deal }: { deal: DealWithScore }) {
  const router = useRouter();
  const score = deal.score;
  const photo = deal.primary_image_url ?? (Array.isArray(deal.photos) ? (deal.photos as string[])[0] : undefined);

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(tabs)/deals/[id]", params: { id: deal.id } })}
      className="bg-surface border border-border rounded-2xl overflow-hidden mb-3 active:opacity-90"
    >
      <View>
        {photo ? (
          <Image source={{ uri: photo }} className="w-full h-44" resizeMode="cover" />
        ) : (
          <View className="w-full h-44 bg-surfaceAlt items-center justify-center">
            <Text className="text-textMuted text-xs">No photo</Text>
          </View>
        )}
        {typeof score?.score === "number" ? (
          <View className="absolute right-3 top-3 bg-black/65 rounded-full px-2 py-1">
            <Text className="text-white text-xs font-semibold">{score.score}</Text>
          </View>
        ) : null}
      </View>

      <View className="p-4">
        <View className="flex-row justify-between items-start mb-1">
          <Text className="text-text font-semibold flex-1 mr-2" numberOfLines={1}>
            {deal.address ?? "Address pending"}
          </Text>
          <Text className="text-text font-semibold">
            {formatMoney(deal.price ?? 0)}
          </Text>
        </View>

        <Text className="text-textMuted text-xs mb-3">
          {[
            deal.beds ? `${deal.beds} bd` : null,
            deal.baths ? `${deal.baths} ba` : null,
            deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : null,
            deal.city && deal.state ? `${deal.city}, ${deal.state}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        <View className="flex-row flex-wrap gap-2 mb-3">
          <DSCRBadge dscr={score?.dscr ?? null} />
          {score?.monthly_cashflow !== null && score?.monthly_cashflow !== undefined ? (
            <Tag
              label={`${score.monthly_cashflow >= 0 ? "+" : ""}${formatMoney(score.monthly_cashflow)}/mo`}
              tone={score.monthly_cashflow >= 0 ? "success" : "danger"}
            />
          ) : null}
          {deal.est_rent ? (
            <Tag label={`Rent ${formatMoney(deal.est_rent)}`} tone="muted" />
          ) : null}
        </View>

        {score?.rationale ? (
          <Text className="text-textMuted text-xs leading-5" numberOfLines={3}>
            {score.rationale}
          </Text>
        ) : score ? (
          <Text className="text-textMuted text-xs italic">Ranking…</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Tag({ label, tone = "muted" }: { label: string; tone?: "muted" | "success" | "danger" }) {
  const toneCls =
    tone === "success"
      ? "bg-success/10 border-success/30 text-success"
      : tone === "danger"
        ? "bg-danger/10 border-danger/30 text-danger"
        : "bg-surfaceAlt border-border text-text";
  return (
    <View className={`border rounded-full px-2 py-1 ${toneCls}`}>
      <Text className={`text-xs font-semibold ${toneCls}`}>{label}</Text>
    </View>
  );
}

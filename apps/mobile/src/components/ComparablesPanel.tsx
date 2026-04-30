import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { getComparables, type ComparableListing } from "@/lib/comparables";
import { formatMoney } from "@/lib/format";

export function ComparablesPanel({ dealId }: { dealId: string }) {
  const [comps, setComps] = useState<ComparableListing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const c = await getComparables(dealId);
      setComps(c);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!comps) {
    return (
      <View className="bg-surface border border-border rounded-2xl p-4">
        <Text className="text-text text-base font-semibold mb-2">Comparables</Text>
        {error ? (
          <Text className="text-danger text-xs mb-2">{error}</Text>
        ) : (
          <Text className="text-textMuted text-xs mb-3">
            Pull recent comps from RealEstateAPI for this property.
          </Text>
        )}
        <Button label="Load comparables" onPress={load} loading={loading} variant="secondary" />
      </View>
    );
  }

  if (comps.length === 0) {
    return (
      <View className="bg-surface border border-border rounded-2xl p-4">
        <Text className="text-text text-base font-semibold mb-2">Comparables</Text>
        <Text className="text-textMuted text-xs">No comparables returned.</Text>
      </View>
    );
  }

  return (
    <View className="bg-surface border border-border rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-text text-base font-semibold">Comparables</Text>
        <Pressable onPress={load} disabled={loading}>
          <Text className="text-primary text-xs">{loading ? "…" : "Refresh"}</Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {comps.map((c) => (
          <View
            key={c.id}
            className="flex-row items-center bg-surfaceAlt border border-border rounded-xl p-2"
          >
            {c.primaryListingImageUrl ? (
              <Image
                source={{ uri: c.primaryListingImageUrl }}
                style={{ width: 64, height: 64, borderRadius: 8 }}
              />
            ) : (
              <View className="w-16 h-16 bg-surface rounded-lg items-center justify-center">
                <Text className="text-textMuted text-[10px]">no img</Text>
              </View>
            )}
            <View className="flex-1 ml-3">
              <Text className="text-text text-sm" numberOfLines={1}>
                {c.address ?? "Address pending"}
              </Text>
              <Text className="text-textMuted text-xs mt-0.5">
                {[
                  c.beds ? `${c.beds} bd` : null,
                  c.baths ? `${c.baths} ba` : null,
                  c.sqft ? `${Math.round(c.sqft)} sqft` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text className="text-text text-sm font-semibold mt-1">
                {c.price ? formatMoney(c.price) : "—"}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

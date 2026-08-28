import {
  PROPERTY_TYPE_LABELS,
  type ProjectConstraints,
  type PropertyType,
} from "@papuc/core";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

const PROPERTY_TYPE_OPTIONS: PropertyType[] = [
  "single_family",
  "condo",
  "townhouse",
  "multi_family_2_4",
  "multi_family_5_plus",
  "manufactured",
  "land",
  "mixed_use",
  "commercial",
  "any",
];

function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  hint?: string;
}) {
  return (
    <View className="mb-3 flex-1 min-w-[45%]">
      <Text className="text-textMuted text-xs mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        className="bg-surfaceAlt border border-border rounded-xl px-3 py-2 text-text text-sm"
        placeholderTextColor="#888"
      />
      {hint ? (
        <Text className="text-textMuted text-[10px] mt-1">{hint}</Text>
      ) : null}
    </View>
  );
}

function numOrUndef(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function ConstraintEditor({
  constraints,
  onChange,
}: {
  constraints: ProjectConstraints;
  onChange: (c: ProjectConstraints) => void;
}) {
  function patch<K extends keyof ProjectConstraints>(
    k: K,
    v: ProjectConstraints[K],
  ) {
    onChange({ ...constraints, [k]: v });
  }

  function patchMortgage<K extends keyof ProjectConstraints["mortgage"]>(
    k: K,
    v: ProjectConstraints["mortgage"][K],
  ) {
    onChange({
      ...constraints,
      mortgage: { ...constraints.mortgage, [k]: v },
    });
  }

  function togglePropertyType(t: PropertyType) {
    const cur = constraints.propertyTypes;
    let next: PropertyType[];
    if (t === "any") {
      next = cur.includes("any") ? [] : ["any"];
    } else if (cur.includes(t)) {
      next = cur.filter((x) => x !== t);
    } else {
      next = [...cur.filter((x) => x !== "any"), t];
    }
    if (next.length === 0) next = ["any"];
    patch("propertyTypes", next);
  }

  function updateMarketAt(index: number, city: string, state: string) {
    const st = state.toUpperCase();
    const markets = [...constraints.markets];
    markets[index] = city.trim()
      ? { kind: "city", city, state: st || "CA" }
      : { kind: "state", state: st || "CA" };
    patch("markets", markets);
  }

  return (
    <View>
      {constraints.intent?.summary ? (
        <View className="mb-3 rounded-xl border border-border bg-surfaceAlt p-3">
          <Text className="text-textMuted text-xs mb-1">What we understood</Text>
          <Text className="text-text text-sm">{constraints.intent.summary}</Text>
        </View>
      ) : null}

      <Text className="text-text font-semibold mb-2">Markets</Text>
      {constraints.markets.map((m, i) => {
        const city =
          m.kind === "city"
            ? m.city
            : m.kind === "near"
              ? m.place
              : m.kind === "zip"
                ? m.zip
                : m.kind === "county"
                  ? m.county
                  : "";
        const state =
          m.kind === "city" ||
          m.kind === "county" ||
          m.kind === "state" ||
          m.kind === "near"
            ? (m.state ?? "")
            : "";
        return (
          <View key={i} className="flex-row gap-2 mb-2">
            <Field
              label="City / place"
              value={city}
              onChangeText={(v) => updateMarketAt(i, v, state || "CA")}
            />
            <Field
              label="State"
              value={state}
              onChangeText={(v) => updateMarketAt(i, city, v)}
            />
          </View>
        );
      })}

      <Text className="text-text font-semibold mb-2 mt-1">Property type</Text>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {PROPERTY_TYPE_OPTIONS.map((t) => {
          const active = constraints.propertyTypes.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => togglePropertyType(t)}
              className={`rounded-full border px-3 py-1.5 ${
                active
                  ? "bg-primary/20 border-primary"
                  : "bg-surfaceAlt border-border"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  active ? "text-primary" : "text-text"
                }`}
              >
                {PROPERTY_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="text-text font-semibold mb-2">Property filters</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field
          label="Min beds"
          value={String(constraints.bedsMin ?? "")}
          onChangeText={(v) => patch("bedsMin", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Max beds"
          value={String(constraints.bedsMax ?? "")}
          onChangeText={(v) => patch("bedsMax", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Min baths"
          value={String(constraints.bathsMin ?? "")}
          onChangeText={(v) => patch("bathsMin", numOrUndef(v))}
          keyboardType="decimal-pad"
        />
        <Field
          label="Max baths"
          value={String(constraints.bathsMax ?? "")}
          onChangeText={(v) => patch("bathsMax", numOrUndef(v))}
          keyboardType="decimal-pad"
        />
        <Field
          label="Min sqft"
          value={String(constraints.sqftMin ?? "")}
          onChangeText={(v) => patch("sqftMin", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Max sqft"
          value={String(constraints.sqftMax ?? "")}
          onChangeText={(v) => patch("sqftMax", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Min price ($)"
          value={String(constraints.priceMin ?? "")}
          onChangeText={(v) => patch("priceMin", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Max price ($)"
          value={String(constraints.priceMax ?? "")}
          onChangeText={(v) => patch("priceMax", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Min year built"
          value={String(constraints.yearBuiltMin ?? "")}
          onChangeText={(v) => patch("yearBuiltMin", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Max HOA ($/mo)"
          value={String(constraints.hoaMax ?? "")}
          onChangeText={(v) => patch("hoaMax", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Min lot (acres)"
          value={
            constraints.lotSizeMinSqft
              ? String(
                  Math.round((constraints.lotSizeMinSqft / 43_560) * 100) / 100,
                )
              : ""
          }
          onChangeText={(v) => {
            const acres = numOrUndef(v);
            patch(
              "lotSizeMinSqft",
              acres != null ? Math.round(acres * 43_560) : undefined,
            );
          }}
          keyboardType="decimal-pad"
        />
      </View>

      <Text className="text-text font-semibold mb-2 mt-1">Capital & mortgage</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field
          label="Down payment ($)"
          value={String(constraints.downPayment ?? "")}
          onChangeText={(v) => patch("downPayment", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Total cash ($)"
          value={String(constraints.totalCash ?? "")}
          onChangeText={(v) => patch("totalCash", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Rate APR (%)"
          value={(constraints.mortgage.rateAPR * 100).toFixed(2)}
          onChangeText={(v) => {
            const n = numOrUndef(v);
            patchMortgage("rateAPR", n != null ? n / 100 : 0.075);
          }}
          keyboardType="decimal-pad"
        />
        <Field
          label="Term (years)"
          value={String(constraints.mortgage.termYears)}
          onChangeText={(v) =>
            patchMortgage("termYears", numOrUndef(v) ?? 30)
          }
          keyboardType="numeric"
        />
        <Field
          label="LTV"
          value={constraints.mortgage.ltv.toFixed(2)}
          onChangeText={(v) =>
            patchMortgage("ltv", numOrUndef(v) ?? 0.75)
          }
          keyboardType="decimal-pad"
        />
      </View>
      <View className="flex-row items-center justify-between mb-3 rounded-xl border border-border bg-surfaceAlt px-3 py-2">
        <Text className="text-text text-sm">Interest only</Text>
        <Switch
          value={Boolean(constraints.mortgage.interestOnly)}
          onValueChange={(v) => patchMortgage("interestOnly", v)}
          trackColor={{ true: "#7c5cff", false: "#2a2a36" }}
        />
      </View>

      <Text className="text-text font-semibold mb-2">Goals</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field
          label="Target cashflow ($/mo)"
          value={String(constraints.targetMonthlyCashflow ?? "")}
          onChangeText={(v) => patch("targetMonthlyCashflow", numOrUndef(v))}
          keyboardType="numeric"
        />
        <Field
          label="Min DSCR"
          value={constraints.minDSCR.toFixed(2)}
          onChangeText={(v) => patch("minDSCR", numOrUndef(v) ?? 1)}
          keyboardType="decimal-pad"
        />
      </View>
      <View className="flex-row gap-2 mb-3">
        {(["LTR", "STR"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => patch("strategy", s)}
            className={`flex-1 rounded-xl border py-2 items-center ${
              constraints.strategy === s
                ? "bg-primary/20 border-primary"
                : "bg-surfaceAlt border-border"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                constraints.strategy === s ? "text-primary" : "text-text"
              }`}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Notes"
        value={constraints.notes ?? ""}
        onChangeText={(v) => patch("notes", v.trim() ? v : undefined)}
      />
    </View>
  );
}

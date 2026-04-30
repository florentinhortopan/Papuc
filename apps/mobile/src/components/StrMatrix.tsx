import { ScrollView, Text, TextInput, View } from "react-native";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export interface StrMatrixValue {
  monthlyNights: number[];
  monthlyADR: number[];
  monthlyOccupancy: number[];
  monthlyAvgStays: number[];
}

const ROWS: Array<{
  key: keyof StrMatrixValue;
  label: string;
  hint: string;
  step: number;
  formatter: (n: number) => string;
}> = [
  {
    key: "monthlyNights",
    label: "Nights",
    hint: "Days available per month",
    step: 1,
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyADR",
    label: "ADR ($)",
    hint: "Average daily rate",
    step: 1,
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyOccupancy",
    label: "Occ %",
    hint: "Occupancy fraction (0–1)",
    step: 0.01,
    formatter: (n) => n.toFixed(2),
  },
  {
    key: "monthlyAvgStays",
    label: "Stays",
    hint: "Bookings per month",
    step: 1,
    formatter: (n) => String(Math.round(n)),
  },
];

export function StrMatrix({
  value,
  onChange,
}: {
  value: StrMatrixValue;
  onChange: (v: StrMatrixValue) => void;
}) {
  function updateCell(key: keyof StrMatrixValue, monthIdx: number, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next: StrMatrixValue = {
      monthlyNights: [...value.monthlyNights],
      monthlyADR: [...value.monthlyADR],
      monthlyOccupancy: [...value.monthlyOccupancy],
      monthlyAvgStays: [...value.monthlyAvgStays],
    };
    next[key][monthIdx] = n;
    onChange(next);
  }

  return (
    <View className="bg-surfaceAlt border border-border rounded-2xl p-3">
      <Text className="text-text text-sm font-semibold mb-2">12-month STR matrix</Text>
      <Text className="text-textMuted text-xs mb-3">
        Row 31-34 of the Berkeley sheet: nights, ADR, occupancy, stays per month.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className="flex-row mb-1">
            <View style={{ width: 80 }} />
            {MONTHS.map((m, i) => (
              <View key={i} style={{ width: 56 }} className="items-center">
                <Text className="text-textMuted text-[10px]">{m}</Text>
              </View>
            ))}
          </View>
          {ROWS.map((row) => (
            <View key={row.key} className="flex-row mb-1 items-center">
              <View style={{ width: 80 }}>
                <Text className="text-text text-xs">{row.label}</Text>
                <Text className="text-textMuted text-[10px]">{row.hint}</Text>
              </View>
              {value[row.key].map((v, i) => (
                <View key={i} style={{ width: 56 }} className="px-0.5">
                  <TextInput
                    className="bg-surface border border-border rounded-md px-1.5 py-1 text-text text-xs text-center"
                    value={row.formatter(v)}
                    onChangeText={(text) => updateCell(row.key, i, text)}
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function defaultStrMatrix(adr: number): StrMatrixValue {
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return {
    monthlyNights: monthDays,
    monthlyADR: new Array(12).fill(adr),
    monthlyOccupancy: [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.95, 0.85, 0.75, 0.6, 0.55],
    monthlyAvgStays: new Array(12).fill(8),
  };
}

import { ScrollView, Text, TextInput, View } from "react-native";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const LABEL_W = 88;
const CELL_W = 64;
const ROW_H = 52;
const HEADER_H = 28;

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
  formatter: (n: number) => string;
}> = [
  {
    key: "monthlyNights",
    label: "Nights",
    hint: "Days available",
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyADR",
    label: "ADR ($)",
    hint: "Avg daily rate",
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyOccupancy",
    label: "Occ %",
    hint: "0–1 fraction",
    formatter: (n) => n.toFixed(2),
  },
  {
    key: "monthlyAvgStays",
    label: "Stays",
    hint: "Bookings / mo",
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
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 pr-2">
          <Text className="text-text text-sm font-semibold">
            12-month STR matrix
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">
            Swipe months sideways — row labels stay put.
          </Text>
        </View>
        <Text className="text-textMuted text-[10px] pt-0.5">← swipe →</Text>
      </View>

      {/* Sticky labels + independently swipeable month grid */}
      <View className="flex-row">
        <View style={{ width: LABEL_W }}>
          <View style={{ height: HEADER_H }} />
          {ROWS.map((row) => (
            <View
              key={row.key}
              style={{ height: ROW_H, width: LABEL_W, justifyContent: "center" }}
              className="pr-2"
            >
              <Text className="text-text text-xs font-medium">{row.label}</Text>
              <Text className="text-textMuted text-[10px]">{row.hint}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 1 }}
        >
          <View>
            <View
              className="flex-row items-center"
              style={{ height: HEADER_H }}
            >
              {MONTHS.map((m, i) => (
                <View
                  key={i}
                  style={{ width: CELL_W }}
                  className="items-center justify-center"
                >
                  <Text className="text-textMuted text-xs font-medium">{m}</Text>
                </View>
              ))}
            </View>
            {ROWS.map((row) => (
              <View
                key={row.key}
                className="flex-row items-center"
                style={{ height: ROW_H }}
              >
                {value[row.key].map((v, i) => (
                  <View
                    key={i}
                    style={{ width: CELL_W, paddingHorizontal: 4 }}
                    className="justify-center"
                  >
                    <TextInput
                      className="bg-surface border border-border rounded-md px-2 py-2 text-text text-sm text-center"
                      style={{ minHeight: 36 }}
                      value={row.formatter(v)}
                      onChangeText={(text) => updateCell(row.key, i, text)}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`${row.label} ${MONTHS[i]}`}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export function defaultStrMatrix(adr: number): StrMatrixValue {
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return {
    monthlyNights: monthDays,
    monthlyADR: new Array(12).fill(adr),
    monthlyOccupancy: [
      0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.95, 0.85, 0.75, 0.6, 0.55,
    ],
    monthlyAvgStays: new Array(12).fill(8),
  };
}

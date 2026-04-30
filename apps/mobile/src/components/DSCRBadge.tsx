import { Text, View } from "react-native";

import { formatDscr } from "@/lib/format";

export function DSCRBadge({ dscr }: { dscr: number | null | undefined }) {
  if (dscr === null || dscr === undefined) {
    return (
      <View className="bg-surfaceAlt border border-border rounded-full px-2 py-1">
        <Text className="text-textMuted text-xs font-semibold">DSCR —</Text>
      </View>
    );
  }
  let style = "bg-danger/15 border-danger/30";
  let textStyle = "text-danger";
  if (dscr >= 1.25) {
    style = "bg-success/15 border-success/30";
    textStyle = "text-success";
  } else if (dscr >= 1.0) {
    style = "bg-warning/15 border-warning/30";
    textStyle = "text-warning";
  }
  return (
    <View className={`border rounded-full px-2 py-1 ${style}`}>
      <Text className={`text-xs font-semibold ${textStyle}`}>
        DSCR {formatDscr(dscr)}
      </Text>
    </View>
  );
}

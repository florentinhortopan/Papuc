import { Text, View } from "react-native";

import { apiBaseUrl } from "@/lib/api";
import {
  buildLabel,
  getLastError,
  isDebugBuild,
  updateChannel,
} from "@/lib/debug";

/** Dev / preview only — API URL, channel, build, last error. */
export function DebugFooter() {
  if (!isDebugBuild()) return null;
  const err = getLastError();
  return (
    <View className="border-t border-border bg-surfaceAlt px-3 py-2">
      <Text className="text-[10px] text-textMuted" numberOfLines={1}>
        {buildLabel()} · {updateChannel()} · {apiBaseUrl() || "(no API URL)"}
      </Text>
      {err ? (
        <Text className="mt-1 text-[10px] text-danger" numberOfLines={2}>
          {err}
        </Text>
      ) : null}
    </View>
  );
}

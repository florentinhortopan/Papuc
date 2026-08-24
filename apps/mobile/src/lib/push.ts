import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { router } from "expo-router";

import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function dealDeepLink(dealId: string): string {
  return Linking.createURL(`deals/${dealId}`);
}

/** Wire notification taps → deal route (Home sheet opens via deal page). */
export function attachNotificationResponseHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const data = res.notification.request.content.data as {
      dealId?: string;
      projectId?: string;
    };
    if (data?.dealId) {
      router.push(`/(tabs)/deals/${data.dealId}`);
    }
  });
  return () => sub.remove();
}

export async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#7c5cff",
    });
  }

  const easExtra = (Constants.expoConfig?.extra ?? {}) as {
    eas?: { projectId?: string };
  };
  const projectId: string | undefined = easExtra.eas?.projectId;
  if (!projectId || projectId.startsWith("REPLACE")) {
    console.warn("[push] EAS projectId missing — set app.json extra.eas.projectId");
  }
  const token = projectId && !projectId.startsWith("REPLACE")
    ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
    : (await Notifications.getExpoPushTokenAsync()).data;

  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return token;
  const insertRow = {
    user_id: userId,
    token,
    platform: Platform.OS,
  };
  await (supabase.from("device_tokens") as any).upsert(insertRow, {
    onConflict: "user_id,token",
  });
  return token;
}

export { dealDeepLink };

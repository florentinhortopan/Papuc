import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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

  const easExtra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  const projectId: string | undefined = easExtra.eas?.projectId;
  const token = projectId
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

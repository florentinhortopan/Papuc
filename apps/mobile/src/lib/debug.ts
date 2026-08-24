import Constants from "expo-constants";

/** True for development / preview builds — shows debug footer. */
export function isDebugBuild(): boolean {
  if (__DEV__) return true;
  const channel =
    (Constants.expoConfig?.extra as { eas?: { channel?: string } } | undefined)
      ?.eas?.channel ??
    Constants.expoConfig?.updates?.requestHeaders?.["expo-channel-name"] ??
    process.env.EXPO_PUBLIC_UPDATE_CHANNEL;
  return channel === "development" || channel === "preview";
}

export function buildLabel(): string {
  const v = Constants.expoConfig?.version ?? "?";
  const native =
    Constants.nativeBuildVersion ?? Constants.nativeAppVersion ?? "";
  return native ? `${v} (${native})` : v;
}

export function updateChannel(): string {
  return (
    (Constants.expoConfig?.extra as { eas?: { channel?: string } } | undefined)
      ?.eas?.channel ??
    process.env.EXPO_PUBLIC_UPDATE_CHANNEL ??
    (__DEV__ ? "dev-client" : "unknown")
  );
}

let lastError: string | null = null;

export function setLastError(err: unknown): void {
  lastError =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
}

export function getLastError(): string | null {
  return lastError;
}

/**
 * Send Expo push notifications (https://docs.expo.dev/push-notifications/sending-notifications/).
 */

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
};

export async function sendExpoPush(
  messages: ExpoPushMessage[],
): Promise<{ ok: boolean; tickets?: unknown; error?: string }> {
  if (messages.length === 0) return { ok: true, tickets: [] };
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: `Expo push HTTP ${res.status}`,
        tickets: json,
      };
    }
    return { ok: true, tickets: json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

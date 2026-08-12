/** Manual re-scout is usually wasted while listings newer than a day were already pulled. */
export const SCOUT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isScoutWithinCooldown(
  lastScoutAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!lastScoutAt) return false;
  const t = Date.parse(lastScoutAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < SCOUT_COOLDOWN_MS;
}

/** e.g. "Scouted 3h ago" / "Scouted just now" / null if never. */
export function formatScoutedAgo(
  lastScoutAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!lastScoutAt) return null;
  const t = Date.parse(lastScoutAt);
  if (!Number.isFinite(t)) return null;
  const elapsed = Math.max(0, nowMs - t);
  const mins = Math.floor(elapsed / 60_000);
  if (mins < 1) return "Scouted just now";
  if (mins < 60) return `Scouted ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Scouted ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Scouted ${days}d ago`;
}

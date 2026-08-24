import type { SubscriptionTier } from "./database.types";
import { createAdminClient } from "./supabase/admin";

export type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription_tier: SubscriptionTier;
  created_at: string;
};

export async function listProfilesForAdmin(): Promise<AdminUserRow[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, display_name, subscription_tier, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export async function setSubscriptionTier(
  userIds: string[],
  tier: SubscriptionTier,
): Promise<{ updated: number }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return { updated: 0 };
  if (tier !== "pro" && tier !== "free") {
    throw new Error("invalid tier");
  }
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("profiles")
    .update({ subscription_tier: tier })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { updated: data?.length ?? 0 };
}

/** Set every profile to the given tier — used by cron grant-pro?all=1. */
export async function setAllSubscriptionTiers(
  tier: SubscriptionTier,
): Promise<{
  total: number;
  upgraded: number;
  already: number;
  users: Array<{ email: string | null; tier: SubscriptionTier }>;
}> {
  if (tier !== "pro" && tier !== "free") {
    throw new Error("invalid tier");
  }
  const sb = createAdminClient();
  const { data: before, error: listErr } = await sb
    .from("profiles")
    .select("id, email, display_name, subscription_tier, created_at")
    .order("email");
  if (listErr) throw listErr;

  const { data: updated, error: updErr } = await sb
    .from("profiles")
    .update({ subscription_tier: tier })
    .neq("subscription_tier", tier)
    .select("id");
  if (updErr) throw updErr;

  const { data: after, error: afterErr } = await sb
    .from("profiles")
    .select("id, email, subscription_tier")
    .order("email");
  if (afterErr) throw afterErr;

  const rows = after ?? [];
  return {
    total: rows.length,
    upgraded: updated?.length ?? 0,
    already: (before ?? []).filter((p) => p.subscription_tier === tier)
      .length,
    users: rows.map((p) => ({
      email: (p.email as string | null) ?? null,
      tier: p.subscription_tier as SubscriptionTier,
    })),
  };
}

/** Lookup by email (normalized) and set tier — used by cron grant-pro. */
export async function setSubscriptionTierByEmail(
  email: string,
  tier: SubscriptionTier,
): Promise<{
  before: AdminUserRow | null;
  after: AdminUserRow | null;
  found: boolean;
}> {
  const normalized = email.trim().toLowerCase();
  const sb = createAdminClient();
  const { data: beforeRows, error: findErr } = await sb
    .from("profiles")
    .select("id, email, display_name, subscription_tier, created_at")
    .eq("email", normalized);
  if (findErr) throw findErr;
  if (!beforeRows?.length) {
    return { before: null, after: null, found: false };
  }
  const before = beforeRows[0] as AdminUserRow;
  const { data: afterRows, error: updErr } = await sb
    .from("profiles")
    .update({ subscription_tier: tier })
    .eq("email", normalized)
    .select("id, email, display_name, subscription_tier, created_at");
  if (updErr) throw updErr;
  return {
    before,
    after: (afterRows?.[0] as AdminUserRow) ?? null,
    found: true,
  };
}

export async function getEmailsForUserIds(
  userIds: string[],
): Promise<Array<{ id: string; email: string }>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("profiles")
    .select("id, email")
    .in("id", ids);
  if (error) throw error;
  const out: Array<{ id: string; email: string }> = [];
  for (const row of data ?? []) {
    const email =
      typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (email.includes("@")) {
      out.push({ id: row.id as string, email });
    }
  }
  return out;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProfileRow } from "./database.types";
import { LEGAL_VERSION } from "./legal";

export async function getProfile(
  supabase: SupabaseClient,
): Promise<ProfileRow | null> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data as unknown as ProfileRow;
}

export async function markOnboarded(supabase: SupabaseClient): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;
  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
}

/** Persist clickwrap acceptance of the current legal document pack. */
export async function acceptLegalTerms(
  supabase: SupabaseClient,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await supabase
    .from("profiles")
    .update({
      legal_accepted_at: new Date().toISOString(),
      legal_version: LEGAL_VERSION,
    })
    .eq("id", userId);
  if (error) throw error;
}

export async function updateProfileSettings(
  supabase: SupabaseClient,
  patch: {
    auto_condition_analysis?: boolean;
    nightly_scouts_paused?: boolean;
    email_digests_enabled?: boolean;
    display_name?: string | null;
  },
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const update: Record<string, unknown> = { ...patch };
  if (patch.display_name !== undefined) {
    const trimmed = patch.display_name?.trim().slice(0, 80) ?? "";
    update.display_name = trimmed || null;
  }
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);
  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProfileRow } from "./database.types";

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

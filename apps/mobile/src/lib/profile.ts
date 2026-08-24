import { supabase } from "./supabase";
import type { ProfileRow } from "./database.types";

export async function getProfile(): Promise<ProfileRow | null> {
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

export async function markOnboarded(): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;
  await (supabase.from("profiles") as any)
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
}

export async function updateProfile(
  patch: Partial<
    Pick<ProfileRow, "email_digests_enabled" | "display_name" | "nightly_scouts_paused">
  >,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await (supabase.from("profiles") as any)
    .update(patch)
    .eq("id", userId);
  if (error) throw error;
}


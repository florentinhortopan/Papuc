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

import { SettingsClient } from "@/components/settings-client";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings — Papuc" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getProfile(supabase);

  return (
    <SettingsClient
      email={user?.email ?? null}
      tier={profile?.subscription_tier ?? "free"}
    />
  );
}

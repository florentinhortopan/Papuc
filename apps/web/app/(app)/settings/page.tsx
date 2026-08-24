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
      userId={user?.id ?? null}
      displayName={profile?.display_name ?? null}
      tier={profile?.subscription_tier ?? "free"}
      autoConditionAnalysis={profile?.auto_condition_analysis ?? true}
      nightlyScoutsPaused={profile?.nightly_scouts_paused ?? false}
      emailDigestsEnabled={profile?.email_digests_enabled ?? true}
    />
  );
}

import type { Metadata } from "next";

import { SettingsClient } from "@/components/settings-client";
import { isAdminEmail } from "@/lib/admin";
import { getProfile } from "@/lib/profile";
import { PAGE_DESCRIPTIONS } from "@/lib/site-meta";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
  description: PAGE_DESCRIPTIONS.settings,
};
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
      isAdmin={isAdminEmail(user?.email)}
      legalAcceptedAt={profile?.legal_accepted_at ?? null}
      legalVersion={profile?.legal_version ?? null}
    />
  );
}

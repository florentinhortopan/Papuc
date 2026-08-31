import { notFound } from "next/navigation";

import { InviteAcceptClient } from "@/components/invite-accept-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, name, owner_id")
    .eq("collab_invite_token", token)
    .maybeSingle();
  if (!project) notFound();

  const { data: profile } = await admin
    .from("public_profiles")
    .select("display_name")
    .eq("id", project.owner_id)
    .maybeSingle();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ownerDisplayName =
    (profile?.display_name as string | null)?.trim() ||
    `Investor ${String(project.owner_id).slice(0, 8)}`;

  return (
    <InviteAcceptClient
      token={token}
      projectName={project.name as string}
      ownerDisplayName={ownerDisplayName}
      signedIn={Boolean(user)}
    />
  );
}

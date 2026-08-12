import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDetailClient } from "@/components/project-detail-client";
import { listDeals } from "@/lib/deals";
import { getProfile } from "@/lib/profile";
import { getProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  let project;
  try {
    project = await getProject(supabase, id);
  } catch {
    notFound();
  }
  // Deals are permanent rows — an empty result here should only ever mean
  // "no deals scouted yet". If the read *fails* (deploy in progress,
  // transient network error), say so instead of silently rendering an
  // empty grid that looks like the deals vanished; the client retries on
  // mount either way.
  let initialDeals: Awaited<ReturnType<typeof listDeals>> = [];
  let initialLoadFailed = false;
  try {
    initialDeals = await listDeals(supabase, id);
  } catch {
    initialLoadFailed = true;
  }
  const profile = await getProfile(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && user.id === project.owner_id);

  return (
    <div>
      <Link
        href={isOwner ? "/projects" : "/home"}
        className="text-textMuted text-sm hover:text-text"
      >
        ← {isOwner ? "Projects" : "Home"}
      </Link>
      <ProjectDetailClient
        project={project}
        initialDeals={initialDeals}
        initialLoadFailed={initialLoadFailed}
        subscriptionTier={profile?.subscription_tier ?? "free"}
        isOwner={isOwner}
      />
    </div>
  );
}

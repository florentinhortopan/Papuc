import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDetailClient } from "@/components/project-detail-client";
import { listDeals } from "@/lib/deals";
import { getProfile } from "@/lib/profile";
import { getProjectAccess } from "@/lib/project-members";
import { getProject } from "@/lib/projects";
import {
  countProjectWatchers,
  getPublicProfile,
  isFollowingUser,
  isWatchingProject,
  publicDisplayName,
} from "@/lib/social";
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
  let access: Awaited<ReturnType<typeof getProjectAccess>> = {
    role: null,
    canEdit: false,
    canManage: false,
    isMember: false,
  };
  try {
    access = await getProjectAccess(supabase, project, user?.id);
  } catch {
    // Collab/membership lookup must not blank the deals grid.
    if (user?.id === project.owner_id) {
      access = {
        role: "owner",
        canEdit: true,
        canManage: true,
        isMember: false,
      };
    }
  }
  const isOwner = access.role === "owner";
  const canEdit = access.canEdit;

  let watcherCount = 0;
  let ownerProfile: Awaited<ReturnType<typeof getPublicProfile>> = null;
  let initialWatching = false;
  let initialFollowing = false;
  try {
    [watcherCount, ownerProfile, initialWatching, initialFollowing] =
      await Promise.all([
        countProjectWatchers(supabase, project.id),
        getPublicProfile(supabase, project.owner_id),
        user && !isOwner
          ? isWatchingProject(supabase, project.id, user.id)
          : Promise.resolve(false),
        user && !isOwner
          ? isFollowingUser(supabase, user.id, project.owner_id)
          : Promise.resolve(false),
      ]);
  } catch {
    // Social enrichment must not block the deals grid.
  }
  const ownerDisplayName = ownerProfile
    ? publicDisplayName(ownerProfile)
    : null;

  return (
    <div>
      <Link
        href={isOwner || canEdit ? "/projects" : "/home"}
        className="text-textMuted text-sm hover:text-text"
      >
        ← {isOwner || canEdit ? "Projects" : "Home"}
      </Link>
      <ProjectDetailClient
        project={project}
        initialDeals={initialDeals}
        initialLoadFailed={initialLoadFailed}
        subscriptionTier={profile?.subscription_tier ?? "free"}
        isOwner={isOwner}
        canEdit={canEdit}
        initialWatching={initialWatching}
        initialFollowing={initialFollowing}
        watcherCount={watcherCount}
        ownerDisplayName={ownerDisplayName}
      />
    </div>
  );
}

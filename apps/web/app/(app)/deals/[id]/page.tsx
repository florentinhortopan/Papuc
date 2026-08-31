import Link from "next/link";
import { notFound } from "next/navigation";

import { DealDetailClient } from "@/components/deal-detail-client";
import { UserAvatar } from "@/components/user-avatar";
import { getDeal } from "@/lib/deals";
import { getProfile } from "@/lib/profile";
import { getProject } from "@/lib/projects";
import {
  getPublicProfile,
  isFollowingUser,
  publicDisplayName,
} from "@/lib/social";
import { getCachedMarketStrIntel } from "@/lib/str-intel";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  let deal;
  try {
    deal = await getDeal(supabase, id);
  } catch {
    notFound();
  }
  let project;
  try {
    project = await getProject(supabase, deal.project_id);
  } catch {
    notFound();
  }

  // STR projects: hand the client the same cached market ADR intel the
  // scout underwrote with, so the pro-forma editor seeds identical
  // numbers to the ones on the deal card. Cache read only — research on
  // a cold cache is triggered client-side by the regulations card.
  const strIntel =
    project.constraints.strategy === "STR" && deal.city && deal.state
      ? await getCachedMarketStrIntel(supabase, deal.city, deal.state)
      : null;
  const marketAdrIntel = strIntel
    ? {
        adrLow: strIntel.adr_low ?? undefined,
        adrMedian: strIntel.adr_median ?? undefined,
        adrHigh: strIntel.adr_high ?? undefined,
        occupancyAvg: strIntel.occupancy_avg ?? undefined,
      }
    : null;

  const profile = await getProfile(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && user.id === project.owner_id);
  const [ownerProfile, initialFollowing] = await Promise.all([
    getPublicProfile(supabase, project.owner_id),
    user && !isOwner
      ? isFollowingUser(supabase, user.id, project.owner_id)
      : Promise.resolve(false),
  ]);
  const ownerDisplayName = ownerProfile
    ? publicDisplayName(ownerProfile)
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <Link
          href={`/projects/${project.id}`}
          className="text-textMuted text-sm hover:text-text"
        >
          ← {project.name}
        </Link>
        {!isOwner ? (
          <Link
            href={`/u/${project.owner_id}`}
            className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
          >
            <UserAvatar
              url={ownerProfile?.avatar_url}
              name={ownerDisplayName}
              size="xs"
            />
            {ownerDisplayName ?? "Investor"}
          </Link>
        ) : null}
      </div>
      <DealDetailClient
        deal={deal}
        project={project}
        marketAdrIntel={marketAdrIntel}
        autoConditionAnalysis={
          isOwner ? (profile?.auto_condition_analysis ?? true) : false
        }
        isOwner={isOwner}
        subscriptionTier={profile?.subscription_tier ?? "free"}
        ownerDisplayName={ownerDisplayName}
        initialFollowing={initialFollowing}
      />
    </div>
  );
}

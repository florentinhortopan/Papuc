import Link from "next/link";
import { notFound } from "next/navigation";

import { DealDetailClient } from "@/components/deal-detail-client";
import { getDeal } from "@/lib/deals";
import { getProfile } from "@/lib/profile";
import { getProject } from "@/lib/projects";
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

  return (
    <div>
      <Link
        href={`/projects/${project.id}`}
        className="text-textMuted text-sm hover:text-text"
      >
        ← {project.name}
      </Link>
      <DealDetailClient
        deal={deal}
        project={project}
        marketAdrIntel={marketAdrIntel}
        autoConditionAnalysis={
          isOwner ? (profile?.auto_condition_analysis ?? true) : false
        }
        isOwner={isOwner}
        subscriptionTier={profile?.subscription_tier ?? "free"}
      />
    </div>
  );
}

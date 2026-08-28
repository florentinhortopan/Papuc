import Link from "next/link";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { InvestorProfileEditor } from "@/components/investor-profile-editor";
import { Badge } from "@/components/ui/badge";
import { formatMarket } from "@/lib/format";
import { listPublicProjectsForOwner } from "@/lib/projects";
import {
  getInvestorProfile,
  publicDisplayName,
} from "@/lib/social";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = await getInvestorProfile(supabase, id, user?.id ?? null);
  if (!profile) notFound();

  const projects = await listPublicProjectsForOwner(supabase, id);

  // Recent high-score public deals across their public projects.
  const projectIds = projects.map((p) => p.id);
  let recentDeals: Array<{
    id: string;
    primary_image_url: string | null;
    photos: unknown;
    address: string | null;
    city: string | null;
    state: string | null;
    price: number | null;
    last_refreshed_at: string;
    project_id: string;
    source: string;
    source_property_id: string;
    deal_scores: Array<{ score: number; monthly_cashflow: number | null }> | null;
  }> = [];

  if (projectIds.length > 0) {
    const { data } = await supabase
      .from("deals")
      .select(
        "id, primary_image_url, photos, address, city, state, price, last_refreshed_at, project_id, source, source_property_id, deal_scores(score, monthly_cashflow)",
      )
      .in("project_id", projectIds)
      .eq("inventory_status", "live")
      .order("last_refreshed_at", { ascending: false })
      .limit(24);
    recentDeals = (data ?? []) as typeof recentDeals;
  }

  const scored = recentDeals
    .map((d) => {
      const scoreRow = Array.isArray(d.deal_scores)
        ? d.deal_scores[0]
        : d.deal_scores;
      return { deal: d, score: scoreRow?.score ?? 0, cashflow: scoreRow?.monthly_cashflow ?? null };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const name = publicDisplayName(profile);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {profile.subscription_tier === "pro" ? (
              <Badge>Pro</Badge>
            ) : null}
            <span className="text-textMuted text-sm">
              {profile.followerCount} followers · {profile.followingCount}{" "}
              following · {profile.publicProjectCount} public scouts
            </span>
          </div>
          {profile.isSelf ? (
            <p className="text-textMuted text-xs mt-2">
              Public projects on Discover appear here.{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Settings
              </Link>
            </p>
          ) : null}
        </div>
        {profile.isSelf ? (
          <InvestorProfileEditor initialDisplayName={profile.display_name} />
        ) : user ? (
          <FollowButton
            userId={profile.id}
            initialFollowing={profile.isFollowing}
          />
        ) : (
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/u/${id}`)}`}
            className="text-primary text-sm hover:underline"
          >
            Sign in to follow
          </Link>
        )}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Public scouts</h2>
        {projects.length === 0 ? (
          <p className="text-textMuted text-sm">
            No public projects yet
            {profile.isSelf
              ? " — turn on “Show on Discover” on a project."
              : "."}
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => {
              const markets = p.constraints.markets
                .slice(0, 3)
                .map((m) => formatMarket(m))
                .join(" · ");
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block rounded-2xl border border-border bg-surface px-4 py-3 hover:border-primary/40 transition-colors"
                  >
                    <p className="text-text font-medium">{p.name}</p>
                    <p className="text-textMuted text-xs mt-0.5 truncate">
                      {p.constraints.strategy}
                      {markets ? ` · ${markets}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent public deals</h2>
        {scored.length === 0 ? (
          <p className="text-textMuted text-sm">No public deals yet.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {scored.map(({ deal, score, cashflow }) => {
              const project = projectById.get(deal.project_id);
              if (!project) return null;
              const photo =
                deal.primary_image_url ??
                (Array.isArray(deal.photos)
                  ? (deal.photos as string[])[0]
                  : undefined);
              const place = [deal.city, deal.state].filter(Boolean).join(", ");
              return (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="w-[220px] shrink-0"
                >
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surfaceAlt border border-border">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-textMuted text-xs">No photo</span>
                      </div>
                    )}
                    {score > 0 ? (
                      <div className="absolute right-2 top-2 bg-black/65 rounded-full px-2 py-0.5">
                        <span className="text-white text-xs font-semibold">
                          {score}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <p className="text-text text-sm font-semibold mt-2 truncate">
                    {(deal.address?.split(",")[0] ?? place) || "Listing"}
                  </p>
                  <p className="text-textMuted text-xs truncate">
                    {[
                      place || null,
                      cashflow != null
                        ? `${Number(cashflow) >= 0 ? "+" : ""}$${Math.round(Number(cashflow)).toLocaleString()}/mo`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import { NightlyScoutToggle } from "@/components/nightly-scout-toggle";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@/lib/database.types";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import type { ProjectListItem } from "@/lib/projects";

export function ProjectListItemCard({
  project,
  subscriptionTier,
}: {
  project: ProjectListItem;
  subscriptionTier: SubscriptionTier;
}) {
  const market = formatMarket(project.constraints.markets[0]);
  const c = project.constraints;
  const [nightlyEnabled, setNightlyEnabled] = useState(
    project.nightly_scout_enabled ?? true,
  );

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-2xl overflow-hidden hover:border-border/80 transition-colors">
      <Link
        href={`/projects/${project.id}`}
        className="flex flex-col flex-1 min-h-0"
      >
        <ProjectPhotoMosaic photos={project.mosaicPhotos} />
        <div className="p-4 pb-0 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-2 mb-2 min-h-7">
            <p className="text-text text-lg font-semibold truncate flex-1 leading-7">
              {project.name}
            </p>
            <span className="text-textMuted text-xs capitalize shrink-0 leading-7">
              {project.status}
            </span>
          </div>
          <p className="text-textMuted text-sm line-clamp-2 min-h-10 mb-3 leading-5">
            {project.raw_prompt}
          </p>
          <div className="flex flex-wrap content-start gap-2 min-h-[3.25rem] mb-3">
            <Badge>
              {project.dealCount === 1
                ? "1 deal"
                : `${project.dealCount} deals`}
            </Badge>
            <Badge>{market}</Badge>
            <Badge>{c.strategy}</Badge>
            {c.priceMax ? <Badge>≤ {formatMoney(c.priceMax)}</Badge> : null}
            {c.targetMonthlyCashflow ? (
              <Badge>{formatMoney(c.targetMonthlyCashflow)}/mo</Badge>
            ) : null}
            <Badge>DSCR ≥ {c.minDSCR.toFixed(2)}</Badge>
          </div>
        </div>
      </Link>
      <div className="mt-auto px-4 pb-4 pt-1 flex items-center justify-between gap-3 min-h-10">
        <p className="text-textMuted text-xs truncate min-w-0">
          {project.last_scout_at
            ? `Last scout ${formatDate(project.last_scout_at)}`
            : "Not scouted yet"}
        </p>
        <NightlyScoutToggle
          projectId={project.id}
          enabled={nightlyEnabled}
          onEnabledChange={setNightlyEnabled}
          subscriptionTier={subscriptionTier}
          compact
        />
      </div>
    </div>
  );
}

function ProjectPhotoMosaic({ photos }: { photos: (string | null)[] }) {
  return (
    <div className="grid grid-cols-3 grid-rows-2 aspect-[3/2] bg-surfaceAlt shrink-0">
      {photos.map((url, i) =>
        url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            key={`empty-${i}`}
            className="w-full h-full bg-surfaceAlt border border-border/40 flex items-center justify-center"
            aria-hidden
          >
            <span className="block w-5 h-5 rounded-sm border border-dashed border-border/70" />
          </div>
        ),
      )}
    </div>
  );
}

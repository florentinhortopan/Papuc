import Link from "next/link";

import { DscrBadge } from "@/components/dscr-badge";
import { Badge } from "@/components/ui/badge";
import type { DealWithScore } from "@/lib/deals";
import { formatMoney } from "@/lib/format";

export function DealCard({ deal }: { deal: DealWithScore }) {
  const score = deal.score;
  const photo =
    deal.primary_image_url ??
    (Array.isArray(deal.photos) ? (deal.photos as string[])[0] : undefined);

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="bg-surface border border-border rounded-2xl overflow-hidden block hover:border-border/80 transition-colors"
    >
      <div className="relative">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={deal.address ?? "deal"}
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="w-full h-48 bg-surfaceAlt flex items-center justify-center">
            <span className="text-textMuted text-xs">No photo</span>
          </div>
        )}
        {typeof score?.score === "number" ? (
          <div className="absolute right-3 top-3 bg-black/65 rounded-full px-2 py-1">
            <span className="text-white text-xs font-semibold">
              {score.score}
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-1">
          <p className="text-text font-semibold truncate flex-1">
            {deal.address ?? "Address pending"}
          </p>
          <div className="text-right">
            <p className="text-text font-semibold">
              {formatMoney(deal.price ?? deal.est_value)}
            </p>
            <p className="text-textMuted text-[10px] uppercase tracking-wide">
              {deal.price ? "List price" : "Est. value"}
            </p>
          </div>
        </div>

        <p className="text-textMuted text-xs mb-3">
          {[
            deal.beds ? `${deal.beds} bd` : null,
            deal.baths ? `${deal.baths} ba` : null,
            deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : null,
            deal.city && deal.state ? `${deal.city}, ${deal.state}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <DscrBadge dscr={score?.dscr ?? null} />
          {score?.monthly_cashflow != null ? (
            <Badge variant={score.monthly_cashflow >= 0 ? "success" : "danger"}>
              {score.monthly_cashflow >= 0 ? "+" : ""}
              {formatMoney(score.monthly_cashflow)}/mo
            </Badge>
          ) : null}
          {deal.est_rent ? (
            <Badge>Rent {formatMoney(deal.est_rent)}</Badge>
          ) : null}
        </div>

        {score?.rationale ? (
          <p className="text-textMuted text-xs leading-5 line-clamp-3">
            {score.rationale}
          </p>
        ) : score ? (
          <p className="text-textMuted text-xs italic">Ranking…</p>
        ) : null}
      </div>
    </Link>
  );
}

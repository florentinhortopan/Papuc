import { estimateSTRAdrFromLTRRent, type Strategy } from "@papuc/core";
import Link from "next/link";

import { CashflowBadge } from "@/components/cashflow-badge";
import { DscrBadge } from "@/components/dscr-badge";
import { MarketSignalBadges } from "@/components/market-signal-badges";
import { Badge } from "@/components/ui/badge";
import { dealStreetAddress } from "@/lib/deal-address";
import type { DealWithScore } from "@/lib/deals";
import { formatMoney } from "@/lib/format";
import { getDealSourceLink } from "@/lib/source-url";

const ADR_SOURCE_LABEL: Record<string, string> = {
  airroi: "from Airbnb comps for this address",
  market_checked: "rent-derived, sanity-checked against researched market rates",
  heuristic: "derived from the long-term rent estimate",
};

export function DealCard({
  deal,
  strategy,
}: {
  deal: DealWithScore;
  strategy?: Strategy;
}) {
  const score = deal.score;
  // STR: show the nightly rate the cashflow was actually underwritten at
  // (persisted by the scout). Older scores predate the persisted ADR, so
  // fall back to the same rent heuristic the scout used then.
  const assumedAdr =
    score?.score_components?.adr ??
    (deal.est_rent
      ? Math.round(estimateSTRAdrFromLTRRent(Number(deal.est_rent)))
      : null);
  const adrSource = score?.score_components?.adrSource ?? "heuristic";
  const photo =
    deal.primary_image_url ??
    (Array.isArray(deal.photos) ? (deal.photos as string[])[0] : undefined);
  const sourceLink = getDealSourceLink(deal);
  const street = dealStreetAddress(deal);

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
            alt={street ?? "deal"}
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
            {street ?? "Address pending"}
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
          <CashflowBadge monthlyCashflow={score?.monthly_cashflow ?? null} />
          {strategy === "STR" && assumedAdr ? (
            <Badge
              title={`Assumed average daily rate (${ADR_SOURCE_LABEL[adrSource]}). The DSCR and cashflow on this card are computed at this rate.`}
            >
              ADR {formatMoney(assumedAdr)}/n
              {adrSource === "airroi" ? " ✓" : ""}
            </Badge>
          ) : deal.est_rent ? (
            <Badge title="Estimated monthly rent: Zillow rent Zestimate for this property, HUD Fair Market Rent fallback.">
              Rent {formatMoney(deal.est_rent)}/mo
            </Badge>
          ) : null}
          <MarketSignalBadges
            daysOnMarket={deal.days_on_market}
            priceChange={deal.price_change}
            price={deal.price ?? deal.est_value}
            hoaMonthly={deal.hoa_monthly}
          />
        </div>

        {score?.rationale ? (
          <p className="text-textMuted text-xs leading-5 line-clamp-3">
            {score.rationale}
          </p>
        ) : score ? (
          <p className="text-textMuted text-xs italic">Ranking…</p>
        ) : null}

        {sourceLink ? (
          <a
            href={sourceLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary text-xs hover:underline mt-3"
            title={
              sourceLink.isExact
                ? `Open this listing on ${sourceLink.provider}`
                : `${sourceLink.provider} address search (no deep link from data provider)`
            }
          >
            {sourceLink.label}
            <span aria-hidden>↗</span>
          </a>
        ) : null}
      </div>
    </Link>
  );
}

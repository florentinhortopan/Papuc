import { estimateSTRAdrFromLTRRent, type Strategy } from "@papuc/core";
import { Heart, RotateCcw, X } from "lucide-react";
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
  busy = false,
  saved = false,
  onSave,
  onSkip,
  skipLabel,
}: {
  deal: DealWithScore;
  strategy?: Strategy;
  busy?: boolean;
  saved?: boolean;
  onSave?: () => void;
  onSkip?: () => void;
  /** When set (e.g. Restore on Skipped), replaces the X icon. */
  skipLabel?: string;
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
    <div className="bg-surface border border-border rounded-2xl overflow-hidden hover:border-border/80 transition-colors">
      <div className="relative">
        <Link href={`/deals/${deal.id}`} className="block group">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={street ?? "deal"}
              className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-48 bg-surfaceAlt flex items-center justify-center">
              <span className="text-textMuted text-xs">No photo</span>
            </div>
          )}
          {typeof score?.score === "number" ? (
            <div className="absolute right-3 top-3 bg-black/65 rounded-full px-2 py-1 z-[1]">
              <span className="text-white text-xs font-semibold">
                {score.score}
              </span>
            </div>
          ) : null}
        </Link>

        {onSave || onSkip ? (
          <div className="absolute bottom-2 right-2 z-10 flex gap-1.5">
            {onSkip ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSkip();
                }}
                aria-label={skipLabel ?? "Skip deal"}
                title={skipLabel ?? "Skip — hide from this project's deals"}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:opacity-50 shadow"
              >
                {skipLabel ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
            {onSave ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSave();
                }}
                aria-label={saved ? "Unsave deal" : "Save deal"}
                aria-pressed={saved}
                title={saved ? "Remove from Saved" : "Save to Portfolio"}
                className={`flex h-8 w-8 items-center justify-center rounded-full shadow disabled:opacity-50 ${
                  saved
                    ? "bg-primary text-primaryFg"
                    : "bg-black/70 text-white hover:bg-primary"
                }`}
              >
                <Heart
                  className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`}
                />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link href={`/deals/${deal.id}`} className="block p-4">
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
          <span
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(sourceLink.url, "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center gap-1 text-primary text-xs hover:underline mt-3 cursor-pointer"
            title={
              sourceLink.isExact
                ? `Open this listing on ${sourceLink.provider}`
                : `${sourceLink.provider} address search (no deep link from data provider)`
            }
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                window.open(sourceLink.url, "_blank", "noopener,noreferrer");
              }
            }}
          >
            {sourceLink.label}
            <span aria-hidden>↗</span>
          </span>
        ) : null}
      </Link>
    </div>
  );
}

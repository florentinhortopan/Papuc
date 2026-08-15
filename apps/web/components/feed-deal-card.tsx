"use client";

import { Heart, X } from "lucide-react";
import Link from "next/link";

import { dealStreetAddress } from "@/lib/deal-address";
import type { FeedDeal } from "@/lib/feed";
import { formatMoney } from "@/lib/format";

export function FeedDealCard({
  deal,
  className,
  busy = false,
  onSave,
  onSkip,
}: {
  deal: FeedDeal;
  className?: string;
  busy?: boolean;
  onSave?: () => void;
  onSkip?: () => void;
}) {
  const photo =
    deal.primary_image_url ??
    (Array.isArray(deal.photos) ? (deal.photos as string[])[0] : undefined);
  const street = dealStreetAddress(deal);
  const place = [deal.city, deal.state].filter(Boolean).join(", ");
  const score = deal.score?.score;
  const cashflow = deal.score?.monthly_cashflow;

  return (
    <div className={className ?? "w-[240px] shrink-0 snap-start"}>
      <div className="relative">
        <Link href={`/deals/${deal.id}`} className="block group">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surfaceAlt border border-border">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-textMuted text-xs">No photo</span>
              </div>
            )}
            {deal.isNew ? (
              <div className="absolute left-2 top-2 bg-primary rounded-full px-2 py-0.5">
                <span className="text-primaryFg text-[10px] font-bold uppercase tracking-wide">
                  New
                </span>
              </div>
            ) : null}
            {typeof score === "number" ? (
              <div className="absolute right-2 top-2 bg-black/65 rounded-full px-2 py-0.5">
                <span className="text-white text-xs font-semibold">{score}</span>
              </div>
            ) : null}
          </div>
        </Link>

        {onSave || onSkip ? (
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            {onSkip ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSkip();
                }}
                aria-label="Skip deal"
                title="Skip — hide from For you"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
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
                aria-label="Save deal"
                title="Save to portfolio"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-primary disabled:opacity-50"
              >
                <Heart className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link href={`/deals/${deal.id}`} className="block mt-2 px-0.5">
        <p className="text-text text-sm font-semibold truncate">
          {street || place || "Address pending"}
        </p>
        <p className="text-textMuted text-xs mt-0.5 truncate">
          {[
            place || null,
            deal.price != null ? formatMoney(Number(deal.price)) : null,
            cashflow != null
              ? `${Number(cashflow) >= 0 ? "+" : ""}${formatMoney(Number(cashflow))}/mo`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Link>
      <Link
        href={`/projects/${deal.project.id}`}
        className="inline-flex mt-1.5 max-w-full items-center rounded-full border border-border bg-surfaceAlt px-2 py-0.5 text-[11px] text-textMuted hover:text-text hover:border-primary/40 transition-colors"
        title={`Open project ${deal.project.name}`}
      >
        <span className="truncate">
          {deal.isOwn ? "Your project · " : ""}
          {deal.project.name}
        </span>
      </Link>
    </div>
  );
}

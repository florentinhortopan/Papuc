"use client";

import Link from "next/link";
import { useState } from "react";

import { DscrBadge } from "@/components/dscr-badge";
import { Button } from "@/components/ui/button";
import type { DealWithScore } from "@/lib/deals";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PortfolioClient({
  initialDeals,
}: {
  initialDeals: DealWithScore[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  function toggle(id: string) {
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id],
    );
  }

  const selectedDeals = initialDeals.filter((d) => selectedIds.includes(d.id));

  if (initialDeals.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-10 text-center">
        <p className="text-textMuted">
          Save deals from the Deal Detail screen and they'll show up here.
        </p>
      </div>
    );
  }

  if (comparing && selectedDeals.length >= 2) {
    return (
      <ComparePane
        deals={selectedDeals}
        onClose={() => setComparing(false)}
      />
    );
  }

  return (
    <div>
      {selectedIds.length >= 2 ? (
        <div className="mb-4">
          <Button onClick={() => setComparing(true)}>
            Compare {selectedIds.length} deals
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        {initialDeals.map((deal) => {
          const selected = selectedIds.includes(deal.id);
          const photo =
            deal.primary_image_url ??
            (Array.isArray(deal.photos)
              ? (deal.photos as string[])[0]
              : undefined);
          return (
            <div
              key={deal.id}
              className={cn(
                "flex items-center gap-3 bg-surface border rounded-2xl p-3 transition-colors",
                selected ? "border-primary" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(deal.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt=""
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-surfaceAlt" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-text font-semibold truncate">
                    {deal.address ?? "Address pending"}
                  </p>
                  <p className="text-textMuted text-xs mt-0.5">
                    {[
                      deal.beds ? `${deal.beds} bd` : null,
                      deal.baths ? `${deal.baths} ba` : null,
                      deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-text text-sm font-semibold">
                      {formatMoney(deal.price ?? 0)}
                    </span>
                    <DscrBadge dscr={deal.score?.dscr ?? null} />
                  </div>
                </div>
                <span className="text-textMuted text-xs ml-2 hidden sm:inline">
                  {selected ? "Selected" : "Tap to select"}
                </span>
              </button>
              <Link
                href={`/deals/${deal.id}`}
                className="text-primary text-xs hover:underline shrink-0"
              >
                Open
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparePane({
  deals,
  onClose,
}: {
  deals: DealWithScore[];
  onClose: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Compare</h2>
        <button
          onClick={onClose}
          className="text-textMuted text-sm hover:text-text"
        >
          Close
        </button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${deals.length}, minmax(220px, 1fr))` }}>
        {deals.map((d) => (
          <div key={d.id} className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-text font-semibold line-clamp-2">
              {d.address ?? "Address pending"}
            </p>
            <p className="text-textMuted text-xs mb-3">
              {[
                d.beds ? `${d.beds} bd` : null,
                d.baths ? `${d.baths} ba` : null,
                d.sqft ? `${Math.round(Number(d.sqft))} sqft` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <Row label="Price" value={formatMoney(d.price ?? 0)} />
            <Row
              label="Monthly cashflow"
              value={
                d.score?.monthly_cashflow != null
                  ? `${d.score.monthly_cashflow >= 0 ? "+" : ""}${formatMoney(d.score.monthly_cashflow)}`
                  : "—"
              }
            />
            <Row label="DSCR" value={formatDscr(d.score?.dscr ?? null)} />
            <Row
              label="DSCR (75% rent)"
              value={formatDscr(d.score?.dscr_lender_haircut ?? null)}
            />
            <Row
              label="Cash-on-cash"
              value={formatPct(d.score?.cash_on_cash ?? null)}
            />
            <Row
              label="5-yr IRR"
              value={formatPct(d.score?.irr_5yr ?? null)}
            />
            <Row
              label="Score"
              value={d.score?.score != null ? String(d.score.score) : "—"}
            />
            <Row
              label="Payout (yrs)"
              value={
                d.score?.payout_years != null
                  ? d.score.payout_years.toFixed(2)
                  : "—"
              }
            />
            {d.score?.rationale ? (
              <p className="text-textMuted text-xs mt-3 leading-5">
                {d.score.rationale}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-textMuted text-xs">{label}</span>
      <span className="text-text text-xs font-semibold">{value}</span>
    </div>
  );
}

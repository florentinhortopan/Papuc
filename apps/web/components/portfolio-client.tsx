"use client";

import {
  Check,
  ChevronRight,
  ExternalLink,
  MapPin,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CashflowBadge } from "@/components/cashflow-badge";
import { DscrBadge } from "@/components/dscr-badge";
import { Button } from "@/components/ui/button";
import { deleteDealAction } from "@/lib/deal-actions-client";
import { dealStreetAddress } from "@/lib/deal-address";
import type { DealWithPortfolioMetrics } from "@/lib/deals";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import { getDealSourceLink } from "@/lib/source-url";
import { cn } from "@/lib/utils";

export function PortfolioClient({
  initialDeals,
}: {
  initialDeals: DealWithPortfolioMetrics[];
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingBulk, setRemovingBulk] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  const selectedDeals = deals.filter((d) => selectedIds.includes(d.id));
  const canCompare = selectedIds.length >= 2 && selectedIds.length <= 3;

  async function removeOne(dealId: string) {
    setRemovingId(dealId);
    setError(null);
    setNote(null);
    try {
      // Unsave only — deletes the user's `deal_actions` row (`saved`).
      // Never deletes `deals` or changes inventory_status (live/archived).
      await deleteDealAction(dealId, "saved");
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
      setSelectedIds((s) => s.filter((id) => id !== dealId));
      setNote("Removed from portfolio.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return;
    const ids = [...selectedIds];
    setRemovingBulk(true);
    setError(null);
    setNote(null);
    try {
      // Same as removeOne: clears `saved` actions only, not scout inventory.
      await Promise.all(ids.map((id) => deleteDealAction(id, "saved")));
      const removed = new Set(ids);
      setDeals((prev) => prev.filter((d) => !removed.has(d.id)));
      setSelectedIds([]);
      setNote(
        ids.length === 1
          ? "Removed from portfolio."
          : `Removed ${ids.length} deals from portfolio.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingBulk(false);
    }
  }

  if (deals.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-10 text-center">
        <p className="text-textMuted">
          Save deals from the Deal Detail screen and they&apos;ll show up here.
        </p>
      </div>
    );
  }

  if (comparing && selectedDeals.length >= 2 && selectedDeals.length <= 3) {
    return (
      <ComparePane
        deals={selectedDeals}
        onClose={() => setComparing(false)}
      />
    );
  }

  return (
    <div>
      {note ? (
        <p className="text-textMuted text-xs mb-3">{note}</p>
      ) : null}
      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}

      {selectedIds.length >= 1 ? (
        <div className="mb-4 sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur-sm border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <Button
              onClick={() => setComparing(true)}
              disabled={!canCompare}
              className="shrink-0"
            >
              {canCompare
                ? `Compare ${selectedIds.length} deals`
                : "Compare"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void removeSelected()}
              loading={removingBulk}
              disabled={removingId != null}
              className="shrink-0"
            >
              {selectedIds.length === 1
                ? "Remove from portfolio"
                : `Remove ${selectedIds.length} from portfolio`}
            </Button>
            <p className="text-textMuted text-sm leading-snug">
              {selectedIds.length === 1
                ? "1 selected — pick more to compare (2–3) or remove."
                : selectedIds.length > 3
                  ? `${selectedIds.length} selected — remove any number, or deselect down to 2–3 to compare.`
                  : `${selectedIds.length} selected — compare or remove.`}
            </p>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-textMuted hover:text-text sm:ml-auto shrink-0"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <p className="text-textMuted text-sm mb-4">
          Tap the checkmark to select deals for compare (2–3) or bulk remove.
          Or remove a deal with the button on each card.
        </p>
      )}

      <div className="grid gap-3">
        {deals.map((deal) => {
          const selected = selectedIds.includes(deal.id);
          const photo =
            deal.primary_image_url ??
            (Array.isArray(deal.photos)
              ? (deal.photos as string[])[0]
              : undefined);
          const sourceLink = getDealSourceLink(deal);
          const place = [deal.city, deal.state].filter(Boolean).join(", ");
          const meta = [
            deal.beds ? `${deal.beds} bd` : null,
            deal.baths ? `${deal.baths} ba` : null,
            deal.sqft ? `${Math.round(Number(deal.sqft)).toLocaleString()} sqft` : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={deal.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-stretch gap-3 bg-surface border rounded-2xl p-3 sm:p-4 transition-colors",
                selected ? "border-primary bg-primary/[0.04]" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(deal.id)}
                aria-pressed={selected}
                aria-label={
                  selected ? "Deselect deal" : "Select deal for compare or remove"
                }
                className="flex items-start sm:items-center gap-3 flex-1 min-w-0 text-left"
              >
                <span
                  className={cn(
                    "mt-1 sm:mt-0 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primaryFg"
                      : "border-border bg-surfaceAlt text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>

                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt=""
                    className="w-20 h-20 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-surfaceAlt shrink-0" />
                )}

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div>
                    <p className="text-text font-semibold truncate leading-snug">
                      {dealStreetAddress(deal) ?? "Address pending"}
                    </p>
                    {place ? (
                      <p className="text-textMuted text-xs mt-0.5 flex items-center gap-1 min-w-0">
                        <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate">{place}</span>
                      </p>
                    ) : null}
                    {meta ? (
                      <p className="text-textMuted text-xs mt-0.5 truncate">
                        {meta}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetricChip
                      label={deal.price ? "List" : "Est."}
                      value={formatMoney(deal.price ?? deal.est_value)}
                    />
                    <MetricChip
                      label="Cashflow"
                      value={
                        deal.monthlyCashflow != null
                          ? `${deal.monthlyCashflow >= 0 ? "+" : ""}${formatMoney(deal.monthlyCashflow)}/mo`
                          : "—"
                      }
                      tone={
                        deal.monthlyCashflow == null
                          ? "muted"
                          : deal.monthlyCashflow >= 100
                            ? "success"
                            : deal.monthlyCashflow >= -100
                              ? "warning"
                              : "danger"
                      }
                    />
                    <MetricChip
                      label="Down"
                      value={
                        deal.downPayment != null
                          ? formatMoney(deal.downPayment)
                          : "—"
                      }
                    />
                    <DscrBadge dscr={deal.score?.dscr ?? null} />
                  </div>

                  {deal.fromScenario && deal.scenario ? (
                    <p className="text-[10px] text-textMuted uppercase tracking-wide">
                      Scenario · {deal.scenario.name}
                    </p>
                  ) : (
                    <p className="text-[10px] text-textMuted uppercase tracking-wide">
                      Default underwriting
                    </p>
                  )}
                </div>
              </button>

              <div className="flex sm:flex-col items-stretch justify-end gap-2 shrink-0 sm:w-[7.5rem] sm:border-l sm:border-border/60 sm:pl-3">
                <Button asChild size="sm" className="w-full justify-between px-3">
                  <Link href={`/deals/${deal.id}`}>
                    Open
                    <ChevronRight className="h-3.5 w-3.5 opacity-80" />
                  </Link>
                </Button>
                {sourceLink ? (
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="w-full justify-between px-3 font-medium"
                  >
                    <a
                      href={sourceLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={
                        sourceLink.isExact
                          ? `Open this listing on ${sourceLink.provider}`
                          : `${sourceLink.provider} address search (no deep link from data provider)`
                      }
                    >
                      <span className="truncate">{sourceLink.provider}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full justify-between px-3 font-medium text-danger border-danger/35 hover:bg-danger/10 hover:text-danger hover:border-danger/50"
                  loading={removingId === deal.id}
                  disabled={removingBulk || (removingId != null && removingId !== deal.id)}
                  onClick={() => void removeOne(deal.id)}
                >
                  Remove
                  <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-lg border px-2 py-1 text-[11px] leading-none",
        tone === "success" && "border-success/30 bg-success/10",
        tone === "warning" && "border-warning/30 bg-warning/10",
        tone === "danger" && "border-danger/30 bg-danger/10",
        tone === "muted" && "border-border bg-surfaceAlt/80",
      )}
    >
      <span className="text-textMuted uppercase tracking-wide text-[9px] font-semibold">
        {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          tone === "muted" && "text-text",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function ComparePane({
  deals,
  onClose,
}: {
  deals: DealWithPortfolioMetrics[];
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
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${deals.length}, minmax(220px, 1fr))`,
        }}
      >
        {deals.map((d) => {
          const place = [d.city, d.state].filter(Boolean).join(", ");
          return (
            <div
              key={d.id}
              className="bg-surface border border-border rounded-2xl p-4"
            >
              <p className="text-text font-semibold line-clamp-2">
                {dealStreetAddress(d) ?? "Address pending"}
              </p>
              {place ? (
                <p className="text-textMuted text-xs mt-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {place}
                </p>
              ) : null}
              <p className="text-textMuted text-xs mb-3 mt-1">
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
                  d.monthlyCashflow != null
                    ? `${d.monthlyCashflow >= 0 ? "+" : ""}${formatMoney(d.monthlyCashflow)}`
                    : "—"
                }
              />
              <Row
                label="Down payment"
                value={
                  d.downPayment != null ? formatMoney(d.downPayment) : "—"
                }
              />
              <Row
                label="Source"
                value={
                  d.fromScenario && d.scenario
                    ? `Scenario · ${d.scenario.name}`
                    : "Default"
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
              <div className="mt-3">
                <CashflowBadge monthlyCashflow={d.monthlyCashflow} />
              </div>
              {d.score?.rationale ? (
                <p className="text-textMuted text-xs mt-3 leading-5">
                  {d.score.rationale}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 gap-3">
      <span className="text-textMuted text-xs">{label}</span>
      <span className="text-text text-xs font-semibold text-right">{value}</span>
    </div>
  );
}

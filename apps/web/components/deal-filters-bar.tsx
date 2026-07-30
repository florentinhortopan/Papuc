"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { DealWithScore } from "@/lib/deals";
import { formatMoney } from "@/lib/format";

/**
 * Client-side filtering + sorting for the scouted-deals grid, designed to
 * mirror the project constraints: every filter here has a matching field
 * in `ProjectConstraints`, so "Save filters to project" can translate the
 * current view into scout-time rules (see saveFiltersToProject in
 * project-detail-client.tsx).
 *
 * Controls are optimized for touch: sort is a horizontally-scrollable
 * pill row, numeric floors/ceilings are sliders with ranges derived from
 * the loaded deals, and everything else is a tap chip.
 */

export type DealSortKey =
  | "score"
  | "cashflow"
  | "dscr"
  | "coc"
  | "priceAsc"
  | "priceDesc"
  | "newest";

export interface DealFilters {
  sort: DealSortKey;
  /** Minimum monthly cashflow in USD, empty = off. */
  minCashflow: string;
  minDscr: string;
  maxPrice: string;
  minBeds: string;
  /** Only deals with no (or unknown) HOA fee. */
  noHoa: boolean;
  /** Zillow homeType codes to hide, e.g. ["MANUFACTURED"]. */
  excludedTypes: string[];
}

export const DEFAULT_DEAL_FILTERS: DealFilters = {
  sort: "score",
  minCashflow: "",
  minDscr: "",
  maxPrice: "",
  minBeds: "",
  noHoa: false,
  excludedTypes: [],
};

const SORT_OPTIONS: Array<{ value: DealSortKey; label: string }> = [
  { value: "score", label: "Score" },
  { value: "cashflow", label: "Cashflow" },
  { value: "dscr", label: "DSCR" },
  { value: "coc", label: "CoC" },
  { value: "priceAsc", label: "Price ↑" },
  { value: "priceDesc", label: "Price ↓" },
  { value: "newest", label: "Newest" },
];

/** Zillow homeType → human label for the exclude chips. */
const HOME_TYPE_LABELS: Record<string, string> = {
  SINGLE_FAMILY: "Single-family",
  CONDO: "Condo",
  TOWNHOUSE: "Townhouse",
  MULTI_FAMILY: "Multi-family",
  APARTMENT: "Apartment",
  MANUFACTURED: "Manufactured",
  LOT: "Land / lot",
};

export function homeTypeLabel(t: string): string {
  return HOME_TYPE_LABELS[t] ?? t.toLowerCase().replace(/_/g, " ");
}

/** The listing's Zillow homeType, persisted verbatim in mls_data. */
export function getDealHomeType(deal: DealWithScore): string | null {
  const raw = deal.mls_data as Record<string, unknown> | null;
  const t = raw?.homeType;
  return typeof t === "string" && t ? t : null;
}

export function isAnyFilterActive(f: DealFilters): boolean {
  return (
    Number(f.minCashflow) > 0 ||
    Number(f.minDscr) > 0 ||
    Number(f.maxPrice) > 0 ||
    Number(f.minBeds) > 0 ||
    f.noHoa ||
    f.excludedTypes.length > 0
  );
}

export function applyDealFilters(
  deals: DealWithScore[],
  f: DealFilters,
): DealWithScore[] {
  const minCashflow = Number(f.minCashflow);
  const minDscr = Number(f.minDscr);
  const maxPrice = Number(f.maxPrice);
  const minBeds = Number(f.minBeds);
  const excluded = new Set(f.excludedTypes);

  const filtered = deals.filter((d) => {
    // Deals without a computed score can't prove they clear a financial
    // floor — hide them while such a filter is active.
    if (minCashflow > 0 && !((d.score?.monthly_cashflow ?? null) !== null && d.score!.monthly_cashflow! >= minCashflow)) {
      return false;
    }
    if (minDscr > 0 && !(typeof d.score?.dscr === "number" && d.score.dscr >= minDscr)) {
      return false;
    }
    const price = d.price ?? d.est_value;
    if (maxPrice > 0 && !(typeof price === "number" && price <= maxPrice)) {
      return false;
    }
    if (minBeds > 0 && !(typeof d.beds === "number" && d.beds >= minBeds)) {
      return false;
    }
    // "No HOA" keeps confirmed-zero and unknown; drops any positive fee.
    if (f.noHoa && typeof d.hoa_monthly === "number" && d.hoa_monthly > 0) {
      return false;
    }
    if (excluded.size > 0) {
      const t = getDealHomeType(d);
      if (t && excluded.has(t)) return false;
    }
    return true;
  });

  return sortDeals(filtered, f.sort);
}

function sortDeals(deals: DealWithScore[], sort: DealSortKey): DealWithScore[] {
  const byDesc =
    (pick: (d: DealWithScore) => number | null | undefined) =>
    (a: DealWithScore, b: DealWithScore) =>
      (pick(b) ?? Number.NEGATIVE_INFINITY) - (pick(a) ?? Number.NEGATIVE_INFINITY);
  const byAsc =
    (pick: (d: DealWithScore) => number | null | undefined) =>
    (a: DealWithScore, b: DealWithScore) =>
      (pick(a) ?? Number.POSITIVE_INFINITY) - (pick(b) ?? Number.POSITIVE_INFINITY);

  const cmp = {
    score: byDesc((d) => d.score?.score),
    cashflow: byDesc((d) => d.score?.monthly_cashflow),
    dscr: byDesc((d) => d.score?.dscr),
    coc: byDesc((d) => d.score?.cash_on_cash),
    priceAsc: byAsc((d) => d.price ?? d.est_value),
    priceDesc: byDesc((d) => d.price ?? d.est_value),
    newest: byAsc((d) => d.days_on_market),
  }[sort];

  return [...deals].sort(cmp);
}

/** Round a raw slider bound up to a friendly increment. */
function roundUpTo(n: number, inc: number): number {
  return Math.ceil(n / inc) * inc;
}

export function DealFiltersBar({
  deals,
  filters,
  onChange,
  shownCount,
  onSaveToProject,
  saving,
  savedNote,
}: {
  deals: DealWithScore[];
  filters: DealFilters;
  onChange: (next: DealFilters) => void;
  shownCount: number;
  /** Persist active filters into the project constraints for future scouts. */
  onSaveToProject: () => void;
  saving: boolean;
  savedNote: string | null;
}) {
  const patch = (p: Partial<DealFilters>) => onChange({ ...filters, ...p });

  /**
   * Slider bounds derived from the loaded deals so the useful range is
   * always reachable: the cashflow slider tops out just above the best
   * deal, the price slider spans the actual price spread, etc.
   */
  const bounds = useMemo(() => {
    const cashflows = deals
      .map((d) => d.score?.monthly_cashflow)
      .filter((v): v is number => typeof v === "number");
    const dscrs = deals
      .map((d) => d.score?.dscr)
      .filter((v): v is number => typeof v === "number");
    const prices = deals
      .map((d) => d.price ?? d.est_value)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const beds = deals
      .map((d) => d.beds)
      .filter((v): v is number => typeof v === "number");

    const cashflowMax = roundUpTo(Math.max(1000, ...cashflows, 0), 100);
    const dscrMax = Math.min(3, roundUpTo(Math.max(2, ...dscrs, 0), 0.25));
    const priceMax = roundUpTo(prices.length ? Math.max(...prices) : 500_000, 10_000);
    const priceStep = Math.max(1000, roundUpTo(priceMax / 50, 1000));
    const bedsMax = Math.min(8, Math.max(5, ...beds, 0));
    return { cashflowMax, dscrMax, priceMax, priceStep, bedsMax };
  }, [deals]);

  // Only offer exclusion chips for types actually present in the results.
  const presentTypes = Array.from(
    new Set(deals.map(getDealHomeType).filter((t): t is string => t !== null)),
  ).sort();

  const active = isAnyFilterActive(filters);
  const maxPriceVal = Number(filters.maxPrice) || bounds.priceMax;

  return (
    <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 mb-4 space-y-3">
      {/* Sort: horizontally scrollable pill row (never wraps on mobile). */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -my-1 py-1 flex-1 min-w-0">
          {SORT_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              label={o.label}
              active={filters.sort === o.value}
              onToggle={() => patch({ sort: o.value })}
            />
          ))}
        </div>
        <p className="text-textMuted text-[11px] whitespace-nowrap shrink-0">
          {shownCount}/{deals.length}
        </p>
      </div>

      {/* Numeric floors/ceilings as sliders. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
        <FilterSlider
          label="Min cashflow"
          display={
            Number(filters.minCashflow) > 0
              ? `${formatMoney(Number(filters.minCashflow))}+/mo`
              : "Any"
          }
          min={0}
          max={bounds.cashflowMax}
          step={50}
          value={Number(filters.minCashflow) || 0}
          onChange={(v) => patch({ minCashflow: v > 0 ? String(v) : "" })}
        />
        <FilterSlider
          label="Min DSCR"
          display={
            Number(filters.minDscr) > 0 ? `${Number(filters.minDscr).toFixed(2)}+` : "Any"
          }
          min={0}
          max={bounds.dscrMax}
          step={0.05}
          value={Number(filters.minDscr) || 0}
          onChange={(v) =>
            patch({ minDscr: v > 0 ? String(Math.round(v * 100) / 100) : "" })
          }
        />
        <FilterSlider
          label="Max price"
          display={
            Number(filters.maxPrice) > 0
              ? `≤ ${formatMoney(Number(filters.maxPrice))}`
              : "Any"
          }
          min={0}
          max={bounds.priceMax}
          step={bounds.priceStep}
          value={maxPriceVal}
          onChange={(v) => patch({ maxPrice: v >= bounds.priceMax ? "" : String(v) })}
        />
        <FilterSlider
          label="Min beds"
          display={Number(filters.minBeds) > 0 ? `${filters.minBeds}+` : "Any"}
          min={0}
          max={bounds.bedsMax}
          step={1}
          value={Number(filters.minBeds) || 0}
          onChange={(v) => patch({ minBeds: v > 0 ? String(v) : "" })}
        />
      </div>

      {/* Toggle chips: HOA + property-type exclusions. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip
          label="No HOA"
          active={filters.noHoa}
          onToggle={() => patch({ noHoa: !filters.noHoa })}
        />
        {presentTypes.map((t) => {
          const excluded = filters.excludedTypes.includes(t);
          return (
            <FilterChip
              key={t}
              label={excluded ? `✕ ${homeTypeLabel(t)}` : `No ${homeTypeLabel(t).toLowerCase()}`}
              active={excluded}
              onToggle={() =>
                patch({
                  excludedTypes: excluded
                    ? filters.excludedTypes.filter((x) => x !== t)
                    : [...filters.excludedTypes, t],
                })
              }
            />
          );
        })}
        {active ? (
          <button
            type="button"
            className="text-[11px] text-accent hover:underline ml-auto shrink-0"
            onClick={() => onChange({ ...DEFAULT_DEAL_FILTERS, sort: filters.sort })}
          >
            Clear
          </button>
        ) : null}
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="secondary" onClick={onSaveToProject} loading={saving}>
            Save filters to project
          </Button>
          <p className="text-textMuted text-[11px] flex-1 min-w-[12rem]">
            {savedNote ??
              "Writes these rules into the project, so the next scout only keeps matching deals."}
          </p>
        </div>
      ) : savedNote ? (
        <p className="text-textMuted text-[11px] pt-2 border-t border-border">{savedNote}</p>
      ) : null}
    </div>
  );
}

function FilterSlider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const engaged = display !== "Any";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-textMuted text-[11px]">{label}</span>
        <span
          className={
            engaged
              ? "text-primary text-[11px] font-semibold whitespace-nowrap"
              : "text-textMuted text-[11px] whitespace-nowrap"
          }
        >
          {display}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[Math.min(max, Math.max(min, value))]}
        onValueChange={([v]) => onChange(v ?? min)}
        aria-label={label}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        active
          ? "text-[11px] px-2.5 py-1.5 rounded-full border border-primary/50 bg-primary/15 text-primary font-medium whitespace-nowrap shrink-0"
          : "text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-surfaceAlt text-textMuted hover:text-text whitespace-nowrap shrink-0"
      }
    >
      {label}
    </button>
  );
}

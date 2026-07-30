"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DealWithScore } from "@/lib/deals";

/**
 * Client-side filtering + sorting for the scouted-deals grid, designed to
 * mirror the project constraints: every filter here has a matching field
 * in `ProjectConstraints`, so "Save filters to project" can translate the
 * current view into scout-time rules (see saveFiltersToProject in
 * project-detail-client.tsx).
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
  { value: "score", label: "Best match (score)" },
  { value: "cashflow", label: "Monthly cashflow" },
  { value: "dscr", label: "DSCR" },
  { value: "coc", label: "Cash-on-cash" },
  { value: "priceAsc", label: "Price: low → high" },
  { value: "priceDesc", label: "Price: high → low" },
  { value: "newest", label: "Newest on market" },
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

  // Only offer exclusion chips for types actually present in the results.
  const presentTypes = Array.from(
    new Set(deals.map(getDealHomeType).filter((t): t is string => t !== null)),
  ).sort();

  const active = isAnyFilterActive(filters);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-textMuted">
          Sort by
          <select
            value={filters.sort}
            onChange={(e) => patch({ sort: e.target.value as DealSortKey })}
            className="bg-surfaceAlt border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-textMuted text-xs ml-auto">
          Showing {shownCount} of {deals.length}
        </p>
        {active ? (
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() => onChange({ ...DEFAULT_DEAL_FILTERS, sort: filters.sort })}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <FilterInput
          label="Min cashflow ($/mo)"
          placeholder="e.g. 1000"
          value={filters.minCashflow}
          onChange={(v) => patch({ minCashflow: v })}
        />
        <FilterInput
          label="Min DSCR"
          placeholder="e.g. 1.25"
          value={filters.minDscr}
          onChange={(v) => patch({ minDscr: v })}
        />
        <FilterInput
          label="Max price ($)"
          placeholder="e.g. 400000"
          value={filters.maxPrice}
          onChange={(v) => patch({ maxPrice: v })}
        />
        <FilterInput
          label="Min beds"
          placeholder="e.g. 3"
          value={filters.minBeds}
          onChange={(v) => patch({ minBeds: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
              label={excluded ? `✕ ${homeTypeLabel(t)}` : `Exclude ${homeTypeLabel(t)}`}
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
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
          <Button size="sm" variant="secondary" onClick={onSaveToProject} loading={saving}>
            Save filters to project
          </Button>
          <p className="text-textMuted text-xs">
            {savedNote ??
              "Writes these rules into the project, so the next scout only keeps matching deals."}
          </p>
        </div>
      ) : savedNote ? (
        <p className="text-textMuted text-xs pt-1 border-t border-border">{savedNote}</p>
      ) : null}
    </div>
  );
}

function FilterInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-textMuted text-[11px] block mb-1">{label}</span>
      <Input
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-xs"
      />
    </label>
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
          ? "text-xs px-3 py-1.5 rounded-full border border-primary/50 bg-primary/15 text-primary font-medium"
          : "text-xs px-3 py-1.5 rounded-full border border-border bg-surfaceAlt text-textMuted hover:text-text"
      }
    >
      {label}
    </button>
  );
}

"use client";

import { useRef, useState } from "react";

import {
  ScenarioIncludeToggle,
  ScenarioRefreshLink,
} from "@/components/scenario-include-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

export interface LtrEstimatePayload {
  median: number;
  p25: number | null;
  p75: number | null;
  comparableCount: number;
  estimatedAt: string | null;
  source?: string;
}

export interface LtrRentProjection {
  monthlyCashflow: number;
  annualAfterTax: number;
}

/**
 * On-demand Zillow for-rent comps widget for LTR deals. Fetching caches
 * the median on the deal; the include toggle pushes rent into the
 * pro-forma (same pattern as Catch the catch / STR comps).
 */
export function LtrMarketEstimate({
  dealId,
  cached,
  included,
  onIncludedChange,
  projectRent,
  disabledReason,
}: {
  dealId: string;
  cached: LtrEstimatePayload | null;
  /** Whether comps rent is currently in the pro-forma. */
  included: boolean;
  onIncludedChange: (include: boolean, est?: LtrEstimatePayload) => void;
  /** Project cashflow / after-tax with the given monthly rent using the
   *  same pro-forma inputs as the summary panel. */
  projectRent: (monthlyRent: number) => LtrRentProjection;
  /** When set, the CTA is disabled (e.g. vacant land). */
  disabledReason?: string | null;
}) {
  const [estimate, setEstimate] = useState<LtrEstimatePayload | null>(cached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const includedRef = useRef(included);
  includedRef.current = included;
  const onIncludedChangeRef = useRef(onIncludedChange);
  onIncludedChangeRef.current = onIncludedChange;

  async function fetchEstimate(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/ltr-estimate${refresh ? "?refresh=1" : ""}`,
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `estimate failed (${res.status})`);
      }
      const est: LtrEstimatePayload = {
        median: Number(body.median),
        p25: body.p25 != null ? Number(body.p25) : null,
        p75: body.p75 != null ? Number(body.p75) : null,
        comparableCount: Number(body.comparableCount ?? 0),
        estimatedAt: body.estimatedAt ?? null,
        source: body.source,
      };
      setEstimate(est);
      if (includedRef.current) {
        onIncludedChangeRef.current(true, est);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleIncluded() {
    if (!estimate) return;
    if (included) {
      onIncludedChange(false);
    } else {
      onIncludedChange(true, estimate);
    }
  }

  const projection =
    estimate && Number.isFinite(estimate.median)
      ? projectRent(estimate.median)
      : null;

  return (
    <div className="bg-surfaceAlt border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-text text-base font-semibold">
          Comps rent estimate
        </p>
        {estimate ? (
          <Badge variant="success">Zillow rentals</Badge>
        ) : (
          <Badge>rentZestimate / heuristic in use</Badge>
        )}
      </div>

      {disabledReason ? (
        <p className="text-textMuted text-xs leading-5">{disabledReason}</p>
      ) : estimate && projection ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-text text-sm font-semibold">
                {formatMoney(estimate.median)}/mo
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Expected rent
              </p>
            </div>
            <div>
              <p
                className={`text-sm font-semibold ${
                  projection.monthlyCashflow >= 0
                    ? "text-success"
                    : "text-danger"
                }`}
              >
                {projection.monthlyCashflow >= 0 ? "+" : ""}
                {formatMoney(projection.monthlyCashflow)}/mo
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Cashflow
              </p>
            </div>
            <div>
              <p className="text-text text-sm font-semibold">
                {formatMoney(projection.annualAfterTax)}
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                After-tax / yr
              </p>
            </div>
          </div>

          {estimate.p25 != null && estimate.p75 != null ? (
            <p className="text-textMuted text-xs">
              Rent range: {formatMoney(estimate.p25)} –{" "}
              {formatMoney(estimate.p75)}/mo (p25–p75)
            </p>
          ) : null}

          <ScenarioIncludeToggle
            label="Include rent comps in scenario"
            description={
              included
                ? `Using ${formatMoney(estimate.median)}/mo rent`
                : "Off — Monthly rent stays at your baseline"
            }
            included={included}
            onToggle={toggleIncluded}
            ariaLabelOn="Remove rent comps from scenario"
            ariaLabelOff="Include rent comps in scenario"
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-textMuted text-[11px]">
              {estimate.comparableCount
                ? `Based on ${estimate.comparableCount} Zillow rentals. `
                : ""}
              {estimate.estimatedAt
                ? `Estimated ${new Date(estimate.estimatedAt).toLocaleDateString()}.`
                : ""}
            </p>
            <ScenarioRefreshLink
              loading={loading}
              onClick={() => fetchEstimate(true)}
              label="Refresh"
              title="Fetch a fresh for-rent comps search via HasData"
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-textMuted text-xs leading-5">
            The rent above is a Zillow rentZestimate or price-based guess.
            Pull active for-rent listings in this area (similar beds / type),
            then use the toggle to include the median ask in the pro-forma.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => fetchEstimate(false)}
          >
            Get rent comps
          </Button>
        </>
      )}

      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

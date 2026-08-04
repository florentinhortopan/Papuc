"use client";

import { useRef, useState } from "react";

import {
  ScenarioIncludeToggle,
  ScenarioRefreshLink,
} from "@/components/scenario-include-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

interface Percentiles {
  avg?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
}

export interface StrEstimatePayload {
  adr: number;
  occupancy: number;
  annualRevenue: number | null;
  percentiles: {
    revenue?: Percentiles;
    adr?: Percentiles;
    occupancy?: Percentiles;
  } | null;
  monthlyRevenueDistribution?: number[] | null;
  estimatedAt: string | null;
  comparableCount?: number;
}

/**
 * On-demand comps-based STR estimate widget. First click costs $0.20
 * (AirROI); the result is cached on the deal. Fetching alone never
 * mutates the pro-forma — the include toggle pushes ADR/occupancy/
 * seasonality in, and Refresh re-fetches with the same opt-in pattern
 * as Catch the catch.
 */
export function StrMarketEstimate({
  dealId,
  cached,
  included,
  onIncludedChange,
  baselineSource = "heuristic",
}: {
  dealId: string;
  /** Estimate already stored on the deal row, if any. */
  cached: StrEstimatePayload | null;
  /** Whether comps ADR/occupancy are currently in the pro-forma. */
  included: boolean;
  onIncludedChange: (include: boolean, est?: StrEstimatePayload) => void;
  /** What the current ADR baseline is when no comps estimate exists. */
  baselineSource?: "market_checked" | "heuristic";
}) {
  const [estimate, setEstimate] = useState<StrEstimatePayload | null>(cached);
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
        `/api/deals/${dealId}/str-estimate${refresh ? "?refresh=1" : ""}`,
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `estimate failed (${res.status})`);
      }
      const est: StrEstimatePayload = {
        adr: Number(body.adr),
        occupancy: Number(body.occupancy),
        annualRevenue: body.annualRevenue ?? null,
        percentiles: body.percentiles ?? null,
        monthlyRevenueDistribution: body.monthlyRevenueDistribution ?? null,
        estimatedAt: body.estimatedAt ?? null,
        comparableCount: body.comparableCount,
      };
      setEstimate(est);
      // Leave toggle off on first fetch; re-apply if already included.
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

  const adrPcts = estimate?.percentiles?.adr;

  return (
    <div className="bg-surfaceAlt border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-text text-base font-semibold">
          Comps-based market estimate
        </p>
        {estimate ? (
          <Badge variant="success">Airbnb comps</Badge>
        ) : baselineSource === "market_checked" ? (
          <Badge>market-checked estimate in use</Badge>
        ) : (
          <Badge>rent-based estimate in use</Badge>
        )}
      </div>

      {estimate ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-text text-sm font-semibold">
                {formatMoney(estimate.adr)}/n
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Expected ADR
              </p>
            </div>
            <div>
              <p className="text-text text-sm font-semibold">
                {Math.round(estimate.occupancy * 100)}%
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Occupancy
              </p>
            </div>
            <div>
              <p className="text-text text-sm font-semibold">
                {estimate.annualRevenue != null
                  ? formatMoney(estimate.annualRevenue)
                  : "—"}
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Revenue/yr
              </p>
            </div>
          </div>

          {adrPcts ? (
            <p className="text-textMuted text-xs">
              ADR percentiles:{" "}
              {(["p25", "p50", "p75", "p90"] as const)
                .filter((k) => adrPcts[k] != null)
                .map((k) => `${k.slice(1)}th ${formatMoney(adrPcts[k]!)}`)
                .join(" · ")}
            </p>
          ) : null}

          <ScenarioIncludeToggle
            label="Include comps in scenario"
            description={
              included
                ? `Using ${formatMoney(estimate.adr)}/n ADR · ${Math.round(estimate.occupancy * 100)}% occ`
                : "Off — ADR / occupancy stay at your baseline"
            }
            included={included}
            onToggle={toggleIncluded}
            ariaLabelOn="Remove comps from scenario"
            ariaLabelOff="Include comps in scenario"
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-textMuted text-[11px]">
              {estimate.comparableCount
                ? `Based on ${estimate.comparableCount} Airbnb comps. `
                : ""}
              {estimate.estimatedAt
                ? `Estimated ${new Date(estimate.estimatedAt).toLocaleDateString()}.`
                : ""}
            </p>
            <ScenarioRefreshLink
              loading={loading}
              onClick={() => fetchEstimate(true)}
              label="Refresh ($0.20)"
              title="Fetch a fresh estimate from AirROI ($0.20)"
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-textMuted text-xs leading-5">
            {baselineSource === "market_checked"
              ? "The ADR above is derived from the rent estimate and clamped to researched market rates for this city. Pull real Airbnb comps for this exact address (nightly rate, occupancy, seasonality), then use the toggle to include them in the pro-forma."
              : "The ADR above is a rent-based guess. Pull real Airbnb comps for this address (expected nightly rate, occupancy, and seasonality), then use the toggle to include them in the pro-forma."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => fetchEstimate(false)}
          >
            Get market estimate ($0.20)
          </Button>
        </>
      )}

      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

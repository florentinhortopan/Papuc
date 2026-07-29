"use client";

import { useState } from "react";

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
 * On-demand comps-based STR estimate widget, rendered next to the ADR
 * field in STR mode. First click costs $0.20 (AirROI, real Airbnb comps);
 * the result is cached on the deal, so subsequent visits show it free
 * with an explicit paid "Refresh" action.
 *
 * "Apply" pushes the comps ADR/occupancy/seasonality into the pro-forma
 * matrix via the parent callback — fetching alone never mutates the
 * user's inputs.
 */
export function StrMarketEstimate({
  dealId,
  cached,
  onApply,
}: {
  dealId: string;
  /** Estimate already stored on the deal row, if any. */
  cached: StrEstimatePayload | null;
  onApply: (est: StrEstimatePayload) => void;
}) {
  const [estimate, setEstimate] = useState<StrEstimatePayload | null>(cached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onApply(est);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const adrPcts = estimate?.percentiles?.adr;

  return (
    <div className="bg-surfaceAlt border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-text text-xs font-semibold">
          Comps-based market estimate
        </p>
        {estimate ? (
          <Badge variant="success">Airbnb comps</Badge>
        ) : (
          <Badge>heuristic ADR in use</Badge>
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

          <div className="flex items-center justify-between gap-2">
            <p className="text-textMuted text-[11px]">
              {estimate.comparableCount
                ? `Based on ${estimate.comparableCount} Airbnb comps. `
                : ""}
              {estimate.estimatedAt
                ? `Estimated ${new Date(estimate.estimatedAt).toLocaleDateString()}.`
                : ""}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => onApply(estimate)}
              >
                Apply
              </button>
              <button
                type="button"
                className="text-xs text-textMuted hover:underline disabled:opacity-50"
                disabled={loading}
                onClick={() => fetchEstimate(true)}
                title="Fetch a fresh estimate from AirROI ($0.20)"
              >
                {loading ? "Refreshing…" : "Refresh ($0.20)"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-textMuted text-xs leading-5">
            The ADR above is a rent-based guess. Pull real Airbnb comps for
            this address (expected nightly rate, occupancy, and seasonality)
            and apply them to the pro-forma.
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

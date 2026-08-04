"use client";

import { useState } from "react";

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
 * On-demand Zillow for-rent comps widget for LTR deals. First click runs a
 * HasData forRent search; the median rent is cached on the deal. Apply
 * (and auto-apply on fetch) pushes that rent into the pro-forma so the
 * summary cashflow matches.
 */
export function LtrMarketEstimate({
  dealId,
  cached,
  onApply,
  projectRent,
  disabledReason,
}: {
  dealId: string;
  cached: LtrEstimatePayload | null;
  onApply: (est: LtrEstimatePayload) => void;
  /** Project cashflow / after-tax with the given monthly rent using the
   *  same pro-forma inputs as the summary panel. */
  projectRent: (monthlyRent: number) => LtrRentProjection;
  /** When set, the CTA is disabled (e.g. vacant land). */
  disabledReason?: string | null;
}) {
  const [estimate, setEstimate] = useState<LtrEstimatePayload | null>(cached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onApply(est);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const projection =
    estimate && Number.isFinite(estimate.median)
      ? projectRent(estimate.median)
      : null;

  return (
    <div className="bg-surfaceAlt border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-text text-xs font-semibold">
          Comps-based rent estimate
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

          <div className="flex items-center justify-between gap-2">
            <p className="text-textMuted text-[11px]">
              {estimate.comparableCount
                ? `Based on ${estimate.comparableCount} Zillow rentals. `
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
                title="Fetch a fresh for-rent comps search via HasData"
              >
                {loading ? "Refreshing…" : "Refresh comps"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-textMuted text-xs leading-5">
            The rent above is a Zillow rentZestimate or price-based guess.
            Pull active for-rent listings in this area (similar beds / type),
            take the median ask, and apply it to the pro-forma.
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

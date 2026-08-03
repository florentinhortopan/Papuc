"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

export type ConditionSeverity = "critical" | "major" | "minor" | "cosmetic";
export type ConditionOverall =
  | "turnkey"
  | "light_cosmetic"
  | "moderate_rehab"
  | "heavy_rehab"
  | "unknown";

export interface ConditionFinding {
  id: string;
  severity: ConditionSeverity;
  category: string;
  title: string;
  detail: string;
  photoIndexes?: number[];
  estimatedCostLow?: number;
  estimatedCostHigh?: number;
  costBucket: "rehab" | "maintenance" | "none";
  confidence: "high" | "medium" | "low";
}

export interface ConditionEstimatePayload {
  overall: ConditionOverall | string | null;
  summary: string | null;
  findings: ConditionFinding[];
  rehabLow: number | null;
  rehabHigh: number | null;
  rehabSuggested: number;
  maintenanceMonthlySuggested: number;
  photoCount: number | null;
  model: string | null;
  disclaimer: string;
  estimatedAt: string | null;
}

export interface ConditionApplyPayload {
  improvements: number;
  maintenanceMonthly: number;
}

const OVERALL_LABEL: Record<string, string> = {
  turnkey: "Turnkey",
  light_cosmetic: "Light cosmetic",
  moderate_rehab: "Moderate rehab",
  heavy_rehab: "Heavy rehab",
  unknown: "Unclear from photos",
};

function severityVariant(
  severity: ConditionSeverity,
): "danger" | "warning" | "muted" | "primary" {
  switch (severity) {
    case "critical":
      return "danger";
    case "major":
      return "warning";
    case "minor":
      return "primary";
    default:
      return "muted";
  }
}

/**
 * On-demand listing-photo condition / rehab widget. First click runs
 * Claude vision against cached HasData photo URLs; the result is stored
 * on the deal. Fetch success auto-applies suggested Improvements +
 * Maintenance via `onApply` (user can still edit the fields).
 *
 * BILLING: UI copy marks this as premium; server-side subscription gate
 * lands with Stripe metering.
 */
export function PhotoConditionEstimate({
  dealId,
  cached,
  onApply,
}: {
  dealId: string;
  cached: ConditionEstimatePayload | null;
  onApply: (vals: ConditionApplyPayload) => void;
}) {
  const [estimate, setEstimate] = useState<ConditionEstimatePayload | null>(
    cached,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchEstimate(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/condition-estimate${refresh ? "?refresh=1" : ""}`,
      );
      // Platform timeouts (Vercel 504) often return plain text like
      // "An error occurred with your deployment" — never call .json() blind.
      const text = await res.text();
      let body: Record<string, unknown> = {};
      if (text) {
        try {
          body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          const looksTimedOut =
            res.status === 504 ||
            res.status === 524 ||
            /error occurred|timed out|timeout/i.test(text);
          throw new Error(
            looksTimedOut
              ? "Photo analysis timed out on the server. Wait a moment and try again."
              : text.slice(0, 240) ||
                  `condition estimate failed (${res.status})`,
          );
        }
      }
      if (!res.ok) {
        throw new Error(
          (typeof body.error === "string" && body.error) ||
            `condition estimate failed (${res.status})`,
        );
      }
      const est: ConditionEstimatePayload = {
        overall: (body.overall as string | null) ?? null,
        summary: (body.summary as string | null) ?? null,
        findings: Array.isArray(body.findings)
          ? (body.findings as ConditionEstimatePayload["findings"])
          : [],
        rehabLow:
          body.rehabLow == null ? null : Number(body.rehabLow as number),
        rehabHigh:
          body.rehabHigh == null ? null : Number(body.rehabHigh as number),
        rehabSuggested: Number(body.rehabSuggested ?? 0),
        maintenanceMonthlySuggested: Number(
          body.maintenanceMonthlySuggested ?? 0,
        ),
        photoCount:
          body.photoCount == null ? null : Number(body.photoCount as number),
        model: (body.model as string | null) ?? null,
        disclaimer:
          (typeof body.disclaimer === "string" && body.disclaimer) ||
          "Based on listing photos only — not a home inspection.",
        estimatedAt: (body.estimatedAt as string | null) ?? null,
      };
      setEstimate(est);
      onApply({
        improvements: est.rehabSuggested,
        maintenanceMonthly: est.maintenanceMonthlySuggested,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surfaceAlt border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-text text-xs font-semibold">
          Photo condition analysis
        </p>
        {estimate ? (
          <Badge variant="success">
            {OVERALL_LABEL[estimate.overall ?? ""] ?? "Analyzed"}
          </Badge>
        ) : (
          <Badge>premium · opt-in</Badge>
        )}
      </div>

      {estimate ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-text text-sm font-semibold">
                {formatMoney(estimate.rehabSuggested)}
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Rehab suggested
              </p>
              {estimate.rehabLow != null && estimate.rehabHigh != null ? (
                <p className="text-textMuted text-[10px] mt-0.5">
                  {formatMoney(estimate.rehabLow)}–{formatMoney(estimate.rehabHigh)}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-text text-sm font-semibold">
                {formatMoney(estimate.maintenanceMonthlySuggested)}/mo
              </p>
              <p className="text-textMuted text-[10px] uppercase tracking-wide">
                Maintenance
              </p>
            </div>
          </div>

          {estimate.summary ? (
            <p className="text-text text-xs leading-5">{estimate.summary}</p>
          ) : null}

          {estimate.findings.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {estimate.findings.map((f) => (
                <li
                  key={f.id}
                  className="border border-border rounded-lg px-2 py-1.5 space-y-0.5"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={severityVariant(f.severity)}>
                      {f.severity}
                    </Badge>
                    <Badge>{f.costBucket}</Badge>
                    <span className="text-text text-xs font-medium">
                      {f.title}
                    </span>
                  </div>
                  <p className="text-textMuted text-[11px] leading-4">
                    {f.detail}
                  </p>
                  {f.estimatedCostLow != null || f.estimatedCostHigh != null ? (
                    <p className="text-textMuted text-[10px]">
                      Est.{" "}
                      {f.estimatedCostLow != null
                        ? formatMoney(f.estimatedCostLow)
                        : "—"}
                      –
                      {f.estimatedCostHigh != null
                        ? formatMoney(f.estimatedCostHigh)
                        : "—"}
                      {" · "}
                      {f.confidence} confidence
                    </p>
                  ) : (
                    <p className="text-textMuted text-[10px]">
                      {f.confidence} confidence
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-textMuted text-[11px] leading-4 italic">
            {estimate.disclaimer}
          </p>

          <div className="flex items-center justify-between gap-2">
            <p className="text-textMuted text-[11px]">
              {estimate.photoCount
                ? `${estimate.photoCount} photos. `
                : ""}
              {estimate.estimatedAt
                ? `Analyzed ${new Date(estimate.estimatedAt).toLocaleDateString()}.`
                : ""}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() =>
                  onApply({
                    improvements: estimate.rehabSuggested,
                    maintenanceMonthly: estimate.maintenanceMonthlySuggested,
                  })
                }
              >
                Apply
              </button>
              <button
                type="button"
                className="text-xs text-textMuted hover:underline disabled:opacity-50"
                disabled={loading}
                onClick={() => fetchEstimate(true)}
                title="Re-run Claude vision on listing photos"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-textMuted text-xs leading-5">
            Have Claude review the listing photos for red flags, deferred
            maintenance, and rough rehab vs. ongoing maintenance costs. Results
            auto-fill Improvements and Maintenance — you can edit afterward.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => fetchEstimate(false)}
          >
            Analyze photos
          </Button>
          <p className="text-textMuted text-[11px] italic">
            Listing photos only — not a home inspection. Premium feature
            (billing coming soon).
          </p>
        </>
      )}

      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

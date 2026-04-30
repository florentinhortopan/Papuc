"use client";

import { computeProForma, type ProFormaInputs, type Strategy } from "@papuc/core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CashflowChart } from "@/components/cashflow-chart";
import { ComparablesPanel } from "@/components/comparables-panel";
import { DscrBadge } from "@/components/dscr-badge";
import { PhotoCarousel } from "@/components/photo-carousel";
import { StrMatrix, defaultStrMatrix, type StrMatrixValue } from "@/components/str-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { actOnDeal, clearDealAction, type DealWithScore } from "@/lib/deals";
import { exportProFormaCsv } from "@/lib/export";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import type { ProjectRow } from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";

interface ProFormaState {
  price: string;
  downPayment: string;
  improvements: string;
  taxRate: string;
  rateAPR: string;
  termYears: string;
  propertyTaxRatePct: string;
  insuranceMonthly: string;
  hoaMonthly: string;
  pmiRatePct: string;
  utilitiesMonthly: string;
  maintenanceMonthly: string;
  miscMonthly: string;
  monthlyRentLTR: string;
  strategy: Strategy;
}

function toNum(s: string, fallback = 0): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export function DealDetailClient({
  deal: initialDeal,
  project,
}: {
  deal: DealWithScore;
  project: ProjectRow;
}) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strMatrix, setStrMatrix] = useState<StrMatrixValue>(() =>
    defaultStrMatrix((Number(deal.est_rent ?? 2500) / 30) || 200),
  );
  const [state, setState] = useState<ProFormaState>(() => {
    const c = project.constraints;
    const priceForDown = Number(deal.price ?? 0);
    const fallbackDown = priceForDown * (1 - c.mortgage.ltv);
    return {
      price: String(deal.price ?? c.priceMax ?? 400000),
      downPayment: String(c.downPayment ?? fallbackDown ?? 0),
      improvements: "0",
      taxRate: "0.30",
      rateAPR: c.mortgage.rateAPR.toFixed(4),
      termYears: String(c.mortgage.termYears),
      propertyTaxRatePct: "0.011",
      insuranceMonthly: "100",
      hoaMonthly: "0",
      pmiRatePct: "0.01",
      utilitiesMonthly: c.strategy === "STR" ? "400" : "0",
      maintenanceMonthly: "100",
      miscMonthly: "100",
      monthlyRentLTR: String(deal.est_rent ?? 2500),
      strategy: c.strategy,
    };
  });

  const inputs: ProFormaInputs = useMemo(
    () => ({
      price: toNum(state.price),
      downPayment: toNum(state.downPayment),
      improvements: toNum(state.improvements),
      taxRate: toNum(state.taxRate, 0.3),
      rateAPR: toNum(state.rateAPR, 0.075),
      termYears: toNum(state.termYears, 30),
      propertyTaxRatePct: toNum(state.propertyTaxRatePct, 0.011),
      insuranceMonthly: toNum(state.insuranceMonthly, 100),
      hoaMonthly: toNum(state.hoaMonthly, 0),
      pmiRatePct: toNum(state.pmiRatePct, 0.01),
      utilitiesMonthly: toNum(state.utilitiesMonthly, 0),
      maintenanceMonthly: toNum(state.maintenanceMonthly, 100),
      miscMonthly: toNum(state.miscMonthly, 100),
      strategy: state.strategy,
      monthlyRentLTR:
        state.strategy === "LTR" ? toNum(state.monthlyRentLTR, 0) : 0,
      monthlyNights: state.strategy === "STR" ? strMatrix.monthlyNights : undefined,
      monthlyADR: state.strategy === "STR" ? strMatrix.monthlyADR : undefined,
      monthlyOccupancy:
        state.strategy === "STR" ? strMatrix.monthlyOccupancy : undefined,
      monthlyAvgStays:
        state.strategy === "STR" ? strMatrix.monthlyAvgStays : undefined,
    }),
    [state, strMatrix],
  );

  const result = useMemo(() => computeProForma(inputs), [inputs]);

  function patch<K extends keyof ProFormaState>(k: K, v: ProFormaState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function reload() {
    const supabase = createClient();
    const { data } = await supabase
      .from("deals")
      .select("*, deal_scores(*), deal_actions(action)")
      .eq("id", deal.id)
      .single();
    if (data) {
      const r = data as any;
      const score = Array.isArray(r.deal_scores)
        ? (r.deal_scores[0] ?? null)
        : (r.deal_scores ?? null);
      const action = Array.isArray(r.deal_actions)
        ? (r.deal_actions[0]?.action ?? null)
        : null;
      setDeal({ ...(r as any), score, action });
    }
  }

  async function save() {
    setError(null);
    setBusy("save");
    try {
      const supabase = createClient();
      await actOnDeal(supabase, {
        dealId: deal.id,
        projectId: deal.project_id,
        action: "saved",
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setError(null);
    setBusy("dismiss");
    try {
      const supabase = createClient();
      await actOnDeal(supabase, {
        dealId: deal.id,
        projectId: deal.project_id,
        action: "dismissed",
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function unsave() {
    setError(null);
    try {
      const supabase = createClient();
      await clearDealAction(supabase, { dealId: deal.id, action: "saved" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function exportCsv() {
    setBusy("export");
    try {
      exportProFormaCsv({
        address: deal.address ?? "deal",
        price: Number(deal.price ?? 0),
        beds: deal.beds,
        baths: deal.baths,
        sqft: deal.sqft,
        result,
      });
    } finally {
      setBusy(null);
    }
  }

  async function shareDeal() {
    const priceLabel = deal.price ? "list" : "est. value";
    const priceValue = formatMoney(deal.price ?? deal.est_value);
    const lines = [
      `${deal.address ?? "Property"} · ${priceLabel} ${priceValue}`,
      `${deal.beds ?? "?"} bd · ${deal.baths ?? "?"} ba · ${
        deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : "size unknown"
      }`,
      `DSCR ${formatDscr(result.dscr)} (lender 75% rent: ${formatDscr(result.dscrLenderHaircut)})`,
      `Pre-tax cashflow ${formatMoney(result.annualPreTaxProfit / 12)}/mo`,
      `Cash-on-cash ${formatPct(result.cashOnCashReturn)}`,
      `5-yr IRR ${result.irr5Yr !== null ? formatPct(result.irr5Yr) : "—"}`,
      `Calculated in Papuc.`,
    ].join("\n");

    const nav = (typeof navigator !== "undefined" ? navigator : null) as
      | (Navigator & { share?: (data: { text: string }) => Promise<void> })
      | null;
    if (nav?.share) {
      try {
        await nav.share({ text: lines });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(lines);
      alert("Deal details copied to clipboard.");
    } catch {
      alert(lines);
    }
  }

  const photos: string[] = (() => {
    if (Array.isArray(deal.photos) && deal.photos.length)
      return deal.photos as string[];
    if (deal.primary_image_url) return [deal.primary_image_url];
    return [];
  })();
  const isSaved = deal.action === "saved";

  return (
    <div className="mt-2 grid lg:grid-cols-[1.4fr,1fr] gap-6">
      <div className="space-y-6">
        <PhotoCarousel photos={photos} />

        <div>
          <h1 className="text-2xl font-bold">
            {deal.address ?? "Address pending"}
          </h1>
          <p className="text-textMuted text-sm mt-1">
            {[
              deal.beds ? `${deal.beds} bd` : null,
              deal.baths ? `${deal.baths} ba` : null,
              deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : null,
              deal.city && deal.state ? `${deal.city}, ${deal.state}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="primary">
              {deal.price ? "List" : "Est. value"}{" "}
              {formatMoney(deal.price ?? deal.est_value)}
            </Badge>
            <DscrBadge dscr={result.dscr} />
            <Badge
              variant={result.annualPreTaxProfit >= 0 ? "success" : "danger"}
            >
              {result.annualPreTaxProfit >= 0 ? "+" : ""}
              {formatMoney(result.annualPreTaxProfit / 12)}/mo
            </Badge>
            <Badge>CoC {formatPct(result.cashOnCashReturn)}</Badge>
          </div>
        </div>

        {deal.score?.rationale ? (
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-textMuted text-xs mb-1">Why this matched</p>
            <p className="text-text text-sm leading-6">{deal.score.rationale}</p>
          </div>
        ) : null}

        <CashflowChart monthlyPreTaxProfit={result.monthlyPreTaxProfit} />

        <ComparablesPanel dealId={deal.id} />
      </div>

      <div className="space-y-4">
        {error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
            <p className="text-danger text-xs">{error}</p>
          </div>
        ) : null}

        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-text text-base font-semibold mb-3">
            Pro-forma summary
          </p>
          <SummaryRow label="Initial sunk investment" value={formatMoney(result.initialSunkInvestment)} />
          <SummaryRow label="Annual pre-tax profit" value={formatMoney(result.annualPreTaxProfit)} />
          <SummaryRow label="Annual after-tax profit" value={formatMoney(result.annualPostTaxProfit)} />
          <SummaryRow label="Cash-on-cash return" value={formatPct(result.cashOnCashReturn)} />
          <SummaryRow
            label="Payout (years)"
            value={isFinite(result.payoutYears) ? result.payoutYears.toFixed(2) : "—"}
          />
          <SummaryRow
            label="5-yr IRR"
            value={result.irr5Yr !== null ? formatPct(result.irr5Yr) : "—"}
          />
          <SummaryRow
            label="5-yr equity multiple"
            value={`${result.equityMultiple5Yr.toFixed(2)}x`}
          />
          <SummaryRow label="DSCR" value={formatDscr(result.dscr)} />
          <SummaryRow
            label="DSCR (lender 75% rent)"
            value={formatDscr(result.dscrLenderHaircut)}
          />
          <SummaryRow label="Monthly PITIA" value={formatMoney(result.pitiaMonthly.total)} />
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-text text-base font-semibold mb-3">Inputs</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)" type="number" value={state.price} onChange={(e) => patch("price", e.target.value)} />
            <Field label="Down ($)" type="number" value={state.downPayment} onChange={(e) => patch("downPayment", e.target.value)} />
            <Field label="Rate APR" type="number" inputMode="decimal" value={state.rateAPR} onChange={(e) => patch("rateAPR", e.target.value)} hint="e.g. 0.075 = 7.5%" />
            <Field label="Term (yrs)" type="number" value={state.termYears} onChange={(e) => patch("termYears", e.target.value)} />
            <Field label="Tax rate" type="number" inputMode="decimal" value={state.taxRate} onChange={(e) => patch("taxRate", e.target.value)} hint="On rental profits" />
            <Field label="Prop tax %/yr" type="number" inputMode="decimal" value={state.propertyTaxRatePct} onChange={(e) => patch("propertyTaxRatePct", e.target.value)} hint="Berkeley default 0.011" />
            <Field label="Insurance ($/mo)" type="number" value={state.insuranceMonthly} onChange={(e) => patch("insuranceMonthly", e.target.value)} />
            <Field label="HOA ($/mo)" type="number" value={state.hoaMonthly} onChange={(e) => patch("hoaMonthly", e.target.value)} />
            <Field label="PMI %/yr" type="number" inputMode="decimal" value={state.pmiRatePct} onChange={(e) => patch("pmiRatePct", e.target.value)} hint="Auto 0 if LTV ≤ 80%" />
            <Field label="Utilities ($/mo)" type="number" value={state.utilitiesMonthly} onChange={(e) => patch("utilitiesMonthly", e.target.value)} />
            <Field label="Maintenance ($/mo)" type="number" value={state.maintenanceMonthly} onChange={(e) => patch("maintenanceMonthly", e.target.value)} />
            <Field label="Misc ($/mo)" type="number" value={state.miscMonthly} onChange={(e) => patch("miscMonthly", e.target.value)} />
          </div>
          <Field
            label={
              state.strategy === "STR"
                ? "Average daily rate ($, baseline for STR matrix)"
                : "Monthly rent ($)"
            }
            type="number"
            value={state.monthlyRentLTR}
            onChange={(e) => patch("monthlyRentLTR", e.target.value)}
          />
          <Field
            label="Strategy"
            value={state.strategy}
            onChange={(e) =>
              patch(
                "strategy",
                e.target.value.toUpperCase() === "STR" ? "STR" : "LTR",
              )
            }
            hint="LTR or STR"
          />
        </div>

        {state.strategy === "STR" ? (
          <StrMatrix value={strMatrix} onChange={setStrMatrix} />
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {isSaved ? (
            <Button variant="secondary" onClick={unsave}>
              Unsave
            </Button>
          ) : (
            <Button onClick={save} loading={busy === "save"}>
              Save
            </Button>
          )}
          <Button variant="secondary" onClick={shareDeal}>
            Share
          </Button>
          <Button variant="secondary" onClick={exportCsv} loading={busy === "export"}>
            Export CSV
          </Button>
          <Button variant="ghost" onClick={dismiss} loading={busy === "dismiss"}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-textMuted text-sm">{label}</span>
      <span className="text-text text-sm font-semibold">{value}</span>
    </div>
  );
}

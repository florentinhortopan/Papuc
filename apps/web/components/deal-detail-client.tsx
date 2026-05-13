"use client";

import {
  computeAutoPMIRateFromLoan,
  computeBreakevenADR,
  computeProForma,
  DEFAULT_INSURANCE_RATE_PCT,
  type ProFormaInputs,
  type Strategy,
} from "@papuc/core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CashflowBadge } from "@/components/cashflow-badge";
import { CashflowChart } from "@/components/cashflow-chart";
import { ComparablesPanel } from "@/components/comparables-panel";
import { DscrBadge } from "@/components/dscr-badge";
import { PhotoCarousel } from "@/components/photo-carousel";
import { StrMatrix, defaultStrMatrix, type StrMatrixValue } from "@/components/str-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actOnDeal, clearDealAction, type DealWithScore } from "@/lib/deals";
import { exportProFormaCsv } from "@/lib/export";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import type { ProjectRow } from "@/lib/projects";
import { getDealSourceLink } from "@/lib/source-url";
import { createClient } from "@/lib/supabase/client";

interface ProFormaState {
  price: string;
  downPayment: string;
  improvements: string;
  taxRate: string;
  rateAPR: string;
  termYears: string;
  propertyTaxRatePct: string;
  /** Source of truth for insurance: annual premium in $. Displayed alongside
   *  a derived %/yr cell that is also editable and writes back to this. */
  insuranceAnnual: string;
  hoaMonthly: string;
  /** Null = auto-derived from LTV via computeAutoPMIRateFromLoan. A string
   *  value means the user has overridden the auto rate. The "↻ Auto" button
   *  resets this back to null. */
  pmiOverride: string | null;
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
    const seedPrice = Number(deal.price ?? c.priceMax ?? 400000);
    const fallbackDown = seedPrice * (1 - c.mortgage.ltv);
    // Seed insurance from price at 0.35%/yr (US average) so expensive deals
    // don't start with a misleading $100/mo placeholder. Users still see
    // and can adjust the dollar figure directly.
    const seedInsuranceAnnual = Math.max(
      400,
      Math.round(seedPrice * DEFAULT_INSURANCE_RATE_PCT),
    );
    return {
      price: String(seedPrice),
      downPayment: String(c.downPayment ?? fallbackDown ?? 0),
      improvements: "0",
      taxRate: "0.30",
      rateAPR: c.mortgage.rateAPR.toFixed(4),
      termYears: String(c.mortgage.termYears),
      propertyTaxRatePct: "0.011",
      insuranceAnnual: String(seedInsuranceAnnual),
      hoaMonthly: String(deal.hoa_monthly ?? 0),
      pmiOverride: null,
      utilitiesMonthly: c.strategy === "STR" ? "400" : "0",
      maintenanceMonthly: "100",
      miscMonthly: "100",
      monthlyRentLTR: String(deal.est_rent ?? 2500),
      strategy: c.strategy,
    };
  });

  /**
   * Side-channel derivations used by the input UI (auto PMI rate, current
   * LTV, % insurance display). Kept separate from `inputs` so the field
   * components can render hints without re-running the proforma.
   */
  const derived = useMemo(() => {
    const price = toNum(state.price);
    const downPayment = toNum(state.downPayment);
    const loanAmount = Math.max(0, price - downPayment);
    const ltv = price > 0 ? loanAmount / price : 0;
    const autoPmiRate = computeAutoPMIRateFromLoan(price, downPayment);
    const insuranceAnnual = toNum(state.insuranceAnnual, 1200);
    const insuranceMonthly = insuranceAnnual / 12;
    const insuranceRatePct = price > 0 ? insuranceAnnual / price : 0;
    return {
      price,
      downPayment,
      loanAmount,
      ltv,
      autoPmiRate,
      insuranceAnnual,
      insuranceMonthly,
      insuranceRatePct,
    };
  }, [state.price, state.downPayment, state.insuranceAnnual]);

  const inputs: ProFormaInputs = useMemo(() => {
    const effectivePmiRate =
      state.pmiOverride !== null
        ? toNum(state.pmiOverride, derived.autoPmiRate)
        : derived.autoPmiRate;
    return {
      price: derived.price,
      downPayment: derived.downPayment,
      improvements: toNum(state.improvements),
      taxRate: toNum(state.taxRate, 0.3),
      rateAPR: toNum(state.rateAPR, 0.075),
      termYears: toNum(state.termYears, 30),
      propertyTaxRatePct: toNum(state.propertyTaxRatePct, 0.011),
      insuranceMonthly: derived.insuranceMonthly,
      hoaMonthly: toNum(state.hoaMonthly, 0),
      pmiRatePct: effectivePmiRate,
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
    };
  }, [state, strMatrix, derived]);

  const result = useMemo(() => computeProForma(inputs), [inputs]);
  const breakevenADR = useMemo(
    () => (inputs.strategy === "STR" ? computeBreakevenADR(inputs) : null),
    [inputs],
  );

  function patch<K extends keyof ProFormaState>(k: K, v: ProFormaState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  /**
   * When the user edits the "ADR baseline" field in STR mode, replicate
   * that value into all 12 cells of the STR matrix. Without this cascade
   * the field is misleading: it only feeds `monthlyRentLTR`, which is
   * ignored in STR mode (the matrix is the source of truth), so changes
   * looked like they did nothing.
   */
  function patchRentOrAdr(raw: string) {
    patch("monthlyRentLTR", raw);
    if (state.strategy === "STR") {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        setStrMatrix((m) => ({ ...m, monthlyADR: new Array(12).fill(n) }));
      }
    }
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

  const cachedPhotos: string[] = (() => {
    if (Array.isArray(deal.photos) && deal.photos.length)
      return deal.photos as string[];
    if (deal.primary_image_url) return [deal.primary_image_url];
    return [];
  })();
  const [photos, setPhotos] = useState<string[]>(cachedPhotos);
  const [photosLoading, setPhotosLoading] = useState(false);
  const isSaved = deal.action === "saved";
  const sourceLink = getDealSourceLink(deal);

  // Lazy-fetch the full Zillow photo gallery the first time this deal is
  // opened. The /photos route caches the result back into deals.photos so
  // subsequent visits skip the upstream call (and the credit cost).
  useEffect(() => {
    if (deal.source !== "hasdata") return;
    if (cachedPhotos.length > 1) return;
    let cancelled = false;
    setPhotosLoading(true);
    fetch(`/api/deals/${deal.id}/photos`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (Array.isArray(body?.photos) && body.photos.length > 0) {
          setPhotos(body.photos);
        }
        // /photos doubles as an HOA backfill when the listing didn't ship
        // one. Only auto-update if the user hasn't deviated from the
        // initial seed (zero), so we never clobber manual edits.
        if (
          typeof body?.hoaMonthly === "number" &&
          Number.isFinite(body.hoaMonthly)
        ) {
          setState((prev) =>
            toNum(prev.hoaMonthly, 0) === 0
              ? { ...prev, hoaMonthly: String(body.hoaMonthly) }
              : prev,
          );
        }
      })
      .catch(() => {
        // soft-fail: keep showing whatever cover photo we had
      })
      .finally(() => {
        if (!cancelled) setPhotosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deal.id, deal.source, cachedPhotos.length]);

  return (
    <div className="mt-2 grid lg:grid-cols-[1.4fr,1fr] gap-6">
      <div className="space-y-6">
        <div className="relative">
          <PhotoCarousel photos={photos} />
          {photosLoading ? (
            <div className="absolute left-3 top-3 bg-black/65 rounded-full px-2 py-1">
              <span className="text-white text-[11px]">Loading photos…</span>
            </div>
          ) : null}
        </div>

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
            <CashflowBadge monthlyCashflow={result.annualPreTaxProfit / 12} />
            <Badge>CoC {formatPct(result.cashOnCashReturn)}</Badge>
            {state.strategy === "STR" && breakevenADR !== null ? (
              <Badge
                variant={
                  inputs.monthlyADR && inputs.monthlyADR.some((a) => a >= breakevenADR)
                    ? "success"
                    : "danger"
                }
                title="The flat ADR at which annual pre-tax profit would equal zero, holding occupancy/nights constant."
              >
                BE ADR {formatMoney(breakevenADR)}/n
              </Badge>
            ) : null}
          </div>
          {sourceLink ? (
            <a
              href={sourceLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-sm hover:underline mt-3"
              title={
                sourceLink.isExact
                  ? `Open this listing on ${sourceLink.provider}`
                  : `${sourceLink.provider} address search (no deep link from data provider)`
              }
            >
              {sourceLink.label}
              <span aria-hidden>↗</span>
            </a>
          ) : null}
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
          <SummaryRow
            label="Monthly cashflow"
            value={`${result.annualPreTaxProfit >= 0 ? "+" : ""}${formatMoney(
              result.annualPreTaxProfit / 12,
            )}/mo`}
            emphasis={
              result.annualPreTaxProfit / 12 >= 100
                ? "positive"
                : result.annualPreTaxProfit / 12 >= -100
                  ? "neutral"
                  : "negative"
            }
          />
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
          <div className="ml-4 mt-1 mb-2 space-y-1">
            <SummaryRow
              label="↳ Principal + Interest"
              value={formatMoney(result.pitiaMonthly.principalAndInterest)}
              muted
            />
            <SummaryRow
              label="↳ Property taxes"
              value={formatMoney(result.pitiaMonthly.taxes)}
              muted
            />
            <SummaryRow
              label="↳ Insurance"
              value={formatMoney(result.pitiaMonthly.insurance)}
              muted
            />
            <SummaryRow
              label="↳ HOA"
              value={formatMoney(result.pitiaMonthly.hoa)}
              muted
            />
            <SummaryRow
              label="↳ PMI"
              value={
                result.pitiaMonthly.pmi > 0
                  ? formatMoney(result.pitiaMonthly.pmi)
                  : "—"
              }
              muted
            />
          </div>
          {state.strategy === "STR" ? (
            <SummaryRow
              label="Break-even ADR"
              value={
                breakevenADR === null
                  ? "—"
                  : `${formatMoney(breakevenADR)}/night`
              }
            />
          ) : null}
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
            <Field
              label="Insurance ($/yr)"
              type="number"
              value={state.insuranceAnnual}
              onChange={(e) => patch("insuranceAnnual", e.target.value)}
              hint={`≈ $${(derived.insuranceMonthly).toFixed(0)}/mo`}
            />
            <Field
              label="Insurance rate (%/yr)"
              type="number"
              inputMode="decimal"
              step="0.0001"
              value={derived.insuranceRatePct.toFixed(4)}
              onChange={(e) => {
                const pct = Number(e.target.value);
                if (Number.isFinite(pct) && derived.price > 0) {
                  patch(
                    "insuranceAnnual",
                    String(Math.round(pct * derived.price)),
                  );
                }
              }}
              hint={`% of price; 0.0035 ≈ 0.35%/yr (US avg)`}
            />
            <Field
              label="HOA ($/mo)"
              type="number"
              value={state.hoaMonthly}
              onChange={(e) => patch("hoaMonthly", e.target.value)}
              hint={
                deal.hoa_monthly != null
                  ? `Provider reported $${deal.hoa_monthly}/mo`
                  : "Not reported by provider — enter manually if known"
              }
            />
            <div className="mb-3">
              <Label htmlFor="pmi-input">PMI %/yr</Label>
              <Input
                id="pmi-input"
                type="number"
                inputMode="decimal"
                step="0.0001"
                readOnly={state.pmiOverride === null}
                value={
                  state.pmiOverride !== null
                    ? state.pmiOverride
                    : derived.autoPmiRate.toFixed(4)
                }
                onChange={(e) => patch("pmiOverride", e.target.value)}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-textMuted">
                  {state.pmiOverride === null
                    ? derived.ltv > 0.8
                      ? `Auto: ${(derived.autoPmiRate * 100).toFixed(2)}% · LTV ${(derived.ltv * 100).toFixed(1)}%`
                      : `Auto: 0% · LTV ${(derived.ltv * 100).toFixed(1)}% (no PMI)`
                    : `Manual override`}
                </p>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() =>
                    patch(
                      "pmiOverride",
                      state.pmiOverride === null
                        ? derived.autoPmiRate.toFixed(4)
                        : null,
                    )
                  }
                >
                  {state.pmiOverride === null ? "Edit" : "↻ Auto"}
                </button>
              </div>
            </div>
            <Field label="Utilities ($/mo)" type="number" value={state.utilitiesMonthly} onChange={(e) => patch("utilitiesMonthly", e.target.value)} />
            <Field label="Maintenance ($/mo)" type="number" value={state.maintenanceMonthly} onChange={(e) => patch("maintenanceMonthly", e.target.value)} />
            <Field label="Misc ($/mo)" type="number" value={state.miscMonthly} onChange={(e) => patch("miscMonthly", e.target.value)} />
          </div>
          <Field
            label={
              state.strategy === "STR"
                ? "Average daily rate ($, fills all 12 months below)"
                : "Monthly rent ($)"
            }
            type="number"
            value={state.monthlyRentLTR}
            onChange={(e) => patchRentOrAdr(e.target.value)}
            hint={
              state.strategy === "STR"
                ? "Changes propagate into the 12-month matrix below"
                : undefined
            }
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

function SummaryRow({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  /** Tint the value to convey sustainability at a glance — used by the
   *  top-of-summary monthly cashflow line. */
  emphasis?: "positive" | "negative" | "neutral";
}) {
  let valueClass = muted
    ? "text-textMuted text-xs"
    : "text-text text-sm font-semibold";
  if (emphasis === "positive") valueClass = "text-success text-sm font-semibold";
  else if (emphasis === "negative") valueClass = "text-danger text-sm font-semibold";
  else if (emphasis === "neutral") valueClass = "text-warning text-sm font-semibold";

  return (
    <div className={`flex justify-between ${muted ? "py-0.5" : "py-1"}`}>
      <span
        className={
          muted ? "text-textMuted text-xs" : "text-textMuted text-sm"
        }
      >
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

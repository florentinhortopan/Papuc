"use client";

import {
  computeAutoPMIRateFromLoan,
  computeBreakevenADR,
  computeProForma,
  DEFAULT_INSURANCE_RATE_PCT,
  estimateSTRAdrFromLTRRent,
  solveBreakevenDownPayment,
  solveBreakevenPrice,
  solveBreakevenRent,
  type ProFormaInputs,
  type Strategy,
} from "@papuc/core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { Slider } from "@/components/ui/slider";
import { actOnDeal, clearDealAction, type DealWithScore } from "@/lib/deals";
import { exportProFormaCsv } from "@/lib/export";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import type { ProjectRow } from "@/lib/projects";
import {
  asScenarioInputs,
  createScenario,
  deleteScenario,
  listScenarios,
  type ScenarioInputs,
  type ScenarioRow,
} from "@/lib/scenarios";
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
  /**
   * Seed the STR matrix using the SAME helper the scout uses. Previously
   * the editor seeded `est_rent / 30` (~$65/night for a $2k LTR rent)
   * while the scout used `estimateSTRAdrFromLTRRent` (industry multiplier
   * → ~$167/night). That mismatch is what made the card and the detail
   * page disagree on cashflow by 2-3x for the same listing.
   */
  const seedMonthlyRent = Number(deal.est_rent ?? 2500);
  const seedAdr =
    project.constraints.strategy === "STR"
      ? estimateSTRAdrFromLTRRent(seedMonthlyRent) || 200
      : seedMonthlyRent / 30 || 200;
  const [strMatrix, setStrMatrix] = useState<StrMatrixValue>(() =>
    defaultStrMatrix(seedAdr),
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
      // In STR mode this field is the "ADR baseline" used by the
      // patchRentOrAdr handler to broadcast a single daily rate into all
      // 12 matrix cells — seed it from the same per-night value that
      // populates the matrix so the field, the matrix, and the scout
      // agree at first paint.
      monthlyRentLTR:
        c.strategy === "STR"
          ? String(Math.round(seedAdr))
          : String(deal.est_rent ?? 2500),
      strategy: c.strategy,
    };
  });

  /**
   * Snapshot of the original price + downPayment captured on mount, so the
   * Scenario Simulator's "Reset" button can restore the baseline after the
   * user has dragged the sliders or invoked a break-even solver.
   */
  const baselineRef = useRef<{ price: number; downPayment: number } | null>(
    null,
  );
  if (baselineRef.current === null) {
    baselineRef.current = {
      price: toNum(state.price),
      downPayment: toNum(state.downPayment),
    };
  }
  const baseline = baselineRef.current;

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

  /**
   * Saved scenarios: hydrate on mount so the picker is populated, then
   * keep in sync after save/delete operations. We intentionally don't
   * subscribe to realtime here — multi-device editing of scenarios is
   * out of scope for now.
   */
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setScenariosLoading(true);
    listScenarios(deal.id)
      .then((rows) => {
        if (!cancelled) setScenarios(rows);
      })
      .catch(() => {
        // Soft-fail: scenarios are non-critical and we don't want a
        // network blip to crash the deal page.
      })
      .finally(() => {
        if (!cancelled) setScenariosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  /**
   * Re-hydrate the entire pro-forma editor from a saved scenario. Missing
   * fields fall back to the current state so old scenarios stay loadable
   * even after we add new pro-forma inputs.
   */
  function loadScenario(row: ScenarioRow) {
    const inputs = asScenarioInputs(row.inputs);
    if (!inputs) {
      setError("This scenario is in an unrecognized format.");
      return;
    }
    setState((s) => ({
      ...s,
      price: inputs.price ?? s.price,
      downPayment: inputs.downPayment ?? s.downPayment,
      improvements: inputs.improvements ?? s.improvements,
      taxRate: inputs.taxRate ?? s.taxRate,
      rateAPR: inputs.rateAPR ?? s.rateAPR,
      termYears: inputs.termYears ?? s.termYears,
      propertyTaxRatePct: inputs.propertyTaxRatePct ?? s.propertyTaxRatePct,
      insuranceAnnual: inputs.insuranceAnnual ?? s.insuranceAnnual,
      hoaMonthly: inputs.hoaMonthly ?? s.hoaMonthly,
      pmiOverride:
        inputs.pmiOverride === undefined ? s.pmiOverride : inputs.pmiOverride,
      utilitiesMonthly: inputs.utilitiesMonthly ?? s.utilitiesMonthly,
      maintenanceMonthly: inputs.maintenanceMonthly ?? s.maintenanceMonthly,
      miscMonthly: inputs.miscMonthly ?? s.miscMonthly,
      monthlyRentLTR: inputs.monthlyRentLTR ?? s.monthlyRentLTR,
      strategy: inputs.strategy ?? s.strategy,
    }));
    if (inputs.strMatrix) {
      setStrMatrix({
        monthlyNights: inputs.strMatrix.monthlyNights,
        monthlyADR: inputs.strMatrix.monthlyADR,
        monthlyOccupancy: inputs.strMatrix.monthlyOccupancy,
        monthlyAvgStays: inputs.strMatrix.monthlyAvgStays,
      });
    }
    setActiveScenarioId(row.id);
    setError(null);
  }

  /**
   * Snapshot the current editor as a new scenario row. Prompts for a
   * label inline so the user can give meaningful names ("After
   * negotiation", "20% down", "STR optimistic").
   */
  async function saveScenario() {
    const name = window.prompt(
      "Name this scenario (e.g. \"After negotiation\")",
      `Scenario ${scenarios.length + 1}`,
    );
    if (!name || !name.trim()) return;
    setBusy("save-scenario");
    setError(null);
    try {
      const snapshot: ScenarioInputs = {
        price: state.price,
        downPayment: state.downPayment,
        improvements: state.improvements,
        taxRate: state.taxRate,
        rateAPR: state.rateAPR,
        termYears: state.termYears,
        propertyTaxRatePct: state.propertyTaxRatePct,
        insuranceAnnual: state.insuranceAnnual,
        hoaMonthly: state.hoaMonthly,
        pmiOverride: state.pmiOverride,
        utilitiesMonthly: state.utilitiesMonthly,
        maintenanceMonthly: state.maintenanceMonthly,
        miscMonthly: state.miscMonthly,
        monthlyRentLTR: state.monthlyRentLTR,
        strategy: state.strategy,
        strMatrix: {
          monthlyNights: strMatrix.monthlyNights,
          monthlyADR: strMatrix.monthlyADR,
          monthlyOccupancy: strMatrix.monthlyOccupancy,
          monthlyAvgStays: strMatrix.monthlyAvgStays,
        },
      };
      const row = await createScenario({
        dealId: deal.id,
        name: name.trim(),
        inputs: snapshot,
        monthlyCashflow: result.annualPreTaxProfit / 12,
      });
      setScenarios((prev) => [row, ...prev]);
      setActiveScenarioId(row.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeScenario(id: string) {
    if (!window.confirm("Delete this scenario?")) return;
    setBusy("delete-scenario");
    setError(null);
    try {
      await deleteScenario(id);
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      if (activeScenarioId === id) setActiveScenarioId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

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

        <ScenarioSimulator
          baseline={baseline}
          currentPrice={derived.price}
          currentDownPayment={derived.downPayment}
          monthlyCashflow={result.annualPreTaxProfit / 12}
          onChange={(next) => {
            setState((s) => ({
              ...s,
              price: String(Math.round(next.price)),
              downPayment: String(Math.round(next.downPayment)),
            }));
          }}
          inputs={inputs}
        />

        <GapDiagnosis
          inputs={inputs}
          monthlyCashflow={result.annualPreTaxProfit / 12}
          onApplyPrice={(price) =>
            setState((s) => ({ ...s, price: String(Math.round(price)) }))
          }
          onApplyDown={(down) =>
            setState((s) => ({ ...s, downPayment: String(Math.round(down)) }))
          }
          onApplyRent={(rent) =>
            setState((s) => ({ ...s, monthlyRentLTR: String(Math.round(rent)) }))
          }
        />

        <ScenariosPanel
          scenarios={scenarios}
          loading={scenariosLoading}
          activeId={activeScenarioId}
          onSave={saveScenario}
          onLoad={loadScenario}
          onDelete={removeScenario}
          saving={busy === "save-scenario"}
          deleting={busy === "delete-scenario"}
        />

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

/**
 * Saved-scenario picker. Each row shows the scenario name, the monthly
 * cashflow snapshot captured at save time, and two actions: "Load"
 * re-hydrates the editor from the saved JSON; "Delete" removes the row.
 * The "Save current" button at the top serializes the live editor state
 * into a new scenario row.
 *
 * Scenarios are deal-scoped — the picker is empty until the user saves
 * the first one, with a one-line hint pointing at the save action.
 */
function ScenariosPanel({
  scenarios,
  loading,
  activeId,
  onSave,
  onLoad,
  onDelete,
  saving,
  deleting,
}: {
  scenarios: ScenarioRow[];
  loading: boolean;
  activeId: string | null;
  onSave: () => void;
  onLoad: (row: ScenarioRow) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-text text-base font-semibold">Saved scenarios</p>
        <Button
          variant="secondary"
          onClick={onSave}
          loading={saving}
          className="!text-xs !px-3 !py-1.5"
        >
          + Save current
        </Button>
      </div>

      {loading ? (
        <p className="text-textMuted text-xs italic">Loading…</p>
      ) : scenarios.length === 0 ? (
        <p className="text-textMuted text-xs">
          No scenarios yet. Tune the inputs (or run the break-even solvers
          above), then hit{" "}
          <span className="text-text">Save current</span> to keep this
          snapshot for later.
        </p>
      ) : (
        <ul className="space-y-2">
          {scenarios.map((s) => {
            const cashflow = s.monthly_cashflow_at_save;
            const tone =
              cashflow == null
                ? "text-textMuted"
                : cashflow >= 100
                  ? "text-success"
                  : cashflow >= -100
                    ? "text-warning"
                    : "text-danger";
            const isActive = activeId === s.id;
            return (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border bg-surfaceAlt"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-text text-sm font-semibold truncate">
                    {s.name}
                  </p>
                  <p className="text-textMuted text-[11px]">
                    {new Date(s.created_at).toLocaleDateString()} ·{" "}
                    <span className={tone}>
                      {cashflow == null
                        ? "no snapshot"
                        : `${cashflow >= 0 ? "+" : ""}${formatMoney(cashflow)}/mo at save`}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoad(s)}
                  className="text-xs text-primary hover:underline"
                  disabled={isActive}
                >
                  {isActive ? "Loaded" : "Load"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  className="text-xs text-danger/80 hover:text-danger hover:underline"
                  disabled={deleting}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Layer 1 "Gap diagnosis": for the current scenario, surface the *exact*
 * size of each independent lever that would zero out monthly cashflow.
 * This converts "this deal doesn't work" into concrete asks like
 * "negotiate $42k off, OR put $58k more down, OR find $310/mo more rent",
 * so the user can pick the path that's actually achievable.
 *
 * The card is read-only by default; each row's "Apply" button writes the
 * proposed value into the parent state so the rest of the page (chart,
 * PITIA, badges) updates live.
 */
function GapDiagnosis({
  inputs,
  monthlyCashflow,
  onApplyPrice,
  onApplyDown,
  onApplyRent,
}: {
  inputs: ProFormaInputs;
  monthlyCashflow: number;
  onApplyPrice: (price: number) => void;
  onApplyDown: (down: number) => void;
  onApplyRent: (rent: number) => void;
}) {
  const bePrice = useMemo(() => solveBreakevenPrice(inputs), [inputs]);
  const beDown = useMemo(() => solveBreakevenDownPayment(inputs), [inputs]);
  const beRent = useMemo(() => solveBreakevenRent(inputs), [inputs]);

  const isPositive = monthlyCashflow >= 0;
  const gapMonthly = -monthlyCashflow; // amount short of break-even
  const headline = isPositive
    ? `Already $${Math.round(monthlyCashflow).toLocaleString()}/mo above break-even`
    : `Need ${formatMoney(gapMonthly)}/mo more to break even`;

  // Compute % deltas relative to current values so the user sees the
  // magnitude of each ask at a glance.
  const priceDeltaPct =
    bePrice !== null && inputs.price > 0
      ? ((bePrice - inputs.price) / inputs.price) * 100
      : null;
  const downDeltaPct =
    beDown !== null && inputs.price > 0
      ? ((beDown - inputs.downPayment) / inputs.price) * 100
      : null;
  const rentDeltaPct =
    beRent !== null && (inputs.monthlyRentLTR ?? 0) > 0
      ? ((beRent - (inputs.monthlyRentLTR ?? 0)) /
          (inputs.monthlyRentLTR ?? 1)) *
        100
      : null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-text text-base font-semibold">Equivalent levers</p>
        <p
          className={`text-xs ${isPositive ? "text-success" : "text-warning"}`}
        >
          {headline}
        </p>
      </div>
      <p className="text-textMuted text-xs mb-3">
        Any one of these changes (holding the rest constant) would put
        monthly cashflow at exactly $0. Pick the lever you can realistically
        move.
      </p>

      <LeverRow
        label="Negotiate price to"
        value={bePrice}
        deltaPct={priceDeltaPct}
        deltaPrefix="vs ask"
        format={(v) => `$${Math.round(v).toLocaleString()}`}
        onApply={bePrice !== null ? () => onApplyPrice(bePrice) : null}
        unsolvable={
          bePrice === null
            ? "No price in the search range fits — the deal might be unfixable on this lever alone."
            : null
        }
      />
      <LeverRow
        label="Down payment to"
        value={beDown}
        deltaPct={downDeltaPct}
        deltaPrefix="of price"
        format={(v) => `$${Math.round(v).toLocaleString()}`}
        onApply={beDown !== null ? () => onApplyDown(beDown) : null}
        unsolvable={
          beDown === null
            ? "Even putting the full price down still loses money to carry costs."
            : null
        }
      />
      {inputs.strategy === "STR" ? (
        <p className="text-textMuted text-xs italic">
          STR rent break-even is the "Break-even ADR" shown in the pro-forma
          summary (the matrix below drives nightly revenue).
        </p>
      ) : (
        <LeverRow
          label="Monthly rent to"
          value={beRent}
          deltaPct={rentDeltaPct}
          deltaPrefix="vs current"
          format={(v) => `${formatMoney(v)}/mo`}
          onApply={beRent !== null ? () => onApplyRent(beRent) : null}
          unsolvable={
            beRent === null
              ? "Rent doesn't move cashflow enough at these inputs."
              : null
          }
        />
      )}
    </div>
  );
}

function LeverRow({
  label,
  value,
  deltaPct,
  deltaPrefix,
  format,
  onApply,
  unsolvable,
}: {
  label: string;
  value: number | null;
  deltaPct: number | null;
  deltaPrefix: string;
  format: (v: number) => string;
  onApply: (() => void) | null;
  unsolvable: string | null;
}) {
  if (unsolvable) {
    return (
      <div className="flex items-center justify-between py-2 border-t border-border first:border-t-0">
        <span className="text-textMuted text-sm">{label}</span>
        <span className="text-textMuted text-xs italic">{unsolvable}</span>
      </div>
    );
  }
  const deltaTone =
    deltaPct === null
      ? "text-textMuted"
      : deltaPct > 0
        ? "text-warning"
        : "text-success";
  return (
    <div className="flex items-center justify-between py-2 border-t border-border first:border-t-0">
      <span className="text-textMuted text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-text text-sm font-semibold">
          {value !== null ? format(value) : "—"}
        </span>
        {deltaPct !== null ? (
          <span className={`text-xs ${deltaTone} min-w-[64px] text-right`}>
            {deltaPct > 0 ? "+" : ""}
            {deltaPct.toFixed(1)}% {deltaPrefix}
          </span>
        ) : null}
        {onApply ? (
          <button
            type="button"
            onClick={onApply}
            className="text-xs text-primary hover:underline"
          >
            Apply
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "What-if" panel: drag the price or the down payment to see how it moves
 * monthly cashflow, with one-tap buttons to snap either lever to the value
 * that makes cashflow exactly zero (binary search via @papuc/core solvers).
 *
 * The simulator never owns state of its own — it writes the new price /
 * downPayment back through `onChange` to the parent, so the chart, badges,
 * PITIA breakdown, and DSCR all stay in lockstep with whatever the user
 * has dragged to.
 */
function ScenarioSimulator({
  baseline,
  currentPrice,
  currentDownPayment,
  monthlyCashflow,
  onChange,
  inputs,
}: {
  baseline: { price: number; downPayment: number };
  currentPrice: number;
  currentDownPayment: number;
  monthlyCashflow: number;
  onChange: (next: { price: number; downPayment: number }) => void;
  inputs: ProFormaInputs;
}) {
  const [error, setError] = useState<string | null>(null);

  // Slider ranges anchored to the baseline so the original price always
  // sits at a sensible spot on the track even after the user has dragged
  // beyond it. Min: 50% of baseline (can't reasonably offer less). Max:
  // 110% of baseline so a small over-asking scenario is visible.
  const priceMin = Math.max(1, Math.round(baseline.price * 0.5));
  const priceMax = Math.max(
    Math.round(baseline.price * 1.1),
    Math.round(currentPrice * 1.05),
  );
  // Down payment range: 5%-50% of the current scenario price.
  const downMin = Math.max(0, Math.round(currentPrice * 0.05));
  const downMax = Math.max(Math.round(currentPrice * 0.5), downMin + 1);
  const safeDown = Math.min(downMax, Math.max(downMin, currentDownPayment));
  const downPct = currentPrice > 0 ? currentDownPayment / currentPrice : 0;

  const priceDelta = currentPrice - baseline.price;
  const downDelta = currentDownPayment - baseline.downPayment;

  const isDirty =
    Math.abs(priceDelta) > 0.5 || Math.abs(downDelta) > 0.5;

  function solveForPrice() {
    setError(null);
    const bePrice = solveBreakevenPrice({
      ...inputs,
      price: currentPrice,
      downPayment: currentDownPayment,
    });
    if (bePrice === null) {
      setError(
        "No break-even price exists within the search range with these other inputs.",
      );
      return;
    }
    // Clamp into the visible slider range so the thumb doesn't disappear.
    const clamped = Math.min(Math.max(bePrice, priceMin), priceMax * 3);
    onChange({ price: clamped, downPayment: currentDownPayment });
  }

  function solveForDown() {
    setError(null);
    const beDown = solveBreakevenDownPayment({
      ...inputs,
      price: currentPrice,
      downPayment: currentDownPayment,
    });
    if (beDown === null) {
      setError(
        "No down payment between $0 and the full price makes this deal break even.",
      );
      return;
    }
    onChange({ price: currentPrice, downPayment: beDown });
  }

  function reset() {
    setError(null);
    onChange(baseline);
  }

  const cashflowTone =
    monthlyCashflow >= 100
      ? "text-success"
      : monthlyCashflow >= -100
        ? "text-warning"
        : "text-danger";

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-text text-base font-semibold">
          Scenario simulator
        </p>
        <p className="text-textMuted text-xs">
          Drag to test what-ifs · solvers find exact break-even
        </p>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <Label htmlFor="sim-price">Offer price</Label>
          <span className="text-text text-sm font-semibold">
            ${Math.round(currentPrice).toLocaleString()}{" "}
            <span
              className={`text-xs ${
                priceDelta === 0
                  ? "text-textMuted"
                  : priceDelta < 0
                    ? "text-success"
                    : "text-danger"
              }`}
            >
              ({priceDelta >= 0 ? "+" : ""}
              {Math.round((priceDelta / baseline.price) * 100)}%)
            </span>
          </span>
        </div>
        <Slider
          id="sim-price"
          min={priceMin}
          max={priceMax}
          step={1000}
          value={[Math.min(Math.max(currentPrice, priceMin), priceMax)]}
          onValueChange={(v) =>
            onChange({ price: v[0] ?? currentPrice, downPayment: currentDownPayment })
          }
        />
        <div className="flex justify-between text-[10px] text-textMuted mt-1">
          <span>${priceMin.toLocaleString()}</span>
          <span>baseline ${baseline.price.toLocaleString()}</span>
          <span>${priceMax.toLocaleString()}</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <Label htmlFor="sim-down">Down payment</Label>
          <span className="text-text text-sm font-semibold">
            ${Math.round(currentDownPayment).toLocaleString()}{" "}
            <span className="text-xs text-textMuted">
              ({(downPct * 100).toFixed(1)}% of price)
            </span>
          </span>
        </div>
        <Slider
          id="sim-down"
          min={downMin}
          max={downMax}
          step={1000}
          value={[safeDown]}
          onValueChange={(v) =>
            onChange({ price: currentPrice, downPayment: v[0] ?? currentDownPayment })
          }
        />
        <div className="flex justify-between text-[10px] text-textMuted mt-1">
          <span>${downMin.toLocaleString()}</span>
          <span>baseline ${Math.round(baseline.downPayment).toLocaleString()}</span>
          <span>${downMax.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center justify-between bg-surfaceAlt border border-border rounded-xl px-3 py-2 mb-3">
        <span className="text-textMuted text-sm">Monthly cashflow</span>
        <span className={`text-sm font-semibold ${cashflowTone}`}>
          {monthlyCashflow >= 0 ? "+" : ""}
          {formatMoney(monthlyCashflow)}/mo
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          onClick={solveForPrice}
          title="Find the highest price you could pay and still break even, holding the current down payment"
        >
          ↓ Break-even price
        </Button>
        <Button
          variant="secondary"
          onClick={solveForDown}
          title="Find the down payment that makes monthly cashflow zero, holding the current price"
        >
          ↑ Break-even down
        </Button>
        <Button
          variant="ghost"
          onClick={reset}
          disabled={!isDirty}
        >
          Reset
        </Button>
      </div>

      {error ? (
        <p className="text-danger text-xs mt-2">{error}</p>
      ) : null}
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

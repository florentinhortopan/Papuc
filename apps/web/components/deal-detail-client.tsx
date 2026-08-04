"use client";

import {
  computeAutoPMIRateFromLoan,
  computeBreakevenADR,
  computeProForma,
  DEFAULT_LTR_VACANCY_RATE,
  solveBreakevenDownPayment,
  solveBreakevenPrice,
  solveBreakevenRent,
  solveMinDownPaymentForBreakeven,
  strScheduleFromEstimate,
  type ProFormaInputs,
  type Strategy,
  type StrMarketAdrIntel,
} from "@papuc/core";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CashflowBadge } from "@/components/cashflow-badge";
import { CashflowChart } from "@/components/cashflow-chart";
import { ComparablesPanel } from "@/components/comparables-panel";
import { DscrBadge } from "@/components/dscr-badge";
import { MarketSignalBadges } from "@/components/market-signal-badges";
import { PhotoCarousel } from "@/components/photo-carousel";
import { StrCashflowMatrix, defaultStrMatrix, type StrMatrixValue } from "@/components/str-matrix";
import {
  PhotoConditionEstimate,
  findingsCitingPhoto,
  type ConditionEstimatePayload,
} from "@/components/photo-condition-estimate";
import {
  LtrMarketEstimate,
  type LtrEstimatePayload,
} from "@/components/ltr-market-estimate";
import { StrMarketEstimate, type StrEstimatePayload } from "@/components/str-market-estimate";
import { StrRegulationsCard } from "@/components/str-regulations-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { dealStreetAddress } from "@/lib/deal-address";
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
import { underwriteSeeds } from "@/lib/underwrite";
import { cn } from "@/lib/utils";

interface ProFormaState {
  price: string;
  downPayment: string;
  improvements: string;
  /** One-time buyer closing costs in $. Counted in the initial sunk
   *  investment (CoC / payout / IRR), not in monthly cashflow. */
  closingCosts: string;
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
  /** Management fee as a fraction of rental revenue (0.15 = 15%). */
  managementFeePct: string;
  /** LTR-only vacancy allowance as a fraction of the year (0.05 = 5%). */
  vacancyRateLTR: string;
  monthlyRentLTR: string;
  strategy: Strategy;
}

function capitalizeSeverity(severity: string): string {
  if (!severity) return "Note";
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function toNum(s: string, fallback = 0): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export function DealDetailClient({
  deal: initialDeal,
  project,
  marketAdrIntel,
  autoConditionAnalysis = true,
}: {
  deal: DealWithScore;
  project: ProjectRow;
  /** Cached web-search market ADR intel for this deal's city (or null). */
  marketAdrIntel?: StrMarketAdrIntel | null;
  /**
   * User setting: auto-start Catch the catch when this page opens
   * (skipped when a complete estimate is already cached).
   */
  autoConditionAnalysis?: boolean;
}) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** AirROI estimate already persisted on the deal row, if the user fetched one before. */
  const cachedStrEstimate: StrEstimatePayload | null =
    deal.str_estimated_at && deal.str_adr != null && deal.str_occupancy != null
      ? {
          adr: Number(deal.str_adr),
          occupancy: Number(deal.str_occupancy),
          annualRevenue:
            deal.str_annual_revenue != null
              ? Number(deal.str_annual_revenue)
              : null,
          percentiles:
            (deal.str_percentiles as StrEstimatePayload["percentiles"]) ?? null,
          monthlyRevenueDistribution: Array.isArray(deal.str_monthly_distribution)
            ? (deal.str_monthly_distribution as number[])
            : null,
          estimatedAt: deal.str_estimated_at,
        }
      : null;

  /** HasData for-rent comps estimate already cached on the deal, if any. */
  const cachedLtrEstimate: LtrEstimatePayload | null =
    deal.ltr_estimated_at && deal.ltr_rent_median != null
      ? {
          median: Number(deal.ltr_rent_median),
          p25: deal.ltr_rent_p25 != null ? Number(deal.ltr_rent_p25) : null,
          p75: deal.ltr_rent_p75 != null ? Number(deal.ltr_rent_p75) : null,
          comparableCount: deal.ltr_comp_count ?? 0,
          estimatedAt: deal.ltr_estimated_at,
          source: deal.ltr_estimate_source ?? undefined,
        }
      : null;

  const dealHomeType =
    deal.mls_data &&
    typeof (deal.mls_data as Record<string, unknown>).homeType === "string"
      ? ((deal.mls_data as Record<string, unknown>).homeType as string)
      : null;
  const isLandDeal = Boolean(dealHomeType && /^(LOT|LAND)$/i.test(dealHomeType));

  /** Completed photo-condition estimate cached on the deal (full gallery). */
  const cachedConditionEstimate: ConditionEstimatePayload | null = useMemo(() => {
    if (
      !(
        deal.condition_estimated_at &&
        (deal.condition_status === "complete" || deal.condition_status == null) &&
        deal.condition_rehab_suggested != null &&
        deal.condition_maintenance_monthly_suggested != null
      )
    ) {
      return null;
    }
    return {
      overall: deal.condition_overall,
      summary: deal.condition_summary,
      findings: Array.isArray(deal.condition_findings)
        ? (deal.condition_findings as ConditionEstimatePayload["findings"])
        : [],
      rehabLow:
        deal.condition_rehab_low != null
          ? Number(deal.condition_rehab_low)
          : null,
      rehabHigh:
        deal.condition_rehab_high != null
          ? Number(deal.condition_rehab_high)
          : null,
      rehabSuggested: Number(deal.condition_rehab_suggested),
      maintenanceMonthlySuggested: Number(
        deal.condition_maintenance_monthly_suggested,
      ),
      photoCount: deal.condition_photo_count,
      photosTotal: deal.condition_photos_total,
      model: deal.condition_model,
      disclaimer:
        deal.condition_disclaimer ??
        "Based on listing photos only — not a home inspection.",
      estimatedAt: deal.condition_estimated_at,
      done: true,
    };
  }, [
    deal.condition_estimated_at,
    deal.condition_status,
    deal.condition_rehab_suggested,
    deal.condition_maintenance_monthly_suggested,
    deal.condition_overall,
    deal.condition_summary,
    deal.condition_findings,
    deal.condition_rehab_low,
    deal.condition_rehab_high,
    deal.condition_photo_count,
    deal.condition_photos_total,
    deal.condition_model,
    deal.condition_disclaimer,
  ]);

  /**
   * All default assumptions come from the shared `underwriteSeeds`
   * helper — the SAME function the public share page computes its live
   * verdict from, mirroring what the scout underwrote at scout time.
   * Any drift between these surfaces makes the deal card, the share
   * page, and this editor disagree on cashflow for the same listing —
   * that class of bug has bitten three times now (est_rent/30 seeding,
   * market-clamping only at scout time, share page quoting stale
   * deal_scores after the cost model evolved). Seed ONLY through the
   * helper.
   */
  const seeds = underwriteSeeds(
    deal,
    project.constraints,
    marketAdrIntel ?? undefined,
  );
  const seedMonthlyRent = seeds.monthlyRent;
  const [strMatrix, setStrMatrix] = useState<StrMatrixValue>(() =>
    seeds.strSchedule
      ? {
          monthlyNights: seeds.strSchedule.monthlyNights,
          monthlyADR: seeds.strSchedule.monthlyADR,
          monthlyOccupancy: seeds.strSchedule.monthlyOccupancy,
          monthlyAvgStays: seeds.strSchedule.monthlyAvgStays,
        }
      : defaultStrMatrix(seedMonthlyRent / 30 || 200),
  );
  const seedAdr =
    project.constraints.strategy === "STR"
      ? strMatrix.monthlyADR[0] || 200
      : seedMonthlyRent / 30 || 200;
  const [state, setState] = useState<ProFormaState>(() => {
    const c = project.constraints;
    return {
      price: String(seeds.price),
      downPayment: String(seeds.downPayment),
      improvements: "0",
      closingCosts: String(seeds.closingCosts),
      taxRate: "0.30",
      rateAPR: seeds.rateAPR.toFixed(4),
      termYears: String(seeds.termYears),
      propertyTaxRatePct: String(seeds.propertyTaxRatePct),
      insuranceAnnual: String(seeds.insuranceAnnual),
      hoaMonthly: String(seeds.hoaMonthly),
      pmiOverride: null,
      utilitiesMonthly: String(seeds.utilitiesMonthly),
      maintenanceMonthly: String(seeds.maintenanceMonthly),
      miscMonthly: String(seeds.miscMonthly),
      managementFeePct: String(seeds.managementFeeRate),
      vacancyRateLTR: String(seeds.vacancyRateLTR),
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
      closingCosts: toNum(state.closingCosts, 0),
      taxRate: toNum(state.taxRate, 0.3),
      rateAPR: toNum(state.rateAPR, 0.075),
      termYears: toNum(state.termYears, 30),
      interestOnly: project.constraints.mortgage?.interestOnly ?? false,
      propertyTaxRatePct: toNum(state.propertyTaxRatePct, 0.011),
      insuranceMonthly: derived.insuranceMonthly,
      hoaMonthly: toNum(state.hoaMonthly, 0),
      pmiRatePct: effectivePmiRate,
      utilitiesMonthly: toNum(state.utilitiesMonthly, 0),
      maintenanceMonthly: toNum(state.maintenanceMonthly, 100),
      miscMonthly: toNum(state.miscMonthly, 100),
      managementFeeRate: toNum(state.managementFeePct, 0),
      vacancyRateLTR: toNum(state.vacancyRateLTR, DEFAULT_LTR_VACANCY_RATE),
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
  }, [
    state,
    strMatrix,
    derived,
    project.constraints.mortgage?.interestOnly,
  ]);

  const result = useMemo(() => computeProForma(inputs), [inputs]);
  const breakevenADR = useMemo(
    () => (inputs.strategy === "STR" ? computeBreakevenADR(inputs) : null),
    [inputs],
  );
  /** Mean assumed nightly rate across the matrix — equals the ADR input
   *  field whenever the rate is flat (the default), so the header badge
   *  and the input mask always show the same number. */
  const currentAdr = useMemo(() => {
    if (inputs.strategy !== "STR" || !inputs.monthlyADR?.length) return 0;
    return (
      inputs.monthlyADR.reduce((a, b) => a + b, 0) / inputs.monthlyADR.length
    );
  }, [inputs]);

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

  /**
   * Push a comps-based estimate (AirROI) into the pro-forma: flat comps
   * ADR across the matrix, occupancy curve derived from the comps'
   * monthly revenue distribution, and the ADR field synced so all three
   * (field, matrix, summary) agree at once.
   */
  function applyStrEstimate(est: StrEstimatePayload) {
    const schedule = strScheduleFromEstimate({
      adr: est.adr,
      occupancy: est.occupancy,
      monthlyRevenueDistribution: est.monthlyRevenueDistribution,
    });
    setStrMatrix({
      monthlyNights: schedule.monthlyNights,
      monthlyADR: schedule.monthlyADR,
      monthlyOccupancy: schedule.monthlyOccupancy,
      monthlyAvgStays: schedule.monthlyAvgStays,
    });
    patch("monthlyRentLTR", String(Math.round(est.adr)));
  }

  function applyLtrEstimate(est: LtrEstimatePayload) {
    patch("monthlyRentLTR", String(Math.round(est.median)));
  }

  /**
   * Snapshot of Improvements / Maintenance taken right before photo-
   * condition costs are injected, so the toggle can reverse cleanly.
   */
  const conditionRestoreRef = useRef<{
    improvements: string;
    maintenanceMonthly: string;
  } | null>(null);
  const [conditionCostsIncluded, setConditionCostsIncluded] = useState(false);

  /** Toggle photo-condition rehab/maintenance into (or out of) the scenario. */
  function setConditionCostsIncludedInScenario(
    include: boolean,
    vals?: { improvements: number; maintenanceMonthly: number },
  ) {
    if (include && vals) {
      if (!conditionCostsIncluded) {
        conditionRestoreRef.current = {
          improvements: state.improvements,
          maintenanceMonthly: state.maintenanceMonthly,
        };
      }
      setState((s) => ({
        ...s,
        improvements: String(Math.round(vals.improvements)),
        maintenanceMonthly: String(Math.round(vals.maintenanceMonthly)),
      }));
      setConditionCostsIncluded(true);
      return;
    }
    const restore = conditionRestoreRef.current ?? {
      improvements: "0",
      maintenanceMonthly: String(Math.round(seeds.maintenanceMonthly)),
    };
    setState((s) => ({
      ...s,
      improvements: restore.improvements,
      maintenanceMonthly: restore.maintenanceMonthly,
    }));
    setConditionCostsIncluded(false);
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
        address: dealStreetAddress(deal) ?? "deal",
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
    setBusy("share");
    // Mint (or fetch) the public share link first — the URL is the whole
    // point of the share: recipients without an account land on
    // /share/[token], see the verdict, and get funneled into sign-up.
    let shareUrl: string | null = null;
    try {
      const res = await fetch(`/api/deals/${deal.id}/share`, { method: "POST" });
      if (res.ok) {
        const body = (await res.json()) as { url?: string };
        shareUrl = body.url ?? null;
      }
    } catch {
      // Link minting is best-effort; fall back to text-only share.
    } finally {
      setBusy(null);
    }

    const priceLabel = deal.price ? "list" : "est. value";
    const priceValue = formatMoney(deal.price ?? deal.est_value);
    const title = `${dealStreetAddress(deal) ?? "Property"} · ${priceLabel} ${priceValue}`;
    const lines = [
      title,
      `${deal.beds ?? "?"} bd · ${deal.baths ?? "?"} ba · ${
        deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : "size unknown"
      }`,
      `DSCR ${formatDscr(result.dscr)} (lender 75% rent: ${formatDscr(result.dscrLenderHaircut)})`,
      `Pre-tax cashflow ${formatMoney(result.annualPreTaxProfit / 12)}/mo`,
      `Cash-on-cash ${formatPct(result.cashOnCashReturn)}`,
      `5-yr IRR ${result.irr5Yr !== null ? formatPct(result.irr5Yr) : "—"}`,
      shareUrl ? `Full analysis: ${shareUrl}` : `Calculated in Papuc.`,
    ].join("\n");

    const nav = (typeof navigator !== "undefined" ? navigator : null) as
      | (Navigator & {
          share?: (data: {
            title?: string;
            text?: string;
            url?: string;
          }) => Promise<void>;
        })
      | null;
    if (nav?.share) {
      try {
        await nav.share(
          shareUrl ? { title, text: lines, url: shareUrl } : { text: lines },
        );
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(lines);
      alert(
        shareUrl
          ? "Deal summary + share link copied to clipboard."
          : "Deal details copied to clipboard.",
      );
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
  /** Driven by swipes and by taps on photo-condition findings. */
  const [photoIndex, setPhotoIndex] = useState(0);
  /** Live condition estimate (cached + in-session analysis) for carousel badge. */
  const [liveConditionEstimate, setLiveConditionEstimate] =
    useState<ConditionEstimatePayload | null>(cachedConditionEstimate);
  const [focusFindingId, setFocusFindingId] = useState<string | null>(null);
  const [focusFindingNonce, setFocusFindingNonce] = useState(0);
  /** Per-photo cursor when cycling findings from the carousel badge. */
  const photoFindingCycleRef = useRef<Record<number, number>>({});
  const isSaved = deal.action === "saved";
  const sourceLink = getDealSourceLink(deal);

  useEffect(() => {
    setLiveConditionEstimate(cachedConditionEstimate);
  }, [deal.id, cachedConditionEstimate]);

  const conditionAnalysisReady = Boolean(
    liveConditionEstimate?.estimatedAt &&
      liveConditionEstimate.done !== false &&
      ((liveConditionEstimate.findings?.length ?? 0) > 0 ||
        liveConditionEstimate.summary),
  );
  const findingsForCurrentPhoto = useMemo(
    () =>
      findingsCitingPhoto(
        liveConditionEstimate?.findings ?? [],
        photoIndex,
      ),
    [liveConditionEstimate?.findings, photoIndex],
  );
  const photoAnalysisBadge = useMemo(() => {
    if (!conditionAnalysisReady) return null;
    const worst = findingsForCurrentPhoto[0];
    const label = worst
      ? findingsForCurrentPhoto.length === 1
        ? capitalizeSeverity(worst.severity)
        : `${capitalizeSeverity(worst.severity)} · ${findingsForCurrentPhoto.length}`
      : "Rehab notes";
    return {
      label,
      tone: (worst?.severity ?? "neutral") as
        | "critical"
        | "major"
        | "minor"
        | "cosmetic"
        | "neutral",
      onClick: () => {
        if (findingsForCurrentPhoto.length > 0) {
          const cursor = photoFindingCycleRef.current[photoIndex] ?? 0;
          const next =
            findingsForCurrentPhoto[cursor % findingsForCurrentPhoto.length]!;
          photoFindingCycleRef.current[photoIndex] =
            (cursor + 1) % findingsForCurrentPhoto.length;
          setFocusFindingId(next.id);
        } else {
          setFocusFindingId(null);
        }
        setFocusFindingNonce((n) => n + 1);
      },
    };
  }, [conditionAnalysisReady, findingsForCurrentPhoto, photoIndex]);

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
      closingCosts: inputs.closingCosts ?? s.closingCosts,
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
      managementFeePct: inputs.managementFeePct ?? s.managementFeePct,
      vacancyRateLTR: inputs.vacancyRateLTR ?? s.vacancyRateLTR,
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
        closingCosts: state.closingCosts,
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
        managementFeePct: state.managementFeePct,
        vacancyRateLTR: state.vacancyRateLTR,
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
    <div className="mt-2 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
      {/* min-w-0: grid items default to min-width:auto and will grow to fit
          the STR matrix table instead of scrolling it horizontally. */}
      <div className="space-y-6 min-w-0">
        <div className="relative">
          <PhotoCarousel
            photos={photos}
            index={photoIndex}
            onIndexChange={setPhotoIndex}
            analysisBadge={photoAnalysisBadge}
          />
          {photosLoading ? (
            <div className="absolute left-3 top-3 bg-black/65 rounded-full px-2 py-1">
              <span className="text-white text-[11px]">Loading photos…</span>
            </div>
          ) : null}
        </div>

        <div>
          <h1 className="text-2xl font-bold">
            {dealStreetAddress(deal) ?? "Address pending"}
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
            <MarketSignalBadges
              daysOnMarket={deal.days_on_market}
              priceChange={deal.price_change}
              price={deal.price ?? deal.est_value}
              hoaMonthly={deal.hoa_monthly}
            />
            {state.strategy === "STR" && breakevenADR !== null ? (
              <Badge
                variant={currentAdr >= breakevenADR ? "success" : "danger"}
                title={`Assumed nightly rate (matches the ADR input and 12-month matrix) vs the break-even rate at which profit is $0 given all costs. ${
                  currentAdr >= breakevenADR
                    ? "Above break-even: the deal cash-flows at the assumed rate."
                    : "Below break-even: the assumed rate does not cover costs."
                }`}
              >
                ADR {formatMoney(currentAdr)} vs BE {formatMoney(breakevenADR)}/n
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

        {state.strategy === "STR" && deal.city && deal.state ? (
          <StrRegulationsCard city={deal.city} state={deal.state} />
        ) : null}

        {state.strategy === "STR" ? (
          <StrCashflowMatrix
            monthlyPreTaxProfit={result.monthlyPreTaxProfit}
            value={strMatrix}
            onChange={setStrMatrix}
          />
        ) : (
          <CashflowChart monthlyPreTaxProfit={result.monthlyPreTaxProfit} />
        )}

        <ComparablesPanel
          dealId={deal.id}
          projectId={deal.project_id}
          scenario={{
            price: derived.price > 0 ? derived.price : undefined,
            beds: deal.beds != null ? Number(deal.beds) : undefined,
            baths: deal.baths != null ? Number(deal.baths) : undefined,
            sqft: deal.sqft != null ? Number(deal.sqft) : undefined,
          }}
        />
      </div>

      <div className="space-y-4 min-w-0">
        {error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
            <p className="text-danger text-xs">{error}</p>
          </div>
        ) : null}

        <CollapsibleCard
          stats={[
            {
              label: "Cashflow",
              value: `${result.annualPreTaxProfit >= 0 ? "+" : ""}${formatMoney(
                result.annualPreTaxProfit / 12,
              )}/mo`,
              tone:
                result.annualPreTaxProfit / 12 >= 100
                  ? "positive"
                  : result.annualPreTaxProfit / 12 >= -100
                    ? "neutral"
                    : "negative",
            },
            {
              label: "DSCR (lender)",
              value: formatDscr(result.dscrLenderHaircut),
              tone:
                result.dscrLenderHaircut >= 1.25
                  ? "positive"
                  : result.dscrLenderHaircut >= 1
                    ? "neutral"
                    : "negative",
            },
            {
              label: "PITIA",
              value: `${formatMoney(result.pitiaMonthly.total)}/mo`,
            },
            state.strategy === "STR"
              ? {
                  label: "Break-even ADR",
                  value:
                    breakevenADR === null
                      ? "—"
                      : `${formatMoney(breakevenADR)}/night`,
                }
              : {
                  label: "Cash-on-cash",
                  value: formatPct(result.cashOnCashReturn),
                },
          ]}
        >
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
        </CollapsibleCard>

        <CollapsibleCard
          headerExtra={<Badge variant="primary">{state.strategy}</Badge>}
          stats={[
            { label: "Price", value: formatMoney(derived.price) },
            {
              label: "Down",
              value: `${formatMoney(derived.downPayment)}`,
            },
            {
              label: "Rate APR",
              value: `${(toNum(state.rateAPR) * 100).toFixed(2)}%`,
            },
            {
              label: "Term",
              value: `${Math.round(toNum(state.termYears))} yrs`,
            },
          ]}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)" type="number" value={state.price} onChange={(e) => patch("price", e.target.value)} />
            <Field label="Down ($)" type="number" value={state.downPayment} onChange={(e) => patch("downPayment", e.target.value)} />
            <Field label="Closing costs ($)" type="number" value={state.closingCosts} onChange={(e) => patch("closingCosts", e.target.value)} hint="One-time; counts toward cash invested" />
            <Field
              label="Improvements / rehab ($)"
              type="number"
              value={state.improvements}
              onChange={(e) => patch("improvements", e.target.value)}
              hint="One-time CapEx; counts toward cash invested"
            />
            <Field label="Rate APR" type="number" inputMode="decimal" value={state.rateAPR} onChange={(e) => patch("rateAPR", e.target.value)} hint="e.g. 0.075 = 7.5%" />
            <Field label="Term (yrs)" type="number" value={state.termYears} onChange={(e) => patch("termYears", e.target.value)} />
            <Field label="Tax rate" type="number" inputMode="decimal" value={state.taxRate} onChange={(e) => patch("taxRate", e.target.value)} hint="On rental profits" />
            <Field
              label="Prop tax %/yr"
              type="number"
              inputMode="decimal"
              value={state.propertyTaxRatePct}
              onChange={(e) => patch("propertyTaxRatePct", e.target.value)}
              hint={
                deal.property_tax_rate != null
                  ? "Actual rate from listing data"
                  : `${deal.state ?? "State"} average effective rate`
              }
            />
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
                  : toNum(state.hoaMonthly) > 0
                    ? "Unreported — assumed typical fee for this property type"
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
            <Field label="Maintenance ($/mo)" type="number" value={state.maintenanceMonthly} onChange={(e) => patch("maintenanceMonthly", e.target.value)} hint="Seeded at 1%/yr of price" />
            <Field label="Misc ($/mo)" type="number" value={state.miscMonthly} onChange={(e) => patch("miscMonthly", e.target.value)} />
            <Field
              label="Mgmt fee (of revenue)"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={state.managementFeePct}
              onChange={(e) => patch("managementFeePct", e.target.value)}
              hint="0.15 = 15%; set 0 if self-managing"
            />
            {state.strategy === "LTR" ? (
              <Field
                label="Vacancy (of year)"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={state.vacancyRateLTR}
                onChange={(e) => patch("vacancyRateLTR", e.target.value)}
                hint="0.05 = ~18 unrented days/yr"
              />
            ) : null}
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
        </CollapsibleCard>

        <PhotoConditionEstimate
          dealId={deal.id}
          cached={cachedConditionEstimate}
          included={conditionCostsIncluded}
          onIncludedChange={setConditionCostsIncludedInScenario}
          photoCount={photos.length}
          onEstimateChange={setLiveConditionEstimate}
          focusFindingId={focusFindingId}
          focusNonce={focusFindingNonce}
          autoRun={autoConditionAnalysis}
          onSelectPhoto={(i) => {
            setPhotoIndex(i);
            if (typeof document !== "undefined") {
              document
                .getElementById("deal-photos")
                ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }}
        />

        {state.strategy === "STR" ? (
          <StrMarketEstimate
            dealId={deal.id}
            cached={cachedStrEstimate}
            onApply={applyStrEstimate}
            baselineSource={
              marketAdrIntel &&
              (marketAdrIntel.adrLow !== undefined ||
                marketAdrIntel.adrMedian !== undefined ||
                marketAdrIntel.adrHigh !== undefined)
                ? "market_checked"
                : "heuristic"
            }
          />
        ) : (
          <LtrMarketEstimate
            dealId={deal.id}
            cached={cachedLtrEstimate}
            onApply={applyLtrEstimate}
            disabledReason={
              isLandDeal
                ? "Vacant land has no rental comps — LTR rent estimate is not available."
                : null
            }
            projectRent={(monthlyRent) => {
              const projected = computeProForma({
                ...inputs,
                strategy: "LTR",
                monthlyRentLTR: monthlyRent,
              });
              return {
                monthlyCashflow: projected.annualPreTaxProfit / 12,
                annualAfterTax: projected.annualPostTaxProfit,
              };
            }}
          />
        )}

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
          <Button
            variant="secondary"
            onClick={shareDeal}
            loading={busy === "share"}
          >
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
  /**
   * When ON, the price and down-payment sliders are coupled so that the
   * loan-to-value ratio stays constant: moving the price drags the down
   * with it, moving the down drags the price the same way. When OFF,
   * the sliders are independent (the old behavior).
   *
   * Default is OFF so the existing flow (move price alone, see cashflow
   * change) isn't disturbed. Users who want to model "what if I close
   * the rest of the gap with more cash?" can flip it on and the down
   * slider will keep pace with their target LTV.
   */
  const [lockLtv, setLockLtv] = useState(false);

  /**
   * Slider ranges are anchored ONLY to the baseline — never to the live
   * currentPrice. The old `priceMax = max(baseline*2, current*1.1)` /
   * `downMax = currentPrice` pair created a positive feedback loop with
   * Lock LTV: Radix would re-emit at the new max → applyDown set
   * price = down/ratio ≈ current/0.05 → ranges grew → repeat →
   * septillion-dollar offers. Hard caps keep coupling safe.
   */
  const priceMin = Math.max(1, Math.round(baseline.price * 0.3));
  const priceMax = Math.max(priceMin + 1, Math.round(baseline.price * 2));
  const downMin = 0;
  // All-cash at the top of the price window (not at the live price).
  const downMax = priceMax;
  const safePrice = Math.min(priceMax, Math.max(priceMin, currentPrice));
  const safeDown = Math.min(downMax, Math.max(downMin, currentDownPayment));
  const downPct =
    currentPrice > 0 && Number.isFinite(currentPrice)
      ? currentDownPayment / currentPrice
      : 0;

  const priceDelta = currentPrice - baseline.price;
  const downDelta = currentDownPayment - baseline.downPayment;

  const isDirty =
    Math.abs(priceDelta) > 0.5 || Math.abs(downDelta) > 0.5;

  const valuesExploded =
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(currentDownPayment) ||
    currentPrice > baseline.price * 3 ||
    currentPrice < 1;

  // Heal runaway state from the old Lock-LTV feedback loop.
  useEffect(() => {
    if (!valuesExploded) return;
    setLockLtv(false);
    setError("Scenario values were out of range and were reset to baseline.");
    onChange(baseline);
  }, [valuesExploded, baseline, onChange]);

  function clampPrice(p: number): number {
    if (!Number.isFinite(p)) return baseline.price;
    return Math.min(priceMax, Math.max(priceMin, Math.round(p)));
  }

  /** Handle a slider drag, applying LTV coupling when locked. */
  function applyPrice(nextPrice: number) {
    const price = clampPrice(nextPrice);
    if (lockLtv && currentPrice > 0 && Number.isFinite(currentDownPayment)) {
      const ratio = Math.min(1, Math.max(0, currentDownPayment / currentPrice));
      onChange({
        price,
        downPayment: Math.min(price, Math.max(0, Math.round(ratio * price))),
      });
    } else {
      onChange({
        price,
        downPayment: Math.min(price, Math.max(0, currentDownPayment)),
      });
    }
  }
  function applyDown(nextDown: number) {
    const down = Math.min(downMax, Math.max(downMin, Math.round(nextDown)));
    if (lockLtv && currentPrice > 0 && currentDownPayment > 0) {
      // Preserve LTV: price = down / ratio. Clamp price to the baseline
      // window so a drag (or a Radix re-emit at downMax) cannot invent
      // an unbounded offer.
      const ratio = Math.min(1, Math.max(0.01, currentDownPayment / currentPrice));
      const rawPrice = down / ratio;
      const price = clampPrice(rawPrice);
      onChange({
        price,
        downPayment: Math.min(price, Math.round(ratio * price)),
      });
    } else {
      const price = clampPrice(currentPrice);
      onChange({ price, downPayment: Math.min(price, down) });
    }
  }

  /**
   * Keep the purchase price fixed and lower the down payment toward the
   * cashflow break-even, floored at 20% of the original (baseline) price.
   * Only meaningful for deals that already cash-flow — lowering down on a
   * losing deal makes PITIA worse.
   */
  function solveForPrice() {
    setError(null);
    if (monthlyCashflow < 0) {
      setError(
        "This deal isn't cash-flowing yet — lowering the down payment would make it worse. Use “↑ Break-even down” to raise cash at close instead.",
      );
      return;
    }
    const minDown = baseline.price * 0.2;
    const beDown = solveMinDownPaymentForBreakeven(
      {
        ...inputs,
        // Hold the current offer price; do not solve by cutting it.
        price: currentPrice,
        downPayment: currentDownPayment,
      },
      { minDownPayment: minDown },
    );
    if (beDown === null) {
      setError(
        "Couldn't find a lower down payment that still breaks even. Try Reset, then retry.",
      );
      return;
    }
    onChange({ price: currentPrice, downPayment: beDown });
  }

  function solveForDown() {
    setError(null);
    const beDown = solveBreakevenDownPayment({
      ...inputs,
      price: currentPrice,
      downPayment: currentDownPayment,
    });
    if (beDown === null) {
      // The solver returns null in two opposite cases — disambiguate so
      // the user knows whether the deal is fine as-is or unfixable.
      setError(
        monthlyCashflow >= 0
          ? "Already profitable — you don't need more down to break even."
          : "Even an all-cash purchase wouldn't break even at this rent. Lower the price, raise the rent, or trim costs.",
      );
      return;
    }
    onChange({ price: currentPrice, downPayment: beDown });
  }

  function reset() {
    setError(null);
    setLockLtv(false);
    onChange(baseline);
  }

  const cashflowTone =
    monthlyCashflow >= 100
      ? "text-success"
      : monthlyCashflow >= -100
        ? "text-warning"
        : "text-danger";

  const ltvPct = currentPrice > 0
    ? Math.max(0, (1 - currentDownPayment / currentPrice) * 100)
    : 0;

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

      <div className="flex items-center justify-between mb-3 bg-surfaceAlt border border-border rounded-xl px-3 py-2">
        <div>
          <p className="text-text text-xs font-semibold">Lock LTV</p>
          <p className="text-textMuted text-[11px] leading-4">
            Couple sliders so {Math.round(100 - ltvPct)}% down stays
            constant
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLockLtv((v) => !v)}
          aria-pressed={lockLtv}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            lockLtv ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
              lockLtv ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
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
              {baseline.price > 0 && Number.isFinite(priceDelta)
                ? `${Math.round(
                    Math.min(9999, Math.max(-9999, (priceDelta / baseline.price) * 100)),
                  )}%`
                : "—"}
              )
            </span>
          </span>
        </div>
        <Slider
          id="sim-price"
          min={priceMin}
          max={priceMax}
          step={1000}
          value={[safePrice]}
          onValueChange={(v) => applyPrice(v[0] ?? currentPrice)}
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
              ({(downPct * 100).toFixed(1)}% of price · LTV {Math.round(ltvPct)}%)
            </span>
          </span>
        </div>
        <Slider
          id="sim-down"
          min={downMin}
          max={downMax}
          step={1000}
          value={[safeDown]}
          onValueChange={(v) => applyDown(v[0] ?? currentDownPayment)}
        />
        <div className="flex justify-between text-[10px] text-textMuted mt-1">
          <span>$0 (100% LTV)</span>
          <span>baseline ${Math.round(baseline.downPayment).toLocaleString()}</span>
          <span>${downMax.toLocaleString()} (all cash)</span>
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
          title="Keep the purchase price fixed and lower the down payment to break-even cashflow, floored at 20% of the original price (cash-flowing deals only)"
        >
          ↓ Min down @ BE
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

interface CoverStat {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}

/**
 * Panel that collapses to a scannable stat card. No title row — collapsed
 * view is just the stats grid. Strategy badge (optional) and chevron sit in
 * the top-right corner on the card's 45° bisector so they don't add height.
 * Expanded, stats hide and `children` show.
 */
function CollapsibleCard({
  headerExtra,
  stats,
  defaultOpen = false,
  children,
}: {
  /** Floated top-right beside the chevron (e.g. strategy badge). */
  headerExtra?: React.ReactNode;
  stats: CoverStat[];
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // rounded-2xl = 16px. Equal top/right inset keeps the control cluster on
  // the corner's 45° bisector; 10px nests a 32px control inside the curve.
  const contentPad = headerExtra ? "pr-28" : "pr-14";

  return (
    <div className="relative bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
        {headerExtra}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            "border border-border bg-surfaceAlt text-text shadow-sm",
            "hover:bg-border/50 hover:border-textMuted/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "transition-colors",
          )}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={2.5}
            aria-hidden
          />
        </button>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className={cn("w-full text-left p-4 select-none", contentPad)}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-textMuted text-[10px] uppercase tracking-wide truncate">
                  {s.label}
                </p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums leading-6 truncate",
                    s.tone === "positive"
                      ? "text-success"
                      : s.tone === "negative"
                        ? "text-danger"
                        : s.tone === "neutral"
                          ? "text-warning"
                          : "text-text",
                  )}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </button>
      ) : (
        <div className={cn("p-4", contentPad)}>{children}</div>
      )}
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

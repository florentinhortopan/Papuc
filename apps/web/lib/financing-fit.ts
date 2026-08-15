import { LENDERS, lenderCoversState, type Lender, type LoanProgram } from "./lenders";

export interface FinancingFitProfile {
  state?: string | null;
  city?: string | null;
  zip?: string | null;
  propertyType?: string | null;
  strategy: "LTR" | "STR";
  price: number;
  downPayment: number;
  ltv: number;
  dscr: number;
  dscrLenderHaircut: number;
  monthlyCashflow: number;
  rehabBudget: number;
  isLand: boolean;
  interestOnly?: boolean;
}

export interface MatchedLender {
  lender: Lender;
  score: number;
  fitReasons: string[];
  cautionReasons: string[];
  suggestedPrograms: LoanProgram[];
}

export interface FinancingFitResult {
  matches: MatchedLender[];
  profileSummary: string[];
  needsHardMoneyOrCashPath: boolean;
  needsLowDownPath: boolean;
  needsSubOneDscr: boolean;
  needsRehabPath: boolean;
}

function isNationwideOrState(lender: Lender, state?: string | null): boolean {
  return lenderCoversState(lender, state);
}

function propertyTypeOk(lender: Lender, propertyType?: string | null): boolean {
  if (!lender.propertyTypes.length) return true;
  if (!propertyType) return true;
  const t = propertyType.toLowerCase();
  return lender.propertyTypes.some((p) => t.includes(p.toLowerCase()));
}

/**
 * Deterministic filter + rank against the curated lender catalog.
 * LLM advice is layered on top by the API — this stays auditable.
 */
export function matchLenders(profile: FinancingFitProfile): FinancingFitResult {
  const needsRehabPath = profile.rehabBudget >= 15_000;
  const needsLowDownPath = profile.ltv > 0.8 || profile.downPayment / Math.max(profile.price, 1) < 0.2;
  const needsSubOneDscr = profile.dscrLenderHaircut < 1.0;
  const needsHardMoneyOrCashPath =
    profile.isLand ||
    needsRehabPath ||
    (profile.ltv > 0.85 && profile.dscrLenderHaircut < 1.0);

  const profileSummary: string[] = [
    `${profile.strategy} · ${profile.state ?? "US"}`,
    `Price ${Math.round(profile.price).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
    `Down ${Math.round(profile.downPayment).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} (${Math.round(profile.ltv * 100)}% LTV)`,
    `DSCR ${profile.dscr.toFixed(2)} (lender haircut ${profile.dscrLenderHaircut.toFixed(2)})`,
  ];
  if (needsRehabPath) {
    profileSummary.push(
      `Rehab ~$${Math.round(profile.rehabBudget).toLocaleString("en-US")}`,
    );
  }
  if (profile.isLand) profileSummary.push("Vacant land");

  const matches: MatchedLender[] = [];

  for (const lender of LENDERS) {
    if (!isNationwideOrState(lender, profile.state)) continue;
    if (!propertyTypeOk(lender, profile.propertyType)) continue;
    if (profile.isLand && !lender.programs.includes("hard_money") && !lender.programs.includes("bridge")) {
      // Most DSCR rental lenders skip raw dirt; keep bridge/hard-money paths.
      if (!lender.cashOrHardMoneyPath) continue;
    }

    const fitReasons: string[] = [];
    const cautionReasons: string[] = [];
    let score = 50;

    // DSCR gate
    if (profile.dscrLenderHaircut + 1e-9 < lender.minDscr) {
      if (lender.allowsSubOneDscr && needsSubOneDscr) {
        fitReasons.push("Has a no-ratio / sub-1.0 DSCR program for thin cashflow");
        score += 18;
      } else {
        cautionReasons.push(
          `Lender min DSCR ${lender.minDscr.toFixed(2)} vs your haircut DSCR ${profile.dscrLenderHaircut.toFixed(2)}`,
        );
        score -= 25;
      }
    } else {
      fitReasons.push(`Clears min DSCR ${lender.minDscr.toFixed(2)}`);
      score += 12;
    }

    // LTV / down payment
    if (profile.ltv > lender.maxLtv + 1e-9) {
      if (lender.allowsLowDown && needsLowDownPath) {
        fitReasons.push("Often flexible on smaller down payments");
        score += 8;
        cautionReasons.push(
          `Your LTV ${(profile.ltv * 100).toFixed(0)}% is above their typical max ${(lender.maxLtv * 100).toFixed(0)}% — confirm program`,
        );
      } else {
        cautionReasons.push(
          `Likely needs ≥${Math.round((1 - lender.maxLtv) * 100)}% down (max LTV ~${(lender.maxLtv * 100).toFixed(0)}%)`,
        );
        score -= 18;
      }
    } else {
      fitReasons.push(`LTV within typical max ${(lender.maxLtv * 100).toFixed(0)}%`);
      score += 10;
    }

    if (profile.strategy === "STR") {
      if (lender.supportsStr) {
        fitReasons.push("STR / vacation rental friendly");
        score += 14;
      } else {
        cautionReasons.push("Not known for STR underwriting");
        score -= 12;
      }
    }

    if (needsRehabPath) {
      if (lender.supportsRehab || lender.programs.includes("bridge") || lender.programs.includes("fix_flip")) {
        fitReasons.push("Rehab / bridge / fix-and-flip path available");
        score += 16;
      } else {
        cautionReasons.push("Light on rehab — may want cash/bridge then refinance");
        score -= 8;
      }
    }

    if (needsHardMoneyOrCashPath && lender.cashOrHardMoneyPath) {
      fitReasons.push("Bridge / hard-money style path if banks say no");
      score += 10;
    }

    if (needsLowDownPath && lender.allowsLowDown) {
      fitReasons.push("Better fit when down payment is thin");
      score += 8;
    }

    const suggestedPrograms = suggestPrograms(lender, profile, {
      needsRehabPath,
      needsHardMoneyOrCashPath,
    });

    // Drop clearly incompatible unless still useful as hard-money fallback
    if (score < 25 && !lender.cashOrHardMoneyPath) continue;

    matches.push({
      lender,
      score: Math.max(0, Math.min(100, score)),
      fitReasons,
      cautionReasons,
      suggestedPrograms,
    });
  }

  matches.sort((a, b) => b.score - a.score);

  return {
    matches: matches.slice(0, 6),
    profileSummary,
    needsHardMoneyOrCashPath,
    needsLowDownPath,
    needsSubOneDscr,
    needsRehabPath,
  };
}

function suggestPrograms(
  lender: Lender,
  profile: FinancingFitProfile,
  flags: { needsRehabPath: boolean; needsHardMoneyOrCashPath: boolean },
): LoanProgram[] {
  const out: LoanProgram[] = [];
  if (flags.needsRehabPath || flags.needsHardMoneyOrCashPath) {
    for (const p of ["bridge", "fix_flip", "hard_money"] as LoanProgram[]) {
      if (lender.programs.includes(p)) out.push(p);
    }
  }
  if (lender.programs.includes("dscr") && !profile.isLand) out.push("dscr");
  if (lender.programs.includes("portfolio")) out.push("portfolio");
  if (lender.programs.includes("conventional_investor") && profile.strategy === "LTR") {
    out.push("conventional_investor");
  }
  return Array.from(new Set(out));
}

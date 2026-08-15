export type LoanProgram =
  | "dscr"
  | "bridge"
  | "fix_flip"
  | "hard_money"
  | "portfolio"
  | "conventional_investor";

export interface Lender {
  id: string;
  name: string;
  url: string;
  minDscr: number;
  /** Max loan-to-value as a fraction (0.75 = 25% down). */
  maxLtv: number;
  notes: string;
  badges: string[];
  /** Empty / ["*"] = nationwide. Otherwise 2-letter state codes. */
  states: string[];
  programs: LoanProgram[];
  supportsStr: boolean;
  supportsRehab: boolean;
  /** Comfortable with investor LTVs above ~80% (small down). */
  allowsLowDown: boolean;
  /** Has no-ratio / sub-1.0 DSCR products. */
  allowsSubOneDscr: boolean;
  /** Useful when buyer may need cash / hard-money bridge then refinance. */
  cashOrHardMoneyPath: boolean;
  /** Property types this lender commonly funds; empty = most residential. */
  propertyTypes: string[];
}

export const LENDERS: Lender[] = [
  {
    id: "kiavi",
    name: "Kiavi",
    url: "https://kiavi.com",
    minDscr: 1.0,
    maxLtv: 0.8,
    notes: "Fast online prequal; DSCR + bridge + fix-and-flip programs.",
    badges: ["Online", "No-tax-return", "Bridge"],
    states: ["*"],
    programs: ["dscr", "bridge", "fix_flip"],
    supportsStr: true,
    supportsRehab: true,
    allowsLowDown: true,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: true,
    propertyTypes: [],
  },
  {
    id: "lima-one",
    name: "Lima One Capital",
    url: "https://limaone.com",
    minDscr: 1.0,
    maxLtv: 0.8,
    notes: "DSCR rental loans nationwide, 30-yr fixed, IO available.",
    badges: ["Nationwide", "Interest-only available"],
    states: ["*"],
    programs: ["dscr", "bridge"],
    supportsStr: true,
    supportsRehab: true,
    allowsLowDown: true,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: false,
    propertyTypes: [],
  },
  {
    id: "visio",
    name: "Visio Lending",
    url: "https://visiolending.com",
    minDscr: 1.0,
    maxLtv: 0.75,
    notes: "Vacation rental + LTR. Strong for first-time investors.",
    badges: ["STR-friendly"],
    states: ["*"],
    programs: ["dscr"],
    supportsStr: true,
    supportsRehab: false,
    allowsLowDown: false,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: false,
    propertyTypes: [],
  },
  {
    id: "rcn",
    name: "RCN Capital",
    url: "https://rcncapital.com",
    minDscr: 1.1,
    maxLtv: 0.75,
    notes: "DSCR + bridge; LLC vesting allowed.",
    badges: ["LLC vesting", "Bridge"],
    states: ["*"],
    programs: ["dscr", "bridge"],
    supportsStr: true,
    supportsRehab: true,
    allowsLowDown: false,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: true,
    propertyTypes: [],
  },
  {
    id: "easy-street",
    name: "Easy Street Capital",
    url: "https://easystreetcap.com",
    minDscr: 0.75,
    maxLtv: 0.65,
    notes: "Sub-1.0 DSCR (no-ratio) up to 65% LTV.",
    badges: ["No-ratio program"],
    states: ["*"],
    programs: ["dscr"],
    supportsStr: true,
    supportsRehab: false,
    allowsLowDown: false,
    allowsSubOneDscr: true,
    cashOrHardMoneyPath: false,
    propertyTypes: [],
  },
  {
    id: "constitution",
    name: "Constitution Lending",
    url: "https://constitutionlending.com",
    minDscr: 1.0,
    maxLtv: 0.75,
    notes: "Investor portfolios up to 10 doors.",
    badges: ["Portfolio loans"],
    states: ["*"],
    programs: ["dscr", "portfolio"],
    supportsStr: false,
    supportsRehab: false,
    allowsLowDown: false,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: false,
    propertyTypes: [],
  },
  {
    id: "lendsure",
    name: "Lendsure Mortgage",
    url: "https://lendsure.com",
    minDscr: 1.0,
    maxLtv: 0.8,
    notes: "Non-QM / DSCR investor loans; useful when bank statements replace tax returns.",
    badges: ["Non-QM", "Bank-statement"],
    states: ["*"],
    programs: ["dscr", "conventional_investor"],
    supportsStr: true,
    supportsRehab: false,
    allowsLowDown: true,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: false,
    propertyTypes: [],
  },
  {
    id: "corevest",
    name: "CoreVest Finance",
    url: "https://corevestfinance.com",
    minDscr: 1.0,
    maxLtv: 0.75,
    notes: "Bridge and rental; strong when light-to-moderate rehab is in scope.",
    badges: ["Bridge", "Rehab-friendly"],
    states: ["*"],
    programs: ["bridge", "dscr", "fix_flip"],
    supportsStr: false,
    supportsRehab: true,
    allowsLowDown: false,
    allowsSubOneDscr: false,
    cashOrHardMoneyPath: true,
    propertyTypes: [],
  },
];

export function lenderCoversState(lender: Lender, state: string | null | undefined): boolean {
  if (!state) return true;
  const code = state.trim().toUpperCase();
  if (!code) return true;
  if (lender.states.includes("*")) return true;
  return lender.states.map((s) => s.toUpperCase()).includes(code);
}

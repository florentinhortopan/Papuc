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
  maxLtv: number;
  notes: string;
  badges: string[];
  states: string[];
  programs: LoanProgram[];
  supportsStr: boolean;
  supportsRehab: boolean;
  allowsLowDown: boolean;
  allowsSubOneDscr: boolean;
  cashOrHardMoneyPath: boolean;
  propertyTypes: string[];
}

/** Keep mobile directory aligned with web catalog (static snapshot). */
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
];

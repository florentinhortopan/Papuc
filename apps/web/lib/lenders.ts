export interface Lender {
  name: string;
  url: string;
  minDscr: number;
  notes: string;
  badges: string[];
}

export const LENDERS: Lender[] = [
  {
    name: "Kiavi",
    url: "https://kiavi.com",
    minDscr: 1.0,
    notes: "Fast online prequal; DSCR + bridge + fix-and-flip programs.",
    badges: ["Online", "No-tax-return"],
  },
  {
    name: "Lima One Capital",
    url: "https://limaone.com",
    minDscr: 1.0,
    notes: "DSCR rental loans nationwide, 30-yr fixed, IO available.",
    badges: ["Nationwide", "Interest-only available"],
  },
  {
    name: "Visio Lending",
    url: "https://visiolending.com",
    minDscr: 1.0,
    notes: "Vacation rental + LTR. Strong for first-time investors.",
    badges: ["STR-friendly"],
  },
  {
    name: "RCN Capital",
    url: "https://rcncapital.com",
    minDscr: 1.1,
    notes: "DSCR + bridge; LLC vesting allowed.",
    badges: ["LLC vesting"],
  },
  {
    name: "Easy Street Capital",
    url: "https://easystreetcap.com",
    minDscr: 0.75,
    notes: "Sub-1.0 DSCR (no-ratio) up to 65% LTV.",
    badges: ["No-ratio program"],
  },
  {
    name: "Constitution Lending",
    url: "https://constitutionlending.com",
    minDscr: 1.0,
    notes: "Investor portfolios up to 10 doors.",
    badges: ["Portfolio loans"],
  },
];

export type ProjectStatus = "draft" | "active" | "paused" | "archived";

export type DealActionKind =
  | "saved"
  | "dismissed"
  | "contacted"
  | "offer_made";

export type SubscriptionTier = "free" | "pro";

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  default_tax_rate: number;
  default_dscr_min: number;
  subscription_tier: SubscriptionTier;
  subscription_renews_at: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectsRow = {
  id: string;
  owner_id: string;
  name: string;
  raw_prompt: string;
  status: ProjectStatus;
  constraints: unknown;
  last_scout_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DealsRow = {
  id: string;
  project_id: string;
  source: string;
  source_property_id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  photos: unknown;
  primary_image_url: string | null;
  source_url: string | null;
  mls_data: unknown;
  est_value: number | null;
  est_rent: number | null;
  hoa_monthly: number | null;
  days_on_market: number | null;
  /** Most recent list-price change in USD; negative = cut. */
  price_change: number | null;
  price_changed_at: string | null;
  /** Lot size in sqft (acres normalized at scout time). */
  lot_size: number | null;
  /** Effective property tax rate the deal was underwritten at (annual
   *  fraction of value, e.g. 0.0168 for TX). Actual Zillow rate when we
   *  have it, otherwise the state-level table in @papuc/core. */
  property_tax_rate: number | null;
  /** Comps-based expected ADR in USD/night (AirROI on-demand estimate). */
  str_adr: number | null;
  /** Comps-based expected annual occupancy, 0..1. */
  str_occupancy: number | null;
  /** Comps-based projected annual gross STR revenue in USD. */
  str_annual_revenue: number | null;
  /** {revenue, average_daily_rate, occupancy} x {avg,p25,p50,p75,p90}. */
  str_percentiles: unknown;
  /** 12 fractions summing to ~1 (monthly revenue distribution). */
  str_monthly_distribution: unknown;
  str_estimate_source: string | null;
  str_estimated_at: string | null;
  hud_fmr: unknown;
  last_refreshed_at: string;
  created_at: string;
};

export type DealScoresRow = {
  deal_id: string;
  project_id: string;
  dscr: number;
  dscr_lender_haircut: number | null;
  cash_on_cash: number | null;
  monthly_cashflow: number | null;
  irr_5yr: number | null;
  payout_years: number | null;
  score: number;
  /** Base-score breakdown, plus (STR only) the nightly-rate assumption
   *  the cashflow was underwritten at and where it came from. */
  score_components: {
    finance: number;
    opportunity: number;
    asset: number;
    /** STR: assumed ADR in USD/night at scout time. */
    adr?: number;
    /** STR: "airroi" (comps), "market_checked" (web-search-clamped
     *  heuristic), or "heuristic" (pure rent multiplier). */
    adrSource?: "airroi" | "market_checked" | "heuristic";
  } | null;
  rationale: string | null;
  computed_proforma: unknown;
  computed_at: string;
};

export type DealActionsRow = {
  id: string;
  deal_id: string;
  project_id: string;
  user_id: string;
  action: DealActionKind;
  note: string | null;
  created_at: string;
};

export type ScenariosRow = {
  id: string;
  deal_id: string;
  owner_id: string;
  name: string;
  notes: string | null;
  /** Full ProFormaState plus StrMatrixValue. The shape is opaque at the
   *  DB layer; the typed contract lives in `apps/web/lib/scenarios.ts`. */
  inputs: unknown;
  monthly_cashflow_at_save: number | null;
  created_at: string;
  updated_at: string;
};

export type ScoutRunsRow = {
  id: string;
  project_id: string;
  triggered_by: string | null;
  trigger_kind: string;
  started_at: string;
  finished_at: string | null;
  candidates_seen: number | null;
  deals_added: number | null;
  deals_scored: number | null;
  error: string | null;
};

export type StrRegulationStatus =
  | "permitted"
  | "restricted"
  | "banned"
  | "unclear";

export type MarketStrIntelRow = {
  id: string;
  /** Normalized "city, st" lower-case key. */
  market_key: string;
  city: string;
  state: string;
  adr_low: number | null;
  adr_median: number | null;
  adr_high: number | null;
  /** Average annual occupancy, 0..1. */
  occupancy_avg: number | null;
  seasonality_notes: string | null;
  regulation_status: StrRegulationStatus;
  regulation_summary: string | null;
  permit_required: boolean | null;
  /** [{ title, url }] — official permit/ordinance/tax pages. */
  resource_links: Array<{ title: string; url: string }>;
  /** URLs backing the ADR/occupancy figures. */
  sources: string[];
  researched_at: string;
  expires_at: string;
};

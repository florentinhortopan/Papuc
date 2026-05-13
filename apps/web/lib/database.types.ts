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

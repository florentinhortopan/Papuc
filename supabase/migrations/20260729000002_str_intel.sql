-- Short-term rental market intelligence + per-deal STR estimates.
--
-- market_str_intel: one row per US market (city+state), populated by a
-- Claude web-search research call (~$0.05/market). Caches a plausible
-- ADR range + occupancy for the market (used to sanity-check the scout's
-- rent-based ADR heuristic) and the market's STR regulation summary with
-- links to official permit/license resources. Rows expire and get
-- re-researched after a TTL instead of being deleted.

create table if not exists public.market_str_intel (
  id uuid primary key default uuid_generate_v4(),
  -- Normalized "city, st" lower-case key, e.g. "clearlake oaks, ca".
  market_key text not null unique,
  city text not null,
  state text not null,
  -- Plausible ADR range in USD/night for a typical entire home.
  adr_low numeric,
  adr_median numeric,
  adr_high numeric,
  -- Average annual occupancy, decimal fraction 0..1.
  occupancy_avg numeric,
  seasonality_notes text,
  regulation_status text not null default 'unclear'
    check (regulation_status in ('permitted', 'restricted', 'banned', 'unclear')),
  regulation_summary text,
  permit_required boolean,
  -- [{"title": "...", "url": "https://..."}] — official pages preferred.
  resource_links jsonb not null default '[]'::jsonb,
  -- URLs backing the ADR/occupancy figures.
  sources jsonb not null default '[]'::jsonb,
  researched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists market_str_intel_market_key_idx
  on public.market_str_intel(market_key);

alter table public.market_str_intel enable row level security;

-- Market intel is not user-specific: any authenticated user may read it.
-- Writes go through the service-role client (scout / research routes).
drop policy if exists market_str_intel_read on public.market_str_intel;
create policy market_str_intel_read on public.market_str_intel
  for select
  to authenticated
  using (true);

comment on table public.market_str_intel is
  'Per-market STR intel: web-search-backed ADR/occupancy reality check + '
  'regulation summary with official permit/license links. TTL via expires_at.';

-- Per-deal AirROI /calculator/estimate snapshot, fetched on demand from
-- the deal detail page ($0.20/call) and reused by subsequent scouts.
alter table public.deals
  add column if not exists str_adr numeric,
  add column if not exists str_occupancy numeric,
  add column if not exists str_annual_revenue numeric,
  add column if not exists str_percentiles jsonb,
  add column if not exists str_monthly_distribution jsonb,
  add column if not exists str_estimate_source text,
  add column if not exists str_estimated_at timestamptz;

comment on column public.deals.str_adr is
  'Comps-based expected Average Daily Rate in USD/night (AirROI estimate).';
comment on column public.deals.str_occupancy is
  'Comps-based expected annual occupancy, decimal fraction 0..1.';
comment on column public.deals.str_annual_revenue is
  'Comps-based projected annual gross STR revenue in USD.';
comment on column public.deals.str_percentiles is
  'Full percentile breakdown {revenue, average_daily_rate, occupancy} x {avg,p25,p50,p75,p90}.';
comment on column public.deals.str_monthly_distribution is
  '12 fractions summing to ~1: how annual revenue distributes across months.';
comment on column public.deals.str_estimate_source is
  'Provider of the estimate, e.g. ''airroi''.';

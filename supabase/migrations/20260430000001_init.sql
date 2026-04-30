-- Papuc initial schema

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================
-- profiles
-- =============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  default_tax_rate numeric(5,4) default 0.30 check (default_tax_rate >= 0 and default_tax_rate <= 1),
  default_dscr_min numeric(4,2) default 1.10 check (default_dscr_min >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- projects
-- =============================================================
create type public.project_status as enum ('draft', 'active', 'paused', 'archived');

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  raw_prompt text not null,
  status public.project_status not null default 'draft',
  constraints jsonb not null,
  last_scout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_status_idx on public.projects(status);

-- =============================================================
-- deals (per-project candidate properties)
-- =============================================================
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null default 'realestateapi',
  source_property_id text not null,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  price numeric(14,2),
  beds numeric(4,1),
  baths numeric(4,1),
  sqft numeric(10,1),
  photos jsonb,
  primary_image_url text,
  mls_data jsonb,
  est_value numeric(14,2),
  est_rent numeric(12,2),
  hud_fmr jsonb,
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, source, source_property_id)
);

create index if not exists deals_project_idx on public.deals(project_id);
create index if not exists deals_price_idx on public.deals(price);
create index if not exists deals_refreshed_idx on public.deals(last_refreshed_at desc);

-- =============================================================
-- deal_scores
-- =============================================================
create table if not exists public.deal_scores (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  dscr numeric(6,3) not null,
  dscr_lender_haircut numeric(6,3),
  cash_on_cash numeric(7,4),
  monthly_cashflow numeric(12,2),
  irr_5yr numeric(7,4),
  payout_years numeric(8,2),
  score smallint not null check (score between 0 and 100),
  rationale text,
  computed_proforma jsonb not null,
  computed_at timestamptz not null default now()
);

create index if not exists deal_scores_project_idx on public.deal_scores(project_id);
create index if not exists deal_scores_score_idx on public.deal_scores(score desc);

-- =============================================================
-- deal_actions
-- =============================================================
create type public.deal_action_kind as enum ('saved', 'dismissed', 'contacted', 'offer_made');

create table if not exists public.deal_actions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action public.deal_action_kind not null,
  note text,
  created_at timestamptz not null default now(),
  unique (deal_id, user_id, action)
);

create index if not exists deal_actions_user_idx on public.deal_actions(user_id);
create index if not exists deal_actions_project_idx on public.deal_actions(project_id);

-- =============================================================
-- scout_runs
-- =============================================================
create table if not exists public.scout_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  triggered_by uuid references auth.users(id) on delete set null,
  trigger_kind text not null default 'manual', -- 'manual' | 'cron'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  candidates_seen integer default 0,
  deals_added integer default 0,
  deals_scored integer default 0,
  error text
);

create index if not exists scout_runs_project_idx on public.scout_runs(project_id, started_at desc);

-- =============================================================
-- updated_at triggers
-- =============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

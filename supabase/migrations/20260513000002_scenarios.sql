-- Saved pro-forma scenarios for a deal. The deal-detail UI lets a user
-- tune sliders + inputs and persist the full snapshot (including the STR
-- monthly matrix) so they can compare alternatives over multiple sessions
-- without losing work.
--
-- The whole input shape is stored as JSONB rather than a wide row of
-- typed columns so the schema stays forward-compatible with future
-- additions to the pro-forma (rehab, ARV, etc.) — every new field just
-- shows up in the JSON when present and is ignored when absent.

create table if not exists public.scenarios (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  -- Denormalized owner_id so the RLS policy can do a single-table check
  -- and so cascading deletes from auth.users wipe scenarios too.
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  notes text,
  -- Full pro-forma state + STR matrix as the UI persists it. See
  -- `apps/web/lib/scenarios.ts` for the typed contract.
  inputs jsonb not null,
  -- Headline metric captured at save time so the picker can preview each
  -- scenario without recomputing the whole pro-forma.
  monthly_cashflow_at_save numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenarios_deal_id_idx
  on public.scenarios(deal_id);

create index if not exists scenarios_owner_id_idx
  on public.scenarios(owner_id);

-- Keep updated_at honest.
create or replace function public.touch_scenario_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scenarios_touch_updated_at on public.scenarios;
create trigger scenarios_touch_updated_at
  before update on public.scenarios
  for each row
  execute function public.touch_scenario_updated_at();

alter table public.scenarios enable row level security;

-- Owner-only policy. Matches the project-owner gate used by `deals` etc.
-- The denormalized owner_id lets the policy check a single column,
-- avoiding a join through deals → projects on every read.
drop policy if exists scenarios_owner_all on public.scenarios;
create policy scenarios_owner_all on public.scenarios
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on table public.scenarios is
  'Saved pro-forma scenarios for a deal. The deal-detail page''s sliders, '
  'inputs, and STR matrix all serialize into the inputs JSONB.';
comment on column public.scenarios.inputs is
  'Full ProFormaState plus StrMatrixValue, opaque JSON the UI re-hydrates.';

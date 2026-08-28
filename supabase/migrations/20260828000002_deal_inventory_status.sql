-- Soft-archive inventory for substitute re-scout. Rows are never deleted;
-- inventory_status flips live ↔ archived so historical deals stay searchable.

do $$ begin
  create type public.deal_inventory_status as enum ('live', 'archived');
exception
  when duplicate_object then null;
end $$;

alter table public.deals
  add column if not exists inventory_status public.deal_inventory_status
    not null default 'live';

alter table public.deals
  add column if not exists archived_at timestamptz;

alter table public.deals
  add column if not exists archived_by_scout_run_id uuid
    references public.scout_runs(id) on delete set null;

comment on column public.deals.inventory_status is
  'live = shown on project default grid / Discover; archived = kept for search and intelligence after substitute re-scout.';

comment on column public.deals.archived_at is
  'When the deal was soft-archived (substitute re-scout). Null while live.';

comment on column public.deals.archived_by_scout_run_id is
  'Scout run that archived this deal during substitute mode.';

create index if not exists deals_project_inventory_idx
  on public.deals (project_id, inventory_status);

alter table public.scout_runs
  add column if not exists mode text;

do $$ begin
  alter table public.scout_runs
    add constraint scout_runs_mode_check
    check (mode is null or mode in ('append', 'substitute'));
exception
  when duplicate_object then null;
end $$;

comment on column public.scout_runs.mode is
  'append = skip known listings; substitute = archive live then refresh. Null for legacy runs.';

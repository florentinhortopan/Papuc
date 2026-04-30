-- Row-level security: every row owner-scoped via owner_id / project owner.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.deals enable row level security;
alter table public.deal_scores enable row level security;
alter table public.deal_actions enable row level security;
alter table public.scout_runs enable row level security;

-- profiles: a user can only read/update their own profile
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_self_upsert on public.profiles;
create policy profiles_self_upsert on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id);

-- projects: owner-only
drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all on public.projects
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- deals: any user who owns the parent project can read/write
drop policy if exists deals_owner_all on public.deals;
create policy deals_owner_all on public.deals
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = deals.project_id and p.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.projects p
      where p.id = deals.project_id and p.owner_id = auth.uid()
    )
  );

-- deal_scores: same gate as deals
drop policy if exists deal_scores_owner_all on public.deal_scores;
create policy deal_scores_owner_all on public.deal_scores
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = deal_scores.project_id and p.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.projects p
      where p.id = deal_scores.project_id and p.owner_id = auth.uid()
    )
  );

-- deal_actions: user owns row directly
drop policy if exists deal_actions_self_all on public.deal_actions;
create policy deal_actions_self_all on public.deal_actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- scout_runs: project owner read; service role writes (Edge Functions use service role)
drop policy if exists scout_runs_owner_select on public.scout_runs;
create policy scout_runs_owner_select on public.scout_runs
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = scout_runs.project_id and p.owner_id = auth.uid()
    )
  );

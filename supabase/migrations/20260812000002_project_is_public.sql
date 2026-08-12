-- Opt-in: when true, a project's deals appear on the shared Papuc home feed
-- and are readable by any signed-in user (writes stay owner-only).
alter table public.projects
  add column if not exists is_public boolean not null default false;

comment on column public.projects.is_public is
  'When true, deals in this project are visible on the Papuc home feed to all signed-in users.';

create index if not exists projects_is_public_idx
  on public.projects (id)
  where is_public = true;

-- Split owner-only "for all" into SELECT (owner OR public) + write (owner).
drop policy if exists projects_owner_all on public.projects;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
    auth.uid() = owner_id
    or is_public = true
  );

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (auth.uid() = owner_id);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (auth.uid() = owner_id);

-- Deals: readable if parent project is owned or public; writes owner-only.
drop policy if exists deals_owner_all on public.deals;

drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = deals.project_id
        and (p.owner_id = auth.uid() or p.is_public = true)
    )
  );

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = deals.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals
  for update using (
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

drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = deals.project_id and p.owner_id = auth.uid()
    )
  );

-- Deal scores: same gate as deals.
drop policy if exists deal_scores_owner_all on public.deal_scores;

drop policy if exists deal_scores_select on public.deal_scores;
create policy deal_scores_select on public.deal_scores
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = deal_scores.project_id
        and (p.owner_id = auth.uid() or p.is_public = true)
    )
  );

drop policy if exists deal_scores_insert on public.deal_scores;
create policy deal_scores_insert on public.deal_scores
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = deal_scores.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists deal_scores_update on public.deal_scores;
create policy deal_scores_update on public.deal_scores
  for update using (
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

drop policy if exists deal_scores_delete on public.deal_scores;
create policy deal_scores_delete on public.deal_scores
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = deal_scores.project_id and p.owner_id = auth.uid()
    )
  );

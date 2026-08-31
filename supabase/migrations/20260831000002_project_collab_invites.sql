-- Project co-scout invites (project_members Phase 3).
-- Invite token on projects; members can read private projects and edit as role=member.

alter table public.projects
  add column if not exists collab_invite_token text;

comment on column public.projects.collab_invite_token is
  'Unguessable token for /invite/[token]. Null until Pro owner mints a collab link.';

create unique index if not exists projects_collab_invite_token_uidx
  on public.projects (collab_invite_token)
  where collab_invite_token is not null;

comment on table public.project_members is
  'Collab roster. Roles: owner (unused row; projects.owner_id is source of truth) | member (scout+actions) | viewer (read).';

-- Avoid RLS recursion when policies reference project_members ↔ projects.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_editor(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = auth.uid()
      and m.role = 'member'
  );
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.is_project_editor(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_editor(uuid) to authenticated;

-- Projects: members can read (incl. private).
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
    auth.uid() = owner_id
    or is_public = true
    or public.is_project_member(id)
  );

-- Deals / scores: read for members; write for editors (owner + member role).
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = deals.project_id
        and (
          p.owner_id = auth.uid()
          or p.is_public = true
          or public.is_project_member(p.id)
        )
    )
  );

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert with check (public.is_project_editor(project_id));

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals
  for update using (public.is_project_editor(project_id))
  with check (public.is_project_editor(project_id));

drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals
  for delete using (public.is_project_editor(project_id));

drop policy if exists deal_scores_select on public.deal_scores;
create policy deal_scores_select on public.deal_scores
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = deal_scores.project_id
        and (
          p.owner_id = auth.uid()
          or p.is_public = true
          or public.is_project_member(p.id)
        )
    )
  );

drop policy if exists deal_scores_insert on public.deal_scores;
create policy deal_scores_insert on public.deal_scores
  for insert with check (public.is_project_editor(project_id));

drop policy if exists deal_scores_update on public.deal_scores;
create policy deal_scores_update on public.deal_scores
  for update using (public.is_project_editor(project_id))
  with check (public.is_project_editor(project_id));

drop policy if exists deal_scores_delete on public.deal_scores;
create policy deal_scores_delete on public.deal_scores
  for delete using (public.is_project_editor(project_id));

-- Scout runs readable by editors (members need to see run history).
drop policy if exists scout_runs_owner_select on public.scout_runs;
create policy scout_runs_editor_select on public.scout_runs
  for select using (public.is_project_editor(project_id));

-- Members list: owner manage delete; self leave; inserts via service role API.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (
          p.owner_id = auth.uid()
          or p.is_public = true
          or public.is_project_member(p.id)
        )
    )
  );

drop policy if exists project_members_owner_delete on public.project_members;
create policy project_members_owner_delete on public.project_members
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and p.owner_id = auth.uid()
    )
    or auth.uid() = user_id
  );

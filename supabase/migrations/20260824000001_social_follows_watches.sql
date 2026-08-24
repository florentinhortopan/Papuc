-- Social investing v1: follow users, watch public projects, public profiles,
-- scout-like-this attribution. Soft-prep project_members for Phase 3 collab.

-- =============================================================
-- user_follows (asymmetric Twitter-style follow)
-- =============================================================
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_no_self check (follower_id <> following_id)
);

create index if not exists user_follows_following_idx
  on public.user_follows (following_id);

comment on table public.user_follows is
  'Asymmetric follow graph. Friends feed = public deals from followed owners.';

alter table public.user_follows enable row level security;

drop policy if exists user_follows_select on public.user_follows;
create policy user_follows_select on public.user_follows
  for select using (
    auth.uid() = follower_id
    or auth.uid() = following_id
  );

drop policy if exists user_follows_insert on public.user_follows;
create policy user_follows_insert on public.user_follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists user_follows_delete on public.user_follows;
create policy user_follows_delete on public.user_follows
  for delete using (auth.uid() = follower_id);

-- =============================================================
-- project_watches (join/exit = watch/unwatch; no co-edit)
-- =============================================================
create table if not exists public.project_watches (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists project_watches_project_idx
  on public.project_watches (project_id);

comment on table public.project_watches is
  'User watches a project for Friends feed. Does not grant scout/edit rights.';

alter table public.project_watches enable row level security;

drop policy if exists project_watches_select on public.project_watches;
create policy project_watches_select on public.project_watches
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.projects p
      where p.id = project_watches.project_id
        and (p.owner_id = auth.uid() or p.is_public = true)
    )
  );

drop policy if exists project_watches_insert on public.project_watches;
create policy project_watches_insert on public.project_watches
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_watches.project_id
        and p.is_public = true
        and p.owner_id <> auth.uid()
    )
  );

drop policy if exists project_watches_delete on public.project_watches;
create policy project_watches_delete on public.project_watches
  for delete using (auth.uid() = user_id);

-- =============================================================
-- Scout like this attribution on projects
-- =============================================================
alter table public.projects
  add column if not exists source_deal_id uuid references public.deals(id) on delete set null;

alter table public.projects
  add column if not exists source_project_id uuid references public.projects(id) on delete set null;

comment on column public.projects.source_deal_id is
  'Deal that inspired this project via Scout like this (nullable).';
comment on column public.projects.source_project_id is
  'Source project when forked via Scout like this (nullable).';

-- =============================================================
-- Public profile read path (authenticated; never email)
-- =============================================================
-- Keep profiles SELECT self-only (email + prefs stay private). Expose a
-- narrow view owned by the migration role so RLS on profiles is bypassed
-- only for these identity columns.
create or replace view public.public_profiles as
select
  id,
  display_name,
  subscription_tier,
  created_at
from public.profiles;

comment on view public.public_profiles is
  'Safe identity fields for Follow / investor profile. Never includes email.';

grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;

-- =============================================================
-- project_members — Phase 3 soft prep (roles documented; no join UI yet)
-- =============================================================
-- Roles:
--   owner  — project creator; admin (toggle public, delete, manage members)
--   member — can scout and write deal_actions in the project (Phase 3)
--   viewer — reserved; read-only beyond public project access
-- v1 does not auto-insert owner rows; Watch covers engagement until Phase 3.

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx
  on public.project_members (user_id);

comment on table public.project_members is
  'Phase 3 collab. Roles: owner | member | viewer. v1 unused — use project_watches for engagement.';
comment on column public.project_members.role is
  'owner=admin; member=scout+actions (Phase 3); viewer=reserved read-only.';

alter table public.project_members enable row level security;

-- Read: self membership, project owner, or public project member list.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (p.owner_id = auth.uid() or p.is_public = true)
    )
  );

-- Writes deferred to Phase 3 (service/owner policies). No insert/update/delete
-- for authenticated users yet — prevents premature co-edit via this table.

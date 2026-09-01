-- Repair public_profiles after avatar rollout.
--
-- Postgres CREATE OR REPLACE VIEW cannot insert a column in the middle of an
-- existing view (it treats that as renaming subscription_tier → avatar_url).
-- Manual/apply of 20260831000003 could leave avatar_url on profiles while the
-- view still lacked it — PostgREST then 400s on `select=…,avatar_url,…`, which
-- crashes deal / project pages that load owner profiles.

alter table public.profiles
  add column if not exists avatar_url text;

drop view if exists public.public_profiles;

create view public.public_profiles
with (security_invoker = false)
as
select
  id,
  display_name,
  subscription_tier,
  created_at,
  avatar_url
from public.profiles;

comment on view public.public_profiles is
  'Safe identity fields for Follow / investor profile. Never includes email. security_invoker=false so RLS on profiles does not hide other investors.';

grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;

-- Ensure public avatars bucket exists (idempotent with prior migration).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Refresh PostgREST schema cache so `avatar_url` is visible immediately.
notify pgrst, 'reload schema';

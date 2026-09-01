-- Profile photos for social surfaces. Falls back to Papuc mark in the UI
-- when avatar_url is null.

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public HTTPS URL for the investor avatar (storage public URL). Null = use Papuc mark.';

create or replace view public.public_profiles
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

-- Public avatar bucket: path `{user_id}/avatar.{ext}`
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

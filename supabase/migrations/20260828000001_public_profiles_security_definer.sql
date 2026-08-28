-- public_profiles must be visible to any authenticated user (Follow / Friends).
-- Under security_invoker=true, underlying profiles RLS (self-only) makes other
-- investors' rows invisible → /u/[id] 404s and Follow never appears.
create or replace view public.public_profiles
with (security_invoker = false)
as
select
  id,
  display_name,
  subscription_tier,
  created_at
from public.profiles;

comment on view public.public_profiles is
  'Safe identity fields for Follow / investor profile. Never includes email. security_invoker=false so RLS on profiles does not hide other investors.';

grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;

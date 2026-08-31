-- Track clickwrap acceptance of Terms + Privacy + Acceptable Use.
-- Bump apps/web/lib/legal.ts LEGAL_VERSION when docs change; users re-accept.

alter table public.profiles
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists legal_version text;

comment on column public.profiles.legal_accepted_at is
  'When the user last accepted the current Papuc legal pack (ToS, Privacy, AUP).';
comment on column public.profiles.legal_version is
  'LEGAL_VERSION string from the web app at time of acceptance.';

-- public_profiles view must stay email-free; recreate if it selects *.
-- Keep existing narrow projection (id, display_name, subscription_tier, created_at).

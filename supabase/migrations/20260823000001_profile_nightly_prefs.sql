-- Account-level Pro controls for nightly scouting + digest email.
-- Per-project nightly_scout_enabled still applies when account is not paused.

alter table public.profiles
  add column if not exists nightly_scouts_paused boolean not null default false;

alter table public.profiles
  add column if not exists email_digests_enabled boolean not null default true;

comment on column public.profiles.nightly_scouts_paused is
  'When true, Vercel nightly cron skips all scheduled scouts for this owner (Pro comfort pause).';

comment on column public.profiles.email_digests_enabled is
  'When false, nightly scout may still run but Resend digests are not sent.';

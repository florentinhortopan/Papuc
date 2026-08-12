-- Per-project opt-in for Pro nightly (scheduled) scouting.
-- Cron still requires profiles.subscription_tier = 'pro'; free owners are skipped.
alter table public.projects
  add column if not exists nightly_scout_enabled boolean not null default true;

comment on column public.projects.nightly_scout_enabled is
  'When true and owner is Pro, Vercel nightly cron runs scheduled scout for this project.';

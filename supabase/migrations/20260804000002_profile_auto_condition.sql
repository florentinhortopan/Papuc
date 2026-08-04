-- Prefer Catch the catch (photo condition analysis) to run automatically
-- when a deal page is opened. Cached complete estimates are never re-run
-- unless the user hits Refresh. Default on for existing and new profiles.
alter table public.profiles
  add column if not exists auto_condition_analysis boolean not null default true;

comment on column public.profiles.auto_condition_analysis is
  'When true, opening a deal page auto-starts Catch the catch if no cached complete estimate exists.';

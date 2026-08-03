-- On-demand listing-photo condition / rehab estimate (Claude vision).
-- Fetched only when the user clicks "Analyze photos" on deal detail;
-- cached on the deal row so repeat views are free. Refresh re-runs the
-- paid vision call. See apps/web/app/api/deals/[id]/condition-estimate.

alter table public.deals
  add column if not exists condition_findings jsonb,
  add column if not exists condition_summary text,
  add column if not exists condition_rehab_low numeric,
  add column if not exists condition_rehab_high numeric,
  add column if not exists condition_rehab_suggested numeric,
  add column if not exists condition_maintenance_monthly_suggested numeric,
  add column if not exists condition_overall text,
  add column if not exists condition_photo_count int,
  add column if not exists condition_model text,
  add column if not exists condition_disclaimer text,
  add column if not exists condition_estimated_at timestamptz;

comment on column public.deals.condition_findings is
  'Structured photo-condition findings from Claude vision (severity, cost bucket, confidence).';
comment on column public.deals.condition_summary is
  'Short plain-English overall condition summary from photo analysis.';
comment on column public.deals.condition_rehab_low is
  'Low-end suggested one-time rehab / improvements total in USD.';
comment on column public.deals.condition_rehab_high is
  'High-end suggested one-time rehab / improvements total in USD.';
comment on column public.deals.condition_rehab_suggested is
  'Midpoint (or best-guess) one-time rehab to seed pro-forma improvements.';
comment on column public.deals.condition_maintenance_monthly_suggested is
  'Suggested ongoing maintenance + CapEx reserve $/mo from photo analysis.';
comment on column public.deals.condition_overall is
  'turnkey | light_cosmetic | moderate_rehab | heavy_rehab | unknown';
comment on column public.deals.condition_photo_count is
  'Number of listing photo URLs sent to the vision model.';
comment on column public.deals.condition_model is
  'Anthropic model id used for the analysis.';
comment on column public.deals.condition_disclaimer is
  'Stored disclaimer shown with the estimate (listing photos ≠ inspection).';
comment on column public.deals.condition_estimated_at is
  'When the photo condition estimate was last computed.';

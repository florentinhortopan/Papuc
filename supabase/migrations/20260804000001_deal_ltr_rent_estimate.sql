-- Per-deal LTR rent comps snapshot from HasData/Zillow forRent search,
-- fetched on demand from the deal detail page and reused on subsequent opens.
alter table public.deals
  add column if not exists ltr_rent_median numeric,
  add column if not exists ltr_rent_p25 numeric,
  add column if not exists ltr_rent_p75 numeric,
  add column if not exists ltr_comp_count integer,
  add column if not exists ltr_estimate_source text,
  add column if not exists ltr_estimated_at timestamptz;

comment on column public.deals.ltr_rent_median is
  'Median monthly rent in USD from comparable Zillow for-rent listings (HasData).';
comment on column public.deals.ltr_rent_p25 is
  '25th-percentile monthly rent in USD from the same for-rent comps.';
comment on column public.deals.ltr_rent_p75 is
  '75th-percentile monthly rent in USD from the same for-rent comps.';
comment on column public.deals.ltr_comp_count is
  'Number of for-rent comps used to compute the LTR rent estimate.';
comment on column public.deals.ltr_estimate_source is
  'Provider of the estimate, e.g. ''hasdata_for_rent''.';
comment on column public.deals.ltr_estimated_at is
  'When the LTR rent comps estimate was last fetched.';

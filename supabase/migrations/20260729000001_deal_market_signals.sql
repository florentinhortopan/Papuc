-- Market-signal columns for "best property" ranking.
-- All values come free on the HasData Zillow listing response; until now
-- they were buried inside deals.mls_data and never scored or displayed.

alter table public.deals
  add column if not exists days_on_market integer,
  add column if not exists price_change numeric,
  add column if not exists price_changed_at timestamptz,
  add column if not exists lot_size numeric;

comment on column public.deals.days_on_market is
  'Days on market at last scout (Zillow daysOnZillow).';
comment on column public.deals.price_change is
  'Most recent list-price change in USD; negative = price cut.';
comment on column public.deals.price_changed_at is
  'Timestamp of the most recent list-price change.';
comment on column public.deals.lot_size is
  'Lot size normalized to square feet (acres converted at 43,560).';

-- Per-bucket base-score breakdown: {"finance": n, "opportunity": n, "asset": n}
alter table public.deal_scores
  add column if not exists score_components jsonb;

comment on column public.deal_scores.score_components is
  'Base-score breakdown by bucket: finance (0-60), opportunity (0-25), asset (-5-15).';

-- Capture monthly HOA fees when the provider returns them. Zillow listings
-- sometimes carry monthlyHoaFee directly; otherwise it comes back from the
-- Zillow Property API when we lazy-load on first deal open.
--
-- Nullable: many properties have no HOA, and we treat null vs 0 differently
-- in the UI ("unknown" vs "confirmed zero").
alter table public.deals
  add column if not exists hoa_monthly numeric(10, 2);

comment on column public.deals.hoa_monthly is
  'Monthly HOA fee in USD. Null when the data provider did not return one '
  'for this property (often because there is no HOA, or the listing did '
  'not include it). Falls into the pro-forma PITIA when present.';

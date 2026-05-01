-- Add a canonical "view source" link per deal so users can jump to the
-- listing page on the data provider (Zillow, Redfin, MLS, etc.).
-- Nullable for backwards compatibility with rows scouted before HasData.
alter table public.deals
  add column if not exists source_url text;

comment on column public.deals.source_url is
  'Canonical URL on the source provider (e.g. zillow.com/homedetails/...). '
  'Null when the provider did not return a deep link; the UI will fall back '
  'to a Zillow address-search URL derived from the address fields.';

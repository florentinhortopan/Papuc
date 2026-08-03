-- Persist the effective property tax rate the scout underwrote each deal
-- at (annual fraction of value, e.g. 0.0223 for NJ). Sourced from the
-- listing's actual Zillow propertyTaxRate when available, otherwise the
-- state-level effective-rate table in @papuc/core. The deal-detail page
-- seeds its pro-forma from this column so the card and the page agree.
alter table public.deals
  add column if not exists property_tax_rate numeric;

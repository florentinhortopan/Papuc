-- Subscription tiering on profiles.

create type public.subscription_tier as enum ('free', 'pro');

alter table public.profiles
  add column if not exists subscription_tier public.subscription_tier not null default 'free',
  add column if not exists subscription_renews_at timestamptz,
  add column if not exists onboarded_at timestamptz;

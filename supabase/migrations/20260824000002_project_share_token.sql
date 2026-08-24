-- Public project share links (same pattern as deals.share_token).
-- Possession of the token authorizes the anonymous /share/p/[token] page.
alter table public.projects
  add column if not exists share_token text unique;

create index if not exists projects_share_token_idx
  on public.projects (share_token)
  where share_token is not null;

-- Public share links: an unguessable token minted the first time a deal
-- is shared. The public /share/[token] page is served with the service
-- role (RLS still blocks anon reads of deals), so possession of the
-- token IS the authorization — deals never shared have no token at all.
alter table public.deals
  add column if not exists share_token text unique;

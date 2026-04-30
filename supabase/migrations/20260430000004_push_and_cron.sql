-- Push tokens + nightly scout cron.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_self_all on public.device_tokens;
create policy device_tokens_self_all on public.device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- pg_cron + pg_net for scheduled background scout
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule a nightly call to the nightly-scout Edge Function.
-- We resolve the URL + service-role key via Vault secrets at runtime.
create or replace function public.trigger_nightly_scout()
returns void
language plpgsql
security definer
as $$
declare
  fn_url text;
  service_role_key text;
begin
  begin
    select decrypted_secret into fn_url
    from vault.decrypted_secrets
    where name = 'edge_functions_url';
  exception when others then
    fn_url := null;
  end;

  begin
    select decrypted_secret into service_role_key
    from vault.decrypted_secrets
    where name = 'edge_functions_service_role_key';
  exception when others then
    service_role_key := null;
  end;

  if fn_url is null or service_role_key is null then
    raise notice 'edge_functions_url or edge_functions_service_role_key not set in Supabase Vault — skipping nightly scout';
    return;
  end if;

  perform net.http_post(
    url := fn_url || '/nightly-scout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Schedule daily at 06:00 UTC. Update via select cron.unschedule(...) + cron.schedule(...) if needed.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'papuc_nightly_scout') then
    perform cron.schedule(
      'papuc_nightly_scout',
      '0 6 * * *',
      $cron$ select public.trigger_nightly_scout(); $cron$
    );
  end if;
end;
$$;

-- Multi-batch photo condition analysis progress. Each serverless
-- invocation processes CONDITION_PHOTO_BATCH_SIZE photos; the client
-- continues until status = 'complete'. Cursor is the next gallery index.
alter table public.deals
  add column if not exists condition_status text,
  add column if not exists condition_photos_total int,
  add column if not exists condition_cursor int;

comment on column public.deals.condition_status is
  'Photo analysis progress: running | complete | null (never started).';
comment on column public.deals.condition_photos_total is
  'Total listing photo URLs in the gallery being analyzed.';
comment on column public.deals.condition_cursor is
  'Next 0-based photo index to send to vision (batch progress).';

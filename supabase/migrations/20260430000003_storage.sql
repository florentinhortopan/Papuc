-- Storage bucket for cached MLS photos (signed URLs only; not public).
insert into storage.buckets (id, name, public)
values ('deal-photos', 'deal-photos', false)
on conflict (id) do nothing;

drop policy if exists deal_photos_owner_read on storage.objects;
create policy deal_photos_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deal-photos'
    and exists (
      select 1
      from public.deals d
      join public.projects p on p.id = d.project_id
      where p.owner_id = auth.uid()
        and (storage.foldername(name))[1] = d.id::text
    )
  );

drop policy if exists deal_photos_service_write on storage.objects;
create policy deal_photos_service_write on storage.objects
  for insert to service_role
  with check (bucket_id = 'deal-photos');

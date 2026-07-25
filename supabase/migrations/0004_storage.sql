-- Photo storage.
--
-- The bucket is private; the app reads through signed URLs. Object paths are
-- always '{author_id}/{uuid}.jpg', so the owner is the first path segment and
-- the same friendship rule that guards the posts table can guard the bytes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or
      public.are_friends((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    )
  );

create policy photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

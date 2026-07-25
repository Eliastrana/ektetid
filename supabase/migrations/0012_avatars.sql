-- Profile pictures.
--
-- A separate bucket from `photos`, because the two have opposite visibility
-- requirements. Post photos are friends-only, enforced by are_friends() on the
-- object path. An avatar has to be visible to people who are *not* friends —
-- otherwise friend search shows a list of blank circles, which is precisely
-- when you most need to recognise someone.
--
-- The bucket is public read. That is a deliberate trade: an avatar is
-- low-stakes compared with the albums, and making it public means URLs are
-- stable and cacheable, so a list of thirty search results does not need
-- thirty signed URLs. Writes remain restricted to your own folder.
--
-- Paths are '{user_id}/avatar.jpg' and uploaded with upsert, so replacing a
-- picture overwrites in place rather than accumulating orphans. Cache busting
-- is handled by a version query parameter on the stored URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

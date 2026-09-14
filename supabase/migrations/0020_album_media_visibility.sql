-- Make stored media inherit visibility from its album.
--
-- Post rows have always used can_see_album(album_id), so a friend of any
-- collaborator can read every post in a shared album. Storage was narrower:
-- it only considered the uploader's direct friends and co-members. That left
-- a viewer able to read an album row while photos uploaded by other members
-- appeared missing.

create index posts_image_path_idx on public.posts (image_path);
create index posts_selfie_path_idx on public.posts (selfie_path)
  where selfie_path is not null;
create index posts_video_path_idx on public.posts (video_path)
  where video_path is not null;

create or replace function public.can_see_album_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.posts p
    where (
      p.image_path = object_name or
      p.selfie_path = object_name or
      p.video_path = object_name
    )
      and public.can_see_album(p.album_id)
  );
$$;

grant execute on function public.can_see_album_media to authenticated;
revoke all on function public.can_see_album_media from anon;

drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos' and (
      -- Keep the uploader's access before create_post() links the object to an
      -- album. Everyone else must be able to see an album containing it.
      (storage.foldername(name))[1] = (select auth.uid())::text or
      public.can_see_album_media(name)
    )
  );

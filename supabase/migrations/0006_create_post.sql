-- create_post()
--
-- posts.position is NOT NULL and filled by a trigger, which the type generator
-- cannot see — it emits `position: number` as required on insert. Rather than
-- lie to the types or make clients guess an ordering, publishing goes through
-- this function.
--
-- Deliberately SECURITY INVOKER (the default): the insert still runs as the
-- caller, so the posts_insert policy decides whether it is allowed.

create or replace function public.create_post(
  p_album_id    uuid,
  p_image_path  text,
  p_selfie_path text default null,
  p_title       text default null,
  p_description text default null,
  p_location    text default null,
  p_taken_at    timestamptz default now(),
  p_exif        jsonb default null,
  p_blurhash    text default null,
  p_luminance   real default null
)
returns public.posts
language plpgsql
set search_path = public, pg_temp
as $$
declare
  created public.posts;
begin
  insert into public.posts (
    album_id, author_id, image_path, selfie_path, title,
    description, location, taken_at, exif, blurhash, luminance,
    position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    coalesce((select max(p.position) from public.posts p where p.album_id = p_album_id), -1) + 1
  )
  returning * into created;

  return created;
end;
$$;

grant execute on function public.create_post to authenticated;

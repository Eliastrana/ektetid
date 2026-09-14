-- Video posts.
--
-- A video is stored alongside the photo, not instead of it: `image_path` keeps
-- holding a still, extracted from the video's first frame at publish time. That
-- one decision means the album grid, the map pins, the blurhash placeholder,
-- the luminance and the notification payloads all keep working untouched — a
-- video post is an ordinary post that happens to have something extra to play.

alter table public.posts
  add column video_path text;

comment on column public.posts.video_path is
  'Storage path of the clip, when the post is a video. image_path always holds a still, so every surface that only wants a picture keeps working.';

/*
 * The bucket rejected video outright.
 *
 * allowed_mime_types listed only the three image types, so an upload would
 * have failed at the storage layer no matter what the app sent. The size cap
 * goes up as well: ten seconds of 720p lands well past the 15 MB that was
 * enough for a still.
 */
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp',
         'video/mp4', 'video/quicktime'
       ],
       file_size_limit = 52428800
 where id = 'photos';

-- Postgres will not add parameters to an existing function signature.
drop function if exists public.create_post(
  uuid, text, text, text, text, text, timestamptz, jsonb, text, real,
  double precision, double precision
);

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
  p_luminance   real default null,
  p_latitude    double precision default null,
  p_longitude   double precision default null,
  p_video_path  text default null
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
    latitude, longitude, video_path, position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    p_latitude, p_longitude, p_video_path,
    coalesce((select max(p.position) from public.posts p where p.album_id = p_album_id), -1) + 1
  )
  returning * into created;

  return created;
end;
$$;

grant execute on function public.create_post to authenticated;
revoke all on function public.create_post from anon;

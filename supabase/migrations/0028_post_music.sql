-- ---------------------------------------------------------------------------
-- Music on a post
--
-- A thirty-second snippet that plays when the photo is opened. The audio is
-- Apple's own preview file, fetched from the iTunes Search API and referenced
-- by URL rather than copied into Storage — we have no licence to host it, and
-- linking is the whole basis on which those previews are published.
--
-- The track id is kept alongside the URL because a preview URL is Apple's to
-- change: with the id, a broken snippet can be re-resolved by a lookup rather
-- than being lost. Title, artist and artwork are denormalised so the album can
-- name what is playing without a network round-trip per post.
-- ---------------------------------------------------------------------------

alter table public.posts
  add column music_track_id    bigint,
  add column music_title       text,
  add column music_artist      text,
  add column music_artwork_url text,
  add column music_preview_url text;

-- Something to play is only useful with something to call it: the album shows
-- the title and artist as the indicator that sound is available at all.
alter table public.posts
  add constraint music_is_named check (
    music_preview_url is null
    or (music_title is not null and music_artist is not null)
  );

-- ---------------------------------------------------------------------------
-- create_post() gains the music arguments.
--
-- Recreated rather than altered, as in 0013, 0017 and 0021: Postgres cannot add
-- a parameter to an existing function, and the old signature has to be dropped
-- explicitly or both overloads would live side by side and every call would be
-- ambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.create_post(
  uuid, text, text, text, text, text, timestamptz, jsonb, text, real,
  double precision, double precision, text, text, smallint, text
);

create or replace function public.create_post(
  p_album_id         uuid,
  p_image_path       text,
  p_selfie_path      text default null,
  p_title            text default null,
  p_description      text default null,
  p_location         text default null,
  p_taken_at         timestamptz default now(),
  p_exif             jsonb default null,
  p_blurhash         text default null,
  p_luminance        real default null,
  p_latitude         double precision default null,
  p_longitude        double precision default null,
  p_video_path       text default null,
  p_thumbnail_path   text default null,
  p_rating           smallint default null,
  p_filter_name      text default 'original',
  p_music_track_id   bigint default null,
  p_music_title      text default null,
  p_music_artist     text default null,
  p_music_artwork_url text default null,
  p_music_preview_url text default null
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
    latitude, longitude, video_path, thumbnail_path, rating, filter_name,
    music_track_id, music_title, music_artist, music_artwork_url,
    music_preview_url,
    position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    p_latitude, p_longitude, p_video_path, p_thumbnail_path, p_rating,
    coalesce(p_filter_name, 'original'),
    p_music_track_id, p_music_title, p_music_artist, p_music_artwork_url,
    p_music_preview_url,
    coalesce((select max(p.position) from public.posts p where p.album_id = p_album_id), -1) + 1
  )
  returning * into created;

  return created;
end;
$$;

grant execute on function public.create_post to authenticated;
revoke all on function public.create_post from anon;

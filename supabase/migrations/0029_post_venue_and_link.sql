-- ---------------------------------------------------------------------------
-- A venue, and a link
--
-- Two unrelated fields in one migration because both are columns on posts and
-- both need create_post recreated, and recreating that function twice in a row
-- is two chances to get the argument list wrong.
--
-- Separate from 0028 rather than folded into it: that migration may already
-- have been applied, and editing an applied migration means the new columns
-- silently never arrive.
--
-- The venue comes from MapKit — Apple's own place data, via
-- MKLocalPointsOfInterestRequest — so it is only ever set from an Apple device.
-- Nothing here enforces that; the column simply stays null elsewhere.
-- ---------------------------------------------------------------------------

alter table public.posts
  add column venue_name      text,
  add column venue_category  text,
  add column venue_address   text,
  add column venue_latitude  double precision,
  add column venue_longitude double precision,
  add column link            text;

-- A venue is a point on a map or it is nothing: a name with no coordinates
-- cannot be opened, and coordinates with no name cannot be read.
alter table public.posts
  add constraint venue_is_locatable check (
    venue_name is null
    or (venue_latitude is not null and venue_longitude is not null)
  );

/*
 * Only a link someone can actually follow.
 *
 * Checked in the database as well as in the app because this value is handed
 * to a browser on someone else's phone. Without it, a stored `javascript:` or
 * `data:` URL would be a way to have every viewer of a post open something the
 * author chose — and the app is not the only thing that can write this column.
 */
alter table public.posts
  add constraint link_is_web check (
    link is null or link ~* '^https?://[^[:space:]]+$'
  );

-- ---------------------------------------------------------------------------
-- create_post() gains both.
--
-- Recreated rather than altered, as in 0013, 0017, 0021 and 0028: Postgres
-- cannot add a parameter to an existing function, and the previous signature
-- has to be dropped by hand or both overloads live on and every call is
-- ambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.create_post(
  uuid, text, text, text, text, text, timestamptz, jsonb, text, real,
  double precision, double precision, text, text, smallint, text,
  bigint, text, text, text, text
);

create or replace function public.create_post(
  p_album_id          uuid,
  p_image_path        text,
  p_selfie_path       text default null,
  p_title             text default null,
  p_description       text default null,
  p_location          text default null,
  p_taken_at          timestamptz default now(),
  p_exif              jsonb default null,
  p_blurhash          text default null,
  p_luminance         real default null,
  p_latitude          double precision default null,
  p_longitude         double precision default null,
  p_video_path        text default null,
  p_thumbnail_path    text default null,
  p_rating            smallint default null,
  p_filter_name       text default 'original',
  p_music_track_id    bigint default null,
  p_music_title       text default null,
  p_music_artist      text default null,
  p_music_artwork_url text default null,
  p_music_preview_url text default null,
  p_venue_name        text default null,
  p_venue_category    text default null,
  p_venue_address     text default null,
  p_venue_latitude    double precision default null,
  p_venue_longitude   double precision default null,
  p_link              text default null
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
    venue_name, venue_category, venue_address, venue_latitude, venue_longitude,
    link,
    position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    p_latitude, p_longitude, p_video_path, p_thumbnail_path, p_rating,
    coalesce(p_filter_name, 'original'),
    p_music_track_id, p_music_title, p_music_artist, p_music_artwork_url,
    p_music_preview_url,
    p_venue_name, p_venue_category, p_venue_address,
    p_venue_latitude, p_venue_longitude,
    nullif(btrim(p_link), ''),
    coalesce((select max(p.position) from public.posts p where p.album_id = p_album_id), -1) + 1
  )
  returning * into created;

  return created;
end;
$$;

grant execute on function public.create_post to authenticated;
revoke all on function public.create_post from anon;

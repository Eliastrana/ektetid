-- Exact coordinates on posts.
--
-- Until now the only location was the reverse-geocoded label ("Oslo, Norge").
-- The precise position was fetched at compose time and discarded, and EXIF GPS
-- was kept only inside the `exif` blob — unindexed, and awkward to read.
--
-- EXIF stores latitude and longitude unsigned, with the hemisphere in a
-- separate GPSLatitudeRef / GPSLongitudeRef field. A value of 122.803 with a
-- ref of 'W' is -122.803, so ignoring the ref puts half the world's pins in the
-- wrong hemisphere. The backfill below applies the sign.

alter table public.posts
  add column latitude double precision,
  add column longitude double precision;

alter table public.posts
  add constraint latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180));

-- Only posts that actually have coordinates, so the map can skip the rest
-- without scanning everything.
create index posts_located_idx on public.posts (author_id, taken_at desc)
  where latitude is not null and longitude is not null;

-- Backfill from EXIF where it is present.
update public.posts
   set latitude = case
         when upper(exif ->> 'GPSLatitudeRef') = 'S'
           then -abs((exif ->> 'GPSLatitude')::double precision)
         else abs((exif ->> 'GPSLatitude')::double precision)
       end,
       longitude = case
         when upper(exif ->> 'GPSLongitudeRef') = 'W'
           then -abs((exif ->> 'GPSLongitude')::double precision)
         else abs((exif ->> 'GPSLongitude')::double precision)
       end
 where exif ? 'GPSLatitude'
   and exif ? 'GPSLongitude'
   and jsonb_typeof(exif -> 'GPSLatitude') = 'number'
   and jsonb_typeof(exif -> 'GPSLongitude') = 'number';

-- create_post gains the two arguments. Recreated rather than altered because
-- Postgres will not add parameters to an existing function signature.
drop function if exists public.create_post(
  uuid, text, text, text, text, text, timestamptz, jsonb, text, real
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
  p_longitude   double precision default null
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
    latitude, longitude, position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    p_latitude, p_longitude,
    coalesce((select max(p.position) from public.posts p where p.album_id = p_album_id), -1) + 1
  )
  returning * into created;

  return created;
end;
$$;

grant execute on function public.create_post to authenticated;
revoke all on function public.create_post from anon;

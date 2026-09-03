-- Stable, appropriately sized image delivery for album feeds.

alter table public.posts
  add column preview_path text;

comment on column public.posts.preview_path is
  'A 768px-wide JPEG for album covers and feed cards. The original remains image_path.';

create index posts_preview_path_idx on public.posts (preview_path)
  where preview_path is not null;
create index if not exists posts_thumbnail_path_idx on public.posts (thumbnail_path)
  where thumbnail_path is not null;

-- Derivatives inherit the same album visibility as their original. Without
-- this, the owner could sign them but friends would receive a Storage 403.
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
      p.thumbnail_path = object_name or
      p.preview_path = object_name or
      p.selfie_path = object_name or
      p.video_path = object_name
    )
      and public.can_see_album(p.album_id)
  );
$$;

grant execute on function public.can_see_album_media to authenticated;
revoke all on function public.can_see_album_media from anon;

-- Album cards use the medium derivative when it exists. Existing rows fall
-- back to cover_image_path in the client until the backfill has reached them.
drop view if exists public.album_feed;

create view public.album_feed
with (security_invoker = on)
as
select
  a.id,
  a.owner_id,
  a.title,
  a.description,
  a.created_at,
  a.updated_at,
  a.cover_post_id,
  a.accent_color,
  a.cover_layout,
  p.username          as owner_username,
  p.display_name      as owner_display_name,
  p.avatar_url        as owner_avatar_url,
  cover.image_path    as cover_image_path,
  cover.preview_path  as cover_preview_path,
  cover.blurhash      as cover_blurhash,
  cover.taken_at      as cover_taken_at,
  stats.post_count,
  stats.last_post_at,
  greatest(stats.post_count - (coalesce(r.last_seen_position, -1) + 1), 0) as unseen_count
from public.albums a
join public.profiles p
  on p.id = a.owner_id
left join lateral (
  select
    count(*)::int      as post_count,
    max(po.created_at) as last_post_at
  from public.posts po
  where po.album_id = a.id
) stats on true
left join lateral (
  select po.image_path, po.preview_path, po.blurhash, po.taken_at
  from public.posts po
  where po.album_id = a.id
  order by (po.id = a.cover_post_id) desc nulls last, po.position desc
  limit 1
) cover on true
left join public.album_reads r
  on r.album_id = a.id
 and r.user_id = (select auth.uid());

comment on view public.album_feed is
  'Visible albums with selected presentation, optimized cover, unseen count and latest-post time.';

grant select on public.album_feed to authenticated;
revoke all on public.album_feed from anon;

-- Recreate create_post with the derivative path. The former signature is the
-- final overload introduced by 0029.
drop function if exists public.create_post(
  uuid, text, text, text, text, text, timestamptz, jsonb, text, real,
  double precision, double precision, text, text, smallint, text,
  bigint, text, text, text, text,
  text, text, text, double precision, double precision, text
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
  p_link              text default null,
  p_preview_path      text default null
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
    latitude, longitude, video_path, thumbnail_path, preview_path,
    rating, filter_name,
    music_track_id, music_title, music_artist, music_artwork_url,
    music_preview_url,
    venue_name, venue_category, venue_address, venue_latitude, venue_longitude,
    link,
    position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    p_latitude, p_longitude, p_video_path, p_thumbnail_path, p_preview_path,
    p_rating, coalesce(p_filter_name, 'original'),
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

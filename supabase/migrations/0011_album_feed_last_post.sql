-- Sort the feed by when an album last received a post.
--
-- The feed ordered by albums.updated_at, which the touch_album() trigger bumps
-- on any post change — but it is also bumped by editing the album's own title
-- or description. Renaming an old album would jump it to the top of everyone's
-- feed, which is not what "newest" should mean.
--
-- last_post_at is the publish time of the album's most recent post, so an
-- album with an old newest-post stays down the list no matter how recently it
-- was otherwise touched. Empty albums have no last_post_at and sort last.
--
-- Note this uses created_at, not taken_at: taken_at is user-editable and
-- describes when the photo was taken, which for a scanned or imported picture
-- could be years ago. Feed position should follow when it was shared.

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
  p.username        as owner_username,
  p.display_name    as owner_display_name,
  p.avatar_url      as owner_avatar_url,
  cover.image_path  as cover_image_path,
  cover.blurhash    as cover_blurhash,
  cover.taken_at    as cover_taken_at,
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
  select po.image_path, po.blurhash, po.taken_at
  from public.posts po
  where po.album_id = a.id
  order by po.position desc
  limit 1
) cover on true
left join public.album_reads r
  on r.album_id = a.id
 and r.user_id = (select auth.uid());

comment on view public.album_feed is
  'Albums visible to the caller, with cover image, unseen count and the time of the most recent post.';

grant select on public.album_feed to authenticated;
revoke all on public.album_feed from anon;

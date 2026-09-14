-- The album grid in one query.
--
-- The web app fetched every album, then counted images and diffed against
-- localStorage on the client to work out the unseen badge. Here the cover
-- image, the post count and the unseen count all come back from Postgres.
--
-- security_invoker means the view is evaluated as the calling user, so the
-- album and post policies still apply and no extra visibility rules are needed.

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
  greatest(stats.post_count - (coalesce(r.last_seen_position, -1) + 1), 0) as unseen_count
from public.albums a
join public.profiles p
  on p.id = a.owner_id
left join lateral (
  select count(*)::int as post_count
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
  'Albums visible to the caller, with cover image and unseen count resolved server-side.';

grant select on public.album_feed to authenticated;

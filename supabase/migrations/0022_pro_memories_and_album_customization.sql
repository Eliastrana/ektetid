-- Pro memories and album presentation.
--
-- The app can make these controls look locked, but the database remains the
-- authority: a modified client cannot customize an album or read the Pro
-- memories endpoint without actually owning or earning Pro.

-- ---------------------------------------------------------------------------
-- Album presentation
-- ---------------------------------------------------------------------------

alter table public.albums
  add column cover_post_id uuid references public.posts (id) on delete set null,
  add column accent_color text not null default '#f5c451',
  add column cover_layout text not null default 'full',
  add constraint albums_accent_color_allowed check (
    accent_color in ('#f5c451', '#8fb8ff', '#eaa08f', '#94c9aa', '#b9a0dd', '#d7d7d7')
  ),
  add constraint albums_cover_layout_allowed check (
    cover_layout in ('full', 'framed', 'split')
  );

comment on column public.albums.cover_post_id is
  'A Pro owner-selected cover. Null keeps the newest post as the cover.';
comment on column public.albums.accent_color is
  'A Pro owner-selected presentation color from the app palette.';
comment on column public.albums.cover_layout is
  'The Pro album-card layout: full, framed or split.';

create or replace function public.protect_album_customization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.cover_post_id is not distinct from old.cover_post_id
     and new.accent_color is not distinct from old.accent_color
     and new.cover_layout is not distinct from old.cover_layout then
    return new;
  end if;

  if old.owner_id <> (select auth.uid())
     or not public.has_pro((select auth.uid())) then
    raise exception 'Album customization requires Pro and album ownership'
      using errcode = '42501';
  end if;

  if new.cover_post_id is not null and not exists (
    select 1
    from public.posts p
    where p.id = new.cover_post_id and p.album_id = new.id
  ) then
    raise exception 'Cover post must belong to the album'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger albums_protect_customization
  before update of cover_post_id, accent_color, cover_layout on public.albums
  for each row execute function public.protect_album_customization();

create or replace function public.update_album_customization(
  p_album_id uuid,
  p_cover_post_id uuid,
  p_accent_color text,
  p_cover_layout text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.has_pro((select auth.uid())) then
    raise exception 'EkteTid Pro is required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.albums a
    where a.id = p_album_id and a.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the album owner may customize it'
      using errcode = '42501';
  end if;

  if p_cover_post_id is not null and not exists (
    select 1 from public.posts p
    where p.id = p_cover_post_id and p.album_id = p_album_id
  ) then
    raise exception 'Cover post must belong to the album'
      using errcode = '23514';
  end if;

  update public.albums
     set cover_post_id = p_cover_post_id,
         accent_color = p_accent_color,
         cover_layout = p_cover_layout
   where id = p_album_id;
end;
$$;

grant execute on function public.update_album_customization(uuid, uuid, text, text)
  to authenticated;
revoke all on function public.update_album_customization(uuid, uuid, text, text)
  from anon;

-- Replace the feed view so every card receives its saved presentation and the
-- selected cover wins over the default newest-post cover.
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
  order by (po.id = a.cover_post_id) desc nulls last, po.position desc
  limit 1
) cover on true
left join public.album_reads r
  on r.album_id = a.id
 and r.user_id = (select auth.uid());

comment on view public.album_feed is
  'Visible albums with selected presentation, cover, unseen count and latest-post time.';

grant select on public.album_feed to authenticated;
revoke all on public.album_feed from anon;

-- ---------------------------------------------------------------------------
-- Minneblikk
-- ---------------------------------------------------------------------------

create or replace function public.pro_memories()
returns table (
  id uuid,
  album_id uuid,
  album_title text,
  title text,
  description text,
  taken_at timestamptz,
  image_path text,
  blurhash text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not public.has_pro((select auth.uid())) then
    raise exception 'EkteTid Pro is required'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.album_id,
    a.title,
    p.title,
    p.description,
    p.taken_at,
    p.image_path,
    p.blurhash
  from public.posts p
  join public.albums a on a.id = p.album_id
  where p.author_id = (select auth.uid())
  order by p.taken_at desc;
end;
$$;

grant execute on function public.pro_memories() to authenticated;
revoke all on function public.pro_memories() from anon;

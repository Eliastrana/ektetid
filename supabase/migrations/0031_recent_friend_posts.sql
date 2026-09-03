-- One newest post per friend for compact surfaces such as the iOS widget.
-- `created_at` answers when the friend published; `taken_at` may be years old.
create index if not exists posts_author_created_idx
  on public.posts (author_id, created_at desc);

create or replace function public.recent_friend_posts(p_limit integer default 4)
returns table (
  author_id uuid,
  username text,
  display_name text,
  album_id uuid,
  album_title text,
  post_id uuid,
  posted_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    newest.author_id,
    newest.username::text,
    newest.display_name,
    newest.album_id,
    newest.album_title,
    newest.post_id,
    newest.posted_at
  from (
    select
      p.author_id,
      profile.username,
      profile.display_name,
      p.album_id,
      album.title as album_title,
      p.id as post_id,
      p.created_at as posted_at,
      row_number() over (
        partition by p.author_id
        order by p.created_at desc, p.id desc
      ) as author_rank
    from public.posts p
    join public.profiles profile on profile.id = p.author_id
    join public.albums album on album.id = p.album_id
    where p.author_id <> (select auth.uid())
      and public.are_friends((select auth.uid()), p.author_id)
  ) newest
  where newest.author_rank = 1
  order by newest.posted_at desc, newest.post_id desc
  limit least(greatest(coalesce(p_limit, 4), 0), 4);
$$;

revoke all on function public.recent_friend_posts(integer) from public, anon;
grant execute on function public.recent_friend_posts(integer) to authenticated;

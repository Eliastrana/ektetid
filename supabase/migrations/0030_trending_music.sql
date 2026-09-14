-- ---------------------------------------------------------------------------
-- What people are actually putting on their posts
--
-- Aggregated from posts rather than from a log of searches. A search is noisy —
-- typos, half-typed words, things looked at and rejected — while attaching a
-- track is a finished decision. It also means nothing new has to be recorded:
-- recording what people type would be a privacy cost for a worse signal.
--
-- security definer because the point is to count across everyone, and RLS
-- restricts a reader to their friends' posts. It returns only track metadata
-- and a count — never a post, an album or an author — so bypassing RLS here
-- exposes nothing a chart would not.
-- ---------------------------------------------------------------------------

create or replace function public.trending_music(p_limit integer default 12)
returns table (
  track_id    bigint,
  title       text,
  artist      text,
  artwork_url text,
  preview_url text,
  uses        bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.music_track_id,
    /*
     * The most recent spelling of each field, not an arbitrary one.
     *
     * Grouping is by track id, and two rows for the same track can carry
     * different text: Apple renames a single when the album arrives, and an
     * older post keeps whatever it was called then. The newest row is the
     * closest thing to current.
     */
    (array_agg(p.music_title       order by p.created_at desc))[1],
    (array_agg(p.music_artist      order by p.created_at desc))[1],
    (array_agg(p.music_artwork_url order by p.created_at desc))[1],
    (array_agg(p.music_preview_url order by p.created_at desc))[1],
    count(*)
  from public.posts p
  where p.music_track_id is not null
    and p.music_preview_url is not null
    -- Trending, not all-time: a song from last spring is not what is going
    -- round now, and the list exists to be current.
    and p.created_at > now() - interval '90 days'
  group by p.music_track_id
  /*
   * Two different people, at least.
   *
   * Without this, a track used once by one person would appear in a list shown
   * to everyone — which is a quiet way of telling strangers what a single
   * identifiable user has been listening to. Requiring two unrelated people
   * makes an entry a fact about a song rather than about somebody.
   */
  having count(distinct p.author_id) >= 2
  order by count(*) desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

grant execute on function public.trending_music to authenticated;
revoke all on function public.trending_music from anon;

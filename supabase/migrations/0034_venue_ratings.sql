-- ---------------------------------------------------------------------------
-- Restaurant ratings for the map
--
-- A post with both a venue and a terningkast is a review. Grouping those by
-- place gives each restaurant a score out of six.
--
-- security invoker, so posts_select decides which reviews count: the score is
-- the average of what *your* friends have given, never a stranger's. A global
-- average would be a way to learn that someone you cannot see was at a given
-- restaurant, and what they thought of it — with one review, the average is
-- their rating.
--
-- A place is its name plus its coordinates to four decimals (about 11 m).
-- MapKit hands back identical coordinates for the same point of interest, so
-- that is effectively exact, while two branches of one chain stay apart.
-- ---------------------------------------------------------------------------

create or replace function public.venue_ratings()
returns table (
  name            text,
  category        text,
  address         text,
  latitude        double precision,
  longitude       double precision,
  average         numeric,
  ratings         int,
  latest_post_id  uuid,
  latest_album_id uuid
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with rated as (
    select
      p.id,
      p.album_id,
      p.taken_at,
      p.rating,
      p.venue_name,
      p.venue_category,
      p.venue_address,
      p.venue_latitude,
      p.venue_longitude,
      lower(btrim(p.venue_name))              as name_key,
      round(p.venue_latitude::numeric, 4)     as lat_key,
      round(p.venue_longitude::numeric, 4)    as lng_key
    from public.posts p
    where p.venue_name is not null
      and p.venue_latitude is not null
      and p.venue_longitude is not null
      and p.rating is not null
  ),
  -- The newest review names the place and is where tapping it leads, so a
  -- renamed venue shows its current name.
  latest as (
    select distinct on (r.name_key, r.lat_key, r.lng_key) r.*
    from rated r
    order by r.name_key, r.lat_key, r.lng_key, r.taken_at desc
  ),
  totals as (
    select
      r.name_key,
      r.lat_key,
      r.lng_key,
      round(avg(r.rating), 1) as average,
      count(*)::int           as ratings
    from rated r
    group by r.name_key, r.lat_key, r.lng_key
  )
  select
    l.venue_name,
    l.venue_category,
    l.venue_address,
    l.venue_latitude,
    l.venue_longitude,
    t.average,
    t.ratings,
    l.id,
    l.album_id
  from latest l
  join totals t
    on t.name_key = l.name_key
   and t.lat_key = l.lat_key
   and t.lng_key = l.lng_key
  order by t.ratings desc, l.taken_at desc
  limit 500;
$$;

revoke all on function public.venue_ratings() from public, anon;
grant execute on function public.venue_ratings() to authenticated;

-- Social details, author ratings, map thumbnails and Pro entitlements.
--
-- The client can render all of these features optimistically, but the rules
-- that matter live here: only an author may rate their post, view identities
-- are visible only to a Pro author, and paid Pro rows cannot be forged by an
-- authenticated client.

-- ---------------------------------------------------------------------------
-- posts: lightweight map media + author-owned dice rating
-- ---------------------------------------------------------------------------

alter table public.posts
  add column thumbnail_path text,
  add column rating smallint,
  add column filter_name text not null default 'original',
  add constraint posts_rating_range check (rating is null or rating between 1 and 6),
  add constraint posts_filter_name check (
    filter_name in ('original', 'warm', 'cool', 'contrast', 'mono')
  );

comment on column public.posts.thumbnail_path is
  'Small JPEG generated at publish time for map pins and other compact surfaces.';
comment on column public.posts.rating is
  'Optional 1-6 dice rating chosen by the post author.';
comment on column public.posts.filter_name is
  'Filter baked into the uploaded image; retained so edit and detail screens can label it.';

create or replace function public.protect_author_rating()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.rating is distinct from old.rating
     and old.author_id <> (select auth.uid()) then
    raise exception 'Only the post author may change its rating'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger posts_protect_author_rating
  before update on public.posts
  for each row execute function public.protect_author_rating();

-- create_post gained three optional fields. PostgreSQL cannot add parameters
-- to an existing function signature, so replace the SDK 57-era overload.
drop function if exists public.create_post(
  uuid, text, text, text, text, text, timestamptz, jsonb, text, real,
  double precision, double precision, text
);

create or replace function public.create_post(
  p_album_id      uuid,
  p_image_path    text,
  p_selfie_path   text default null,
  p_title         text default null,
  p_description   text default null,
  p_location      text default null,
  p_taken_at      timestamptz default now(),
  p_exif          jsonb default null,
  p_blurhash      text default null,
  p_luminance     real default null,
  p_latitude      double precision default null,
  p_longitude     double precision default null,
  p_video_path    text default null,
  p_thumbnail_path text default null,
  p_rating        smallint default null,
  p_filter_name   text default 'original'
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
    position
  )
  values (
    p_album_id, auth.uid(), p_image_path, p_selfie_path, p_title,
    p_description, p_location, p_taken_at, p_exif, p_blurhash, p_luminance,
    p_latitude, p_longitude, p_video_path, p_thumbnail_path, p_rating,
    coalesce(p_filter_name, 'original'),
    coalesce((select max(p.position) from public.posts p where p.album_id = p_album_id), -1) + 1
  )
  returning * into created;

  return created;
end;
$$;

grant execute on function public.create_post to authenticated;
revoke all on function public.create_post from anon;

-- ---------------------------------------------------------------------------
-- Pro
-- ---------------------------------------------------------------------------

create type public.pro_source as enum ('purchase', 'activity');

create table public.pro_entitlements (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  source         public.pro_source not null,
  transaction_id text unique,
  granted_at     timestamptz not null default now(),

  constraint purchase_has_transaction check (
    source <> 'purchase' or transaction_id is not null
  )
);

alter table public.pro_entitlements enable row level security;
grant select on public.pro_entitlements to authenticated;
revoke insert, update, delete on public.pro_entitlements from authenticated, anon;

create policy pro_entitlements_select on public.pro_entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Activity Pro is derived from server truth, so it unlocks immediately at the
-- twentieth post in the third distinct album and cannot drift out of sync.
create or replace function public.has_pro(who uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.pro_entitlements e where e.user_id = who
  ) or exists (
    select 1
    from public.posts p
    where p.author_id = who
    group by p.author_id
    having count(*) >= 20 and count(distinct p.album_id) >= 3
  );
$$;

grant execute on function public.has_pro to authenticated;
revoke all on function public.has_pro from anon;

-- ---------------------------------------------------------------------------
-- post views (identity is a Pro feature)
-- ---------------------------------------------------------------------------

create table public.post_views (
  post_id       uuid not null references public.posts (id) on delete cascade,
  viewer_id     uuid not null references public.profiles (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  view_count    integer not null default 1 check (view_count > 0),

  primary key (post_id, viewer_id)
);

create index post_views_recent_idx on public.post_views (post_id, last_seen_at desc);

alter table public.post_views enable row level security;
grant select, insert, update on public.post_views to authenticated;
revoke delete on public.post_views from authenticated, anon;

create policy post_views_select on public.post_views
  for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = (select auth.uid())
        and public.has_pro((select auth.uid()))
    )
  );

create policy post_views_insert on public.post_views
  for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and public.can_see_post(post_id)
  );

create policy post_views_update on public.post_views
  for update to authenticated
  using (viewer_id = (select auth.uid()))
  with check (viewer_id = (select auth.uid()));

create or replace function public.record_post_view(p_post_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select p.author_id into owner from public.posts p where p.id = p_post_id;
  if owner is null or owner = (select auth.uid()) then
    return;
  end if;

  insert into public.post_views (post_id, viewer_id)
  values (p_post_id, auth.uid())
  on conflict (post_id, viewer_id) do update
    set last_seen_at = now(),
        view_count = public.post_views.view_count + 1;
end;
$$;

grant execute on function public.record_post_view to authenticated;
revoke all on function public.record_post_view from anon;

-- ---------------------------------------------------------------------------
-- threaded comments and comment likes
-- ---------------------------------------------------------------------------

alter table public.comments
  add column parent_comment_id uuid references public.comments (id) on delete cascade;

create index comments_parent_idx on public.comments (parent_comment_id, created_at);

create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;
grant select, insert, delete on public.comment_likes to authenticated;
revoke all on public.comment_likes from anon;

create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (
    exists (
      select 1 from public.comments c
      where c.id = comment_id and public.can_see_post(c.post_id)
    )
  );

create policy comment_likes_insert on public.comment_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comments c
      where c.id = comment_id and public.can_see_post(c.post_id)
    )
  );

create policy comment_likes_delete on public.comment_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- friends of friends
-- ---------------------------------------------------------------------------

create or replace function public.friend_suggestions(p_limit integer default 12)
returns table (
  id uuid,
  username citext,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  mutual_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with my_friends as (
    select case
      when f.requester_id = (select auth.uid()) then f.addressee_id
      else f.requester_id
    end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid())) or (f.addressee_id = (select auth.uid())))
  ), candidates as (
    select
      case when f.requester_id = mf.friend_id then f.addressee_id else f.requester_id end as candidate_id,
      count(distinct mf.friend_id) as mutual_count
    from my_friends mf
    join public.friendships f
      on f.status = 'accepted'
     and (f.requester_id = mf.friend_id or f.addressee_id = mf.friend_id)
    group by candidate_id
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.created_at, c.mutual_count
  from candidates c
  join public.profiles p on p.id = c.candidate_id
  where c.candidate_id <> (select auth.uid())
    and not public.is_blocked((select auth.uid()), c.candidate_id)
    and not exists (
      select 1 from public.friendships known
      where (known.requester_id = (select auth.uid()) and known.addressee_id = c.candidate_id)
         or (known.addressee_id = (select auth.uid()) and known.requester_id = c.candidate_id)
    )
  order by c.mutual_count desc, p.username
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.friend_suggestions to authenticated;
revoke all on function public.friend_suggestions from anon;

-- Realtime keeps replies and comment-like counts current while the sheet is open.
alter publication supabase_realtime add table public.comment_likes;
alter table public.comment_likes replica identity full;

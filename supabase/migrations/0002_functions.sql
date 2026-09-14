-- Helper functions and triggers.
--
-- are_friends() and can_see_album() are SECURITY DEFINER on purpose: they are
-- called from inside RLS policies, so if they ran as the caller they would
-- re-enter the very policies being evaluated and recurse. Running as owner
-- reads the raw tables once and returns a plain boolean.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- friendship resolution
-- ---------------------------------------------------------------------------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = a and f.addressee_id = b) or
        (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'blocked'
      and (
        (f.requester_id = a and f.addressee_id = b) or
        (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

-- An album is visible to its owner, and to anyone the owner has accepted as a
-- friend. Post, like and comment visibility all funnel through this.
create or replace function public.can_see_album(album uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.albums al
    where al.id = album
      and (
        al.owner_id = (select auth.uid()) or
        public.are_friends((select auth.uid()), al.owner_id)
      )
  );
$$;

create or replace function public.can_see_post(post uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = post
      and public.can_see_album(p.album_id)
  );
$$;

create or replace function public.owns_album(album uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.albums al
    where al.id = album and al.owner_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- profile bootstrap
--
-- Every auth user gets a profile immediately, with a provisional username the
-- user is prompted to change on first run.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate citext;
begin
  candidate := 'bruker_' || substr(replace(new.id::text, '-', ''), 1, 12);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- post ordering
--
-- Callers may omit position; it then lands at the end of the album. The unique
-- (album_id, position) constraint means two simultaneous inserts into the same
-- album can collide, in which case the client retries.
-- ---------------------------------------------------------------------------

create or replace function public.assign_post_position()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.position is null then
    select coalesce(max(p.position), -1) + 1
      into new.position
      from public.posts p
     where p.album_id = new.album_id;
  end if;
  return new;
end;
$$;

create trigger posts_assign_position
  before insert on public.posts
  for each row execute function public.assign_post_position();

-- Keep the owning album's updated_at fresh so the feed can sort by recency.
create or replace function public.touch_album()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.albums
     set updated_at = now()
   where id = coalesce(new.album_id, old.album_id);
  return null;
end;
$$;

create trigger posts_touch_album
  after insert or update or delete on public.posts
  for each row execute function public.touch_album();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger friendships_touch
  before update on public.friendships
  for each row execute function public.touch_updated_at();

create trigger album_reads_touch
  before update on public.album_reads
  for each row execute function public.touch_updated_at();

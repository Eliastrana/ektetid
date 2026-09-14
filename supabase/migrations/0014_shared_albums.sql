-- Shared albums.
--
-- An album gains collaborators. Members may add, edit and delete posts in it,
-- and each post keeps its own author_id so the grid can still say who took
-- which picture.
--
-- Visibility widens deliberately: a shared album is visible to every member
-- AND to every member's friends. That makes a trip album work the way people
-- expect — both circles see it — but it means adding a collaborator exposes
-- every existing photo to their whole friend list. There is no way to undo
-- that retroactively, so the UI has to say so before the invitation is sent.

create table public.album_members (
  album_id   uuid not null references public.albums (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (album_id, user_id)
);

create index album_members_user_idx on public.album_members (user_id);

alter table public.album_members enable row level security;
grant select, insert, delete on public.album_members to authenticated;
revoke all on public.album_members from anon;

-- ---------------------------------------------------------------------------
-- membership and permission helpers
--
-- SECURITY DEFINER for the same reason as are_friends(): these are called from
-- inside RLS policies, and running as the caller would re-enter the policies
-- being evaluated.
-- ---------------------------------------------------------------------------

create or replace function public.is_album_member(album uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.albums a where a.id = album and a.owner_id = who
  ) or exists (
    select 1 from public.album_members m where m.album_id = album and m.user_id = who
  );
$$;

/**
 * Anyone who may add, edit or delete posts in an album.
 *
 * Deliberately the same set as membership: the chosen model is a shared space
 * where every member has equal power, including over each other's posts.
 */
create or replace function public.can_edit_album(album uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_album_member(album, (select auth.uid()));
$$;

-- Two people who collaborate on any album. Used by Storage so a member can
-- load photos posted by someone they are not otherwise friends with.
create or replace function public.shares_album_with(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.albums al
    where (al.owner_id = a and exists (
            select 1 from public.album_members m
            where m.album_id = al.id and m.user_id = b))
       or (al.owner_id = b and exists (
            select 1 from public.album_members m
            where m.album_id = al.id and m.user_id = a))
  ) or exists (
    select 1
    from public.album_members m1
    join public.album_members m2 on m2.album_id = m1.album_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- ---------------------------------------------------------------------------
-- visibility
-- ---------------------------------------------------------------------------

create or replace function public.can_see_album(album uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- the owner, or someone the owner has accepted as a friend
    exists (
      select 1 from public.albums al
      where al.id = album
        and (al.owner_id = (select auth.uid())
             or public.are_friends((select auth.uid()), al.owner_id))
    )
    -- or a collaborator, or a friend of any collaborator
    or exists (
      select 1 from public.album_members m
      where m.album_id = album
        and (m.user_id = (select auth.uid())
             or public.are_friends((select auth.uid()), m.user_id))
    );
$$;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

create policy album_members_select on public.album_members
  for select to authenticated
  using (public.can_see_album(album_id));

-- Only the album's owner hands out access. A collaborator inviting further
-- collaborators would let an album's audience grow without the owner ever
-- being involved.
create policy album_members_insert on public.album_members
  for insert to authenticated
  with check (
    added_by = (select auth.uid()) and
    public.owns_album(album_id) and
    public.are_friends((select auth.uid()), user_id)
  );

-- The owner can remove anyone; a member can remove themselves.
create policy album_members_delete on public.album_members
  for delete to authenticated
  using (
    public.owns_album(album_id) or user_id = (select auth.uid())
  );

-- Albums: the select policy has to use can_see_album() too, otherwise the
-- widened rule applies to posts but the album row itself stays invisible — a
-- collaborator's friend would see an album that appears to have no posts, or
-- nothing at all.
drop policy if exists albums_select on public.albums;
create policy albums_select on public.albums
  for select to authenticated
  using (public.can_see_album(id));

-- Posts: members may write, not just the owner.
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid()) and
    public.can_edit_album(album_id)
  );

drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts
  for update to authenticated
  using (public.can_edit_album(album_id))
  with check (public.can_edit_album(album_id));

drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts
  for delete to authenticated
  using (public.can_edit_album(album_id));

-- Albums: members may rename and re-describe, but only the owner may delete.
drop policy if exists albums_update on public.albums;
create policy albums_update on public.albums
  for update to authenticated
  using (public.can_edit_album(id))
  with check (public.can_edit_album(id));

-- Storage: a collaborator has to be able to load photos posted by someone they
-- are not friends with, otherwise a shared album shows broken images.
drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or
      public.are_friends((select auth.uid()), ((storage.foldername(name))[1])::uuid) or
      public.shares_album_with((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    )
  );

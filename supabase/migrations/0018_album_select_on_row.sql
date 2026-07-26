-- Let a user see the album they have just created.
--
-- Creating an album failed with a row-level security violation, while every
-- other write worked. The cause was the SELECT policy, not the INSERT one.
--
-- `albums_select` used `can_see_album(id)`, which answers the question by
-- looking the album up by id in `albums`. That is fine everywhere an album
-- already exists — but PostgreSQL applies SELECT policies to the row returned
-- by `INSERT ... RETURNING`, and the client asks for the new id. The helper is
-- STABLE, so it runs against the snapshot from the start of the statement and
-- cannot see the row that statement is inserting. `exists(...)` came back
-- false, and the user was told they could not see their own new album.
--
-- The fix is to judge the row by the columns it carries rather than by looking
-- it up again. `owner_id` is right there in the new row.

create or replace function public.can_see_album_row(album uuid, owner uuid)
returns boolean
language sql
stable
-- SECURITY DEFINER for the same reason the other helpers are: reading
-- album_members from a policy on albums would re-enter that table's own policy,
-- which reads albums, and the two would recurse.
security definer
set search_path = public, pg_temp
as $$
  select
    -- the owner, taken from the row rather than fetched
    owner = (select auth.uid())
    -- or someone the owner has accepted as a friend
    or public.are_friends((select auth.uid()), owner)
    -- or a collaborator, or a friend of one. A brand-new album has no members,
    -- so this is simply false at insert time.
    or exists (
      select 1 from public.album_members m
      where m.album_id = album
        and (m.user_id = (select auth.uid())
             or public.are_friends((select auth.uid()), m.user_id))
    );
$$;

grant execute on function public.can_see_album_row to authenticated;
revoke all on function public.can_see_album_row from anon;

drop policy if exists albums_select on public.albums;
create policy albums_select on public.albums
  for select to authenticated
  using (public.can_see_album_row(id, owner_id));

-- can_see_album is deliberately left in place: every other policy that uses it
-- is reading an album that already exists, where looking it up is correct.

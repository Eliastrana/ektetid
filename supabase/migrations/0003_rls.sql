-- Row-Level Security.
--
-- This is the whole authorization model. There is no application server, so
-- every rule a client could otherwise bypass lives here. auth.uid() is wrapped
-- in a scalar subquery throughout so Postgres evaluates it once per statement
-- rather than once per row.

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.albums      enable row level security;
alter table public.posts       enable row level security;
alter table public.likes       enable row level security;
alter table public.comments    enable row level security;
alter table public.album_reads enable row level security;
alter table public.push_tokens enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: readable by any signed-in user so friend search works, except
-- across a block. Writable only by yourself.
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (not public.is_blocked((select auth.uid()), id));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- friendships: you only ever see edges you are part of. You may create a
-- request as the requester, and either side may accept, block or remove.
-- ---------------------------------------------------------------------------

create policy friendships_select on public.friendships
  for select to authenticated
  using (
    requester_id = (select auth.uid()) or
    addressee_id = (select auth.uid())
  );

create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and
    not public.is_blocked((select auth.uid()), addressee_id)
  );

create policy friendships_update on public.friendships
  for update to authenticated
  using (
    requester_id = (select auth.uid()) or
    addressee_id = (select auth.uid())
  )
  with check (
    requester_id = (select auth.uid()) or
    addressee_id = (select auth.uid())
  );

create policy friendships_delete on public.friendships
  for delete to authenticated
  using (
    requester_id = (select auth.uid()) or
    addressee_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- albums: yours, plus your accepted friends'.
-- ---------------------------------------------------------------------------

create policy albums_select on public.albums
  for select to authenticated
  using (
    owner_id = (select auth.uid()) or
    public.are_friends((select auth.uid()), owner_id)
  );

create policy albums_insert on public.albums
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy albums_update on public.albums
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy albums_delete on public.albums
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- posts: visibility inherits from the album. You may only add posts to an
-- album you own, and only as yourself.
-- ---------------------------------------------------------------------------

create policy posts_select on public.posts
  for select to authenticated
  using (public.can_see_album(album_id));

create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid()) and
    public.owns_album(album_id)
  );

create policy posts_update on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy posts_delete on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- likes
-- ---------------------------------------------------------------------------

create policy likes_select on public.likes
  for select to authenticated
  using (public.can_see_post(post_id));

create policy likes_insert on public.likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and
    public.can_see_post(post_id)
  );

create policy likes_delete on public.likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- comments: authors edit their own; the post's author may also delete, which
-- is the moderation hook Apple expects for user-generated content.
-- ---------------------------------------------------------------------------

create policy comments_select on public.comments
  for select to authenticated
  using (public.can_see_post(post_id));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid()) and
    public.can_see_post(post_id)
  );

create policy comments_update on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy comments_delete on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid()) or
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- album_reads and push_tokens: strictly private to the owning user.
-- ---------------------------------------------------------------------------

create policy album_reads_all on public.album_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_tokens_all on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

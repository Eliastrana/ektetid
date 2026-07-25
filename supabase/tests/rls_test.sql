-- RLS regression test.
--
-- There is no application server, so these policies are the entire
-- authorization model. This asserts the friends-only rule actually holds:
-- a friend sees your album, a stranger sees nothing and cannot write to it.
--
-- Run with:  supabase test db   (or pipe into psql inside the db container)
-- The whole thing runs in a transaction and rolls back.

begin;

-- ---------------------------------------------------------------------------
-- fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com',   'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',     'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'mallory@example.com', 'authenticated', 'authenticated');

-- handle_new_user() should have created a profile for each.
do $$
begin
  if (select count(*) from public.profiles) <> 3 then
    raise exception 'expected 3 auto-created profiles, got %', (select count(*) from public.profiles);
  end if;
end $$;

-- Alice and Bob are friends. Mallory is not.
insert into public.friendships (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'accepted');

-- ---------------------------------------------------------------------------
-- Alice creates an album and a post, as herself
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.albums (id, owner_id, title, description)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'Sommer 2026', 'Ekte øyeblikk');

insert into public.posts (id, album_id, author_id, image_path, title, luminance)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111/photo.jpg',
        'Første bilde', 0.8);

-- position should have been auto-assigned to 0 by the trigger
do $$
begin
  if (select position from public.posts
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 0 then
    raise exception 'expected auto-assigned position 0';
  end if;
end $$;

-- create_post() appends without the caller supplying a position.
do $$
declare created public.posts;
begin
  created := public.create_post(
    p_album_id   => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    p_image_path => '11111111-1111-1111-1111-111111111111/second.jpg',
    p_title      => 'Andre bilde',
    p_luminance  => 0.2
  );
  if created.position <> 1 then
    raise exception 'create_post should have appended at position 1, got %', created.position;
  end if;
  if created.author_id <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'create_post set the wrong author';
  end if;
end $$;

-- Keep the rest of the assertions working against a single post.
delete from public.posts where title = 'Andre bilde';

-- ---------------------------------------------------------------------------
-- Bob is a friend: he sees the album, the post, and an unseen count
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  n integer;
  unseen integer;
begin
  select count(*) into n from public.albums;
  if n <> 1 then raise exception 'friend should see 1 album, saw %', n; end if;

  select count(*) into n from public.posts;
  if n <> 1 then raise exception 'friend should see 1 post, saw %', n; end if;

  select unseen_count into unseen from public.album_feed
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if unseen <> 1 then raise exception 'friend should have 1 unseen post, got %', unseen; end if;
end $$;

-- Bob can like a post he can see.
insert into public.likes (post_id, user_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222');

-- Reading the album drops the unseen count to zero.
insert into public.album_reads (user_id, album_id, last_seen_position)
values ('22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0);

do $$
declare unseen integer;
begin
  select unseen_count into unseen from public.album_feed
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if unseen <> 0 then raise exception 'expected 0 unseen after reading, got %', unseen; end if;
end $$;

-- Bob may not write into Alice's album.
do $$
begin
  begin
    insert into public.posts (album_id, author_id, image_path)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '22222222-2222-2222-2222-222222222222', 'x/y.jpg');
    raise exception 'LEAK: a friend inserted a post into someone else''s album';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Mallory is a stranger: she sees nothing and can write nothing
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 0 then raise exception 'LEAK: stranger saw % album(s)', n; end if;

  select count(*) into n from public.posts;
  if n <> 0 then raise exception 'LEAK: stranger saw % post(s)', n; end if;

  select count(*) into n from public.album_feed;
  if n <> 0 then raise exception 'LEAK: stranger saw % album_feed row(s)', n; end if;

  select count(*) into n from public.comments;
  if n <> 0 then raise exception 'LEAK: stranger saw % comment(s)', n; end if;

  select count(*) into n from public.likes;
  if n <> 0 then raise exception 'LEAK: stranger saw % like(s)', n; end if;

  -- friendship edges she is not part of
  select count(*) into n from public.friendships;
  if n <> 0 then raise exception 'LEAK: stranger saw % friendship edge(s)', n; end if;
end $$;

do $$
begin
  begin
    insert into public.likes (post_id, user_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '33333333-3333-3333-3333-333333333333');
    raise exception 'LEAK: stranger liked an invisible post';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.comments (post_id, author_id, body)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '33333333-3333-3333-3333-333333333333', 'hei');
    raise exception 'LEAK: stranger commented on an invisible post';
  exception when insufficient_privilege then null;
  end;

  -- impersonation: claiming to be Alice in the row payload
  begin
    insert into public.albums (owner_id, title)
    values ('11111111-1111-1111-1111-111111111111', 'kapret');
    raise exception 'LEAK: stranger created an album owned by someone else';
  exception when insufficient_privilege then null;
  end;

  -- create_post() must not become a way around the posts_insert policy
  begin
    perform public.create_post(
      p_album_id   => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_image_path => '33333333-3333-3333-3333-333333333333/x.jpg'
    );
    raise exception 'LEAK: stranger published into someone else''s album via create_post';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Blocking hides the profile
-- ---------------------------------------------------------------------------

reset role;
insert into public.friendships (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
        'blocked');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'LEAK: blocked user still sees the blocker''s profile'; end if;
end $$;

reset role;

do $$
begin
  raise notice 'RLS test passed';
end $$;

rollback;

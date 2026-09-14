-- Friendship lifecycle test.
--
-- The whole product promise is "only the friends you approve". The risky edge
-- is the pending state: a request that has been sent but not accepted must grant
-- nothing. This walks the full transition and asserts access at each step.

begin;

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',   'authenticated', 'authenticated');

-- Alice publishes an album.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.albums (id, owner_id, title)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111', 'Sommer 2026');

insert into public.posts (id, album_id, author_id, image_path, position)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111/a.jpg', 0);

-- ---------------------------------------------------------------------------
-- Bob sends a request. It is pending, and grants nothing.
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into public.friendships (requester_id, addressee_id)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111');

do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 0 then
    raise exception 'LEAK: a pending request already grants album access (% rows)', n;
  end if;

  select count(*) into n from public.posts;
  if n <> 0 then
    raise exception 'LEAK: a pending request already grants post access (% rows)', n;
  end if;

  -- ...but he can see his own outgoing edge, or the UI could not show "sent".
  select count(*) into n from public.friendships;
  if n <> 1 then raise exception 'requester should see their own request'; end if;
end $$;

-- A requester must not be able to accept on the addressee's behalf.
do $$
begin
  begin
    update public.friendships
       set status = 'accepted'
     where requester_id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then null;
  end;

  if (select count(*) from public.albums) > 0 then
    raise exception 'LEAK: requester self-accepted into album access';
  end if;
end $$;

-- Nor may anyone insert an edge that is already accepted.
do $$
begin
  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values ('22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', 'accepted');
    raise exception 'LEAK: inserted a pre-accepted friendship without consent';
  exception when insufficient_privilege or unique_violation then null;
  end;

  if (select count(*) from public.albums) > 0 then
    raise exception 'LEAK: forged accepted edge granted album access';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Alice accepts. Access opens.
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

update public.friendships
   set status = 'accepted'
 where requester_id = '22222222-2222-2222-2222-222222222222'
   and addressee_id = '11111111-1111-1111-1111-111111111111';

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 1 then raise exception 'accepted friend should see 1 album, saw %', n; end if;
end $$;

-- Bob can now like and comment.
insert into public.likes (post_id, user_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222');

insert into public.comments (post_id, author_id, body)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222', 'Digger dette!');

-- Alice sees the comment on her own post.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.comments;
  if n <> 1 then raise exception 'author should see 1 comment, saw %', n; end if;
  select count(*) into n from public.likes;
  if n <> 1 then raise exception 'author should see 1 like, saw %', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Unfriending revokes access again.
-- ---------------------------------------------------------------------------

delete from public.friendships
 where requester_id = '22222222-2222-2222-2222-222222222222'
   and addressee_id = '11111111-1111-1111-1111-111111111111';

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 0 then raise exception 'LEAK: removed friend still sees % album(s)', n; end if;

  select count(*) into n from public.comments;
  if n <> 0 then raise exception 'LEAK: removed friend still sees % comment(s)', n; end if;
end $$;

reset role;

do $$
begin
  raise notice 'Friendship lifecycle test passed';
end $$;

rollback;

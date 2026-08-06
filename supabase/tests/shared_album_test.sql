-- Shared album test.
--
-- Sharing widens who can see an album, so the exact boundary matters. The
-- cast:
--
--   alice  owns the album
--   bob    is alice's friend, and a collaborator
--   carol  is bob's friend but NOT alice's — she should see the album purely
--          because bob collaborates on it
--   dave   is nobody's friend and should see nothing
--
-- Carol is the interesting one: she is the widened visibility, and if the rule
-- is wrong she is either wrongly excluded or the album leaks to strangers.

begin;

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@x.no', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@x.no',   'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'carol@x.no', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'dave@x.no',  'authenticated', 'authenticated');

insert into public.friendships (requester_id, addressee_id, status) values
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','accepted'),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','accepted');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.albums (id, owner_id, title)
values ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','Tur');

insert into public.posts (id, album_id, author_id, image_path, position) values
 ('b0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a',
  '11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111/1.jpg',0);

-- Before sharing, carol sees nothing: she is not alice's friend.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.albums) <> 0 then
    raise exception 'LEAK: friend-of-a-non-member saw the album before sharing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Alice shares with bob
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ...but may not add someone she is not friends with.
do $$
begin
  begin
    insert into public.album_members (album_id, user_id, added_by)
    values ('aaaaaaaa-0000-0000-0000-00000000000a',
            '44444444-4444-4444-4444-444444444444',
            '11111111-1111-1111-1111-111111111111');
    raise exception 'LEAK: added a non-friend as collaborator';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into public.album_members (album_id, user_id, added_by)
values ('aaaaaaaa-0000-0000-0000-00000000000a',
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- Bob can contribute, and his post keeps his own authorship
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 1 then raise exception 'collaborator should see the album, saw %', n; end if;
end $$;

insert into public.posts (id, album_id, author_id, image_path, position)
values ('b0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-00000000000a',
        '22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222/2.jpg',1);

do $$
begin
  if (select author_id from public.posts where id = 'b0000000-0000-0000-0000-00000000000b')
     <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'collaborator post lost its own authorship';
  end if;
end $$;

-- A member may delete another member's post: the chosen model is equal power.
do $$
begin
  delete from public.posts where id = 'b0000000-0000-0000-0000-00000000000a';
  if not found then
    raise exception 'member could not delete another member''s post';
  end if;
end $$;

-- A collaborator may not invite further collaborators.
do $$
begin
  begin
    insert into public.album_members (album_id, user_id, added_by)
    values ('aaaaaaaa-0000-0000-0000-00000000000a',
            '33333333-3333-3333-3333-333333333333',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'LEAK: collaborator invited another collaborator';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Carol sees it through bob; dave still sees nothing
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 1 then
    raise exception 'friend of a collaborator should see the shared album, saw %', n;
  end if;
end $$;

-- ...but carol is not a member and may not write to it.
do $$
begin
  begin
    insert into public.posts (album_id, author_id, image_path, position)
    values ('aaaaaaaa-0000-0000-0000-00000000000a',
            '33333333-3333-3333-3333-333333333333','33333333-3333-3333-3333-333333333333/x.jpg',9);
    raise exception 'LEAK: a viewer wrote into a shared album';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$
declare n integer;
begin
  select count(*) into n from public.albums;
  if n <> 0 then raise exception 'LEAK: stranger saw % shared album(s)', n; end if;
  select count(*) into n from public.album_members;
  if n <> 0 then raise exception 'LEAK: stranger saw the membership list'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: album visibility applies to every object in the album, regardless
-- of who uploaded it. Carol is Bob's friend but not Alice's, so Alice's photo
-- is the important regression case.
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.posts (id, album_id, author_id, image_path, position) values
 ('b0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-00000000000a',
  '11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111/1.jpg',0);

insert into storage.objects (bucket_id, name, owner)
values ('photos','11111111-1111-1111-1111-111111111111/1.jpg',
        '11111111-1111-1111-1111-111111111111');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  if (select count(*) from storage.objects where bucket_id='photos') <> 1 then
    raise exception 'collaborator cannot load a co-member''s photo';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
begin
  if (select count(*) from storage.objects where bucket_id='photos') <> 1 then
    raise exception 'friend of collaborator cannot load another member''s photo';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$
begin
  if (select count(*) from storage.objects where bucket_id='photos') <> 0 then
    raise exception 'LEAK: stranger can load photos from a shared album';
  end if;
end $$;

-- Restore the two-post fixture expected by the reorder assertions below.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.posts
 where id = 'b0000000-0000-0000-0000-00000000000d';

-- ---------------------------------------------------------------------------
-- Reordering
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into public.posts (id, album_id, author_id, image_path, position) values
 ('b0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-00000000000a',
  '22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222/3.jpg',2);

-- Reverse the two remaining posts.
select public.reorder_album(
  'aaaaaaaa-0000-0000-0000-00000000000a',
  array['b0000000-0000-0000-0000-00000000000c','b0000000-0000-0000-0000-00000000000b']::uuid[]
);

do $$
declare first_id uuid;
begin
  select id into first_id from public.posts
   where album_id = 'aaaaaaaa-0000-0000-0000-00000000000a' order by position limit 1;
  if first_id <> 'b0000000-0000-0000-0000-00000000000c' then
    raise exception 'reorder did not take effect, first is %', first_id;
  end if;

  if exists (select 1 from public.posts
              where album_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
                and position >= 1000000) then
    raise exception 'reorder left posts parked at the offset';
  end if;
end $$;

reset role;

do $$
begin
  raise notice 'Shared album test passed';
end $$;

rollback;

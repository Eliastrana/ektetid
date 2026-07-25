-- Storage RLS regression test.
--
-- Photo bytes are guarded by path convention: '{author_id}/{uuid}.jpg'. The
-- policies in 0004_storage.sql derive the owner from the first path segment,
-- so this asserts that convention actually holds up against a stranger.

begin;

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com',   'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',     'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'mallory@example.com', 'authenticated', 'authenticated');

insert into public.friendships (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'accepted');

-- ---------------------------------------------------------------------------
-- Alice uploads into her own folder
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into storage.objects (bucket_id, name, owner)
values ('photos',
        '11111111-1111-1111-1111-111111111111/photo.jpg',
        '11111111-1111-1111-1111-111111111111');

do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'photos') <> 1 then
    raise exception 'owner should see their own object';
  end if;
end $$;

-- She may not write into someone else's folder.
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('photos',
            '22222222-2222-2222-2222-222222222222/stolen.jpg',
            '11111111-1111-1111-1111-111111111111');
    raise exception 'LEAK: wrote into another user''s storage folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Bob is a friend: he can read the bytes
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'photos') <> 1 then
    raise exception 'friend should be able to read the photo';
  end if;
end $$;

-- ...but not modify it. (Delete cannot be exercised here: Supabase installs a
-- storage.protect_delete() trigger that blocks direct SQL deletes on
-- storage.objects regardless of policy, so this asserts the update path.)
do $$
begin
  update storage.objects
     set name = '22222222-2222-2222-2222-222222222222/stolen.jpg'
   where name = '11111111-1111-1111-1111-111111111111/photo.jpg';
  if found then
    raise exception 'LEAK: friend modified someone else''s photo object';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Mallory is a stranger: the bytes do not exist for her
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from storage.objects where bucket_id = 'photos';
  if n <> 0 then raise exception 'LEAK: stranger can read % photo object(s)', n; end if;
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('photos',
            '11111111-1111-1111-1111-111111111111/forged.jpg',
            '33333333-3333-3333-3333-333333333333');
    raise exception 'LEAK: stranger wrote into another user''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
begin
  raise notice 'Storage RLS test passed';
end $$;

rollback;

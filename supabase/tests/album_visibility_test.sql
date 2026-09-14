-- A rewritten albums_select must not widen who can see an album.
begin;
set local role postgres;

insert into auth.users (id, email) values
  ('e1e1e1e1-0000-0000-0000-000000000001', 'visowner@test.no'),
  ('f2f2f2f2-0000-0000-0000-000000000002', 'visfriend@test.no'),
  ('a3a3a3a3-0000-0000-0000-000000000003', 'visstranger@test.no');

insert into public.friendships (requester_id, addressee_id, status) values
  ('e1e1e1e1-0000-0000-0000-000000000001', 'f2f2f2f2-0000-0000-0000-000000000002', 'accepted');
insert into public.albums (id, owner_id, title) values
  ('e1e1e1e1-0000-0000-0000-00000000aaaa', 'e1e1e1e1-0000-0000-0000-000000000001', 'Privat');

do $$
declare n int;
begin
  -- The stranger must see nothing.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"a3a3a3a3-0000-0000-0000-000000000003","role":"authenticated"}', true);
  select count(*) into n from public.albums
   where id = 'e1e1e1e1-0000-0000-0000-00000000aaaa';
  if n <> 0 then raise exception 'FAIL: a stranger can see the album'; end if;

  -- An accepted friend must.
  perform set_config('request.jwt.claims',
    '{"sub":"f2f2f2f2-0000-0000-0000-000000000002","role":"authenticated"}', true);
  select count(*) into n from public.albums
   where id = 'e1e1e1e1-0000-0000-0000-00000000aaaa';
  if n <> 1 then raise exception 'FAIL: a friend cannot see the album'; end if;

  -- And the owner must, including one created in this very statement.
  perform set_config('request.jwt.claims',
    '{"sub":"e1e1e1e1-0000-0000-0000-000000000001","role":"authenticated"}', true);
  select count(*) into n from public.albums
   where id = 'e1e1e1e1-0000-0000-0000-00000000aaaa';
  if n <> 1 then raise exception 'FAIL: the owner cannot see their album'; end if;

  raise notice 'OK: album visibility unchanged for owner, friend and stranger';
end $$;

-- The regression itself: insert and return in one statement.
do $$
declare created uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"e1e1e1e1-0000-0000-0000-000000000001","role":"authenticated"}', true);
  insert into public.albums (owner_id, title)
  values ('e1e1e1e1-0000-0000-0000-000000000001', 'Med returning')
  returning id into created;
  if created is null then raise exception 'FAIL: RETURNING gave nothing back'; end if;
  raise notice 'OK: a new album can be inserted and returned in one statement';
end $$;
rollback;

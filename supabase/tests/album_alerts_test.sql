-- Album alerts: only for albums you can see, private to you, and re-checked
-- at send time.
begin;
set local role postgres;

insert into auth.users (id, email) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'alertowner@test.no'),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'alertfriend@test.no'),
  ('b3b3b3b3-0000-0000-0000-000000000003', 'alertstranger@test.no');

insert into public.friendships (requester_id, addressee_id, status) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b2b2b2b2-0000-0000-0000-000000000002', 'accepted');
insert into public.albums (id, owner_id, title) values
  ('b1b1b1b1-0000-0000-0000-00000000aaaa', 'b1b1b1b1-0000-0000-0000-000000000001', 'Følg meg');

do $$
declare n int;
begin
  set local role authenticated;

  -- A stranger cannot follow an album they cannot see: a guessed id must not
  -- become a way to hear about its posts.
  perform set_config('request.jwt.claims',
    '{"sub":"b3b3b3b3-0000-0000-0000-000000000003","role":"authenticated"}', true);
  begin
    insert into public.album_alerts (user_id, album_id)
    values ('b3b3b3b3-0000-0000-0000-000000000003', 'b1b1b1b1-0000-0000-0000-00000000aaaa');
    raise exception 'FAIL: a stranger followed an album they cannot see';
  exception
    when insufficient_privilege then null;
  end;

  -- A friend can, but only for themselves.
  perform set_config('request.jwt.claims',
    '{"sub":"b2b2b2b2-0000-0000-0000-000000000002","role":"authenticated"}', true);
  begin
    insert into public.album_alerts (user_id, album_id)
    values ('b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-00000000aaaa');
    raise exception 'FAIL: a user followed an album on someone else''s behalf';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.album_alerts (user_id, album_id)
  values ('b2b2b2b2-0000-0000-0000-000000000002', 'b1b1b1b1-0000-0000-0000-00000000aaaa');

  -- Not even the album's owner learns who follows it.
  perform set_config('request.jwt.claims',
    '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}', true);
  select count(*) into n from public.album_alerts;
  if n <> 0 then
    raise exception 'FAIL: the owner can see who follows their album (% rows)', n;
  end if;

  begin
    perform public.album_alert_recipients('b1b1b1b1-0000-0000-0000-00000000aaaa');
    raise exception 'FAIL: an ordinary user can list an album''s followers';
  exception
    when insufficient_privilege then null;
  end;

  raise notice 'OK: album alerts are private and limited to visible albums';
end $$;

-- Send time, as the notify function sees it.
set local role postgres;

do $$
declare n int;
begin
  select count(*) into n
    from public.album_alert_recipients('b1b1b1b1-0000-0000-0000-00000000aaaa') r
   where r.user_id = 'b2b2b2b2-0000-0000-0000-000000000002';
  if n <> 1 then
    raise exception 'FAIL: a friend who follows the album is not a recipient';
  end if;

  -- The subscription outlives the friendship. The alert must not.
  delete from public.friendships
   where requester_id = 'b1b1b1b1-0000-0000-0000-000000000001'
     and addressee_id = 'b2b2b2b2-0000-0000-0000-000000000002';

  select count(*) into n
    from public.album_alert_recipients('b1b1b1b1-0000-0000-0000-00000000aaaa');
  if n <> 0 then
    raise exception 'FAIL: a follower who lost access is still a recipient';
  end if;

  raise notice 'OK: album alert recipients are re-checked against access';
end $$;

rollback;

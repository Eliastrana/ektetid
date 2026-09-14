-- Restaurant scores count only reviews the caller can see.
begin;
set local role postgres;

insert into auth.users (id, email) values
  ('c7c7c7c7-0000-0000-0000-000000000001', 'venueowner@test.no'),
  ('c7c7c7c7-0000-0000-0000-000000000002', 'venuefriend@test.no'),
  ('c7c7c7c7-0000-0000-0000-000000000003', 'venuestranger@test.no');

insert into public.friendships (requester_id, addressee_id, status) values
  ('c7c7c7c7-0000-0000-0000-000000000001', 'c7c7c7c7-0000-0000-0000-000000000002', 'accepted');

insert into public.albums (id, owner_id, title) values
  ('c7c7c7c7-0000-0000-0000-00000000aaaa', 'c7c7c7c7-0000-0000-0000-000000000001', 'Middager'),
  ('c7c7c7c7-0000-0000-0000-00000000bbbb', 'c7c7c7c7-0000-0000-0000-000000000003', 'Mine middager');

insert into public.posts
  (album_id, author_id, image_path, taken_at, rating,
   venue_name, venue_latitude, venue_longitude)
values
  -- Two reviews of one place by the owner, the newer with odd spacing and
  -- case, which must still count as the same restaurant.
  ('c7c7c7c7-0000-0000-0000-00000000aaaa', 'c7c7c7c7-0000-0000-0000-000000000001',
   'test/1.jpg', '2026-01-01', 6, 'Maaemo', 59.907512, 10.759701),
  ('c7c7c7c7-0000-0000-0000-00000000aaaa', 'c7c7c7c7-0000-0000-0000-000000000001',
   'test/2.jpg', '2026-02-01', 4, ' maaemo', 59.907514, 10.759698),
  -- A venue with no terningkast is not a review.
  ('c7c7c7c7-0000-0000-0000-00000000aaaa', 'c7c7c7c7-0000-0000-0000-000000000001',
   'test/3.jpg', '2026-03-01', null, 'Maaemo', 59.907512, 10.759701),
  -- The stranger's review of the same place, in an album the friend cannot see.
  ('c7c7c7c7-0000-0000-0000-00000000bbbb', 'c7c7c7c7-0000-0000-0000-000000000003',
   'test/4.jpg', '2026-01-15', 1, 'Maaemo', 59.907512, 10.759701);

do $$
declare
  n int;
  score numeric;
  total int;
  label text;
begin
  set local role authenticated;

  perform set_config('request.jwt.claims',
    '{"sub":"c7c7c7c7-0000-0000-0000-000000000002","role":"authenticated"}', true);
  select count(*) into n from public.venue_ratings();
  if n <> 1 then
    raise exception 'FAIL: expected one restaurant for the friend, got %', n;
  end if;

  select average, ratings, name into score, total, label from public.venue_ratings();
  if total <> 2 or score <> 5.0 then
    raise exception 'FAIL: the friend should see 5.0 from 2 reviews, got % from %', score, total;
  end if;
  if label <> ' maaemo' then
    raise exception 'FAIL: the place should carry its newest name, got %', label;
  end if;

  -- The stranger sees only their own review; the owner's stay out of it.
  perform set_config('request.jwt.claims',
    '{"sub":"c7c7c7c7-0000-0000-0000-000000000003","role":"authenticated"}', true);
  select average, ratings into score, total from public.venue_ratings();
  if total <> 1 or score <> 1.0 then
    raise exception 'FAIL: a stranger''s score includes reviews they cannot see (% from %)', score, total;
  end if;

  raise notice 'OK: venue ratings follow post visibility';
end $$;

rollback;

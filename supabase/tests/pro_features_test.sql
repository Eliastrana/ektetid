-- Pro feature authorization regression test.

begin;

insert into auth.users (id, email, aud, role) values
  ('51111111-1111-1111-1111-111111111111', 'pro-owner@x.no', 'authenticated', 'authenticated'),
  ('52222222-2222-2222-2222-222222222222', 'free-owner@x.no', 'authenticated', 'authenticated');

insert into public.pro_entitlements (user_id, source)
values ('51111111-1111-1111-1111-111111111111', 'activity');

insert into public.friendships (requester_id, addressee_id, status)
values (
  '51111111-1111-1111-1111-111111111111',
  '52222222-2222-2222-2222-222222222222',
  'accepted'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"51111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.albums (id, owner_id, title) values
  ('5aaaaaaa-0000-0000-0000-000000000001',
   '51111111-1111-1111-1111-111111111111', 'Pro-album');

insert into public.posts (id, album_id, author_id, image_path, title, taken_at, position) values
  ('5bbbbbbb-0000-0000-0000-000000000001',
   '5aaaaaaa-0000-0000-0000-000000000001',
   '51111111-1111-1111-1111-111111111111',
   '51111111-1111-1111-1111-111111111111/pro.jpg', 'Minne', '2024-08-17', 0);

select public.update_album_customization(
  '5aaaaaaa-0000-0000-0000-000000000001',
  '5bbbbbbb-0000-0000-0000-000000000001',
  '#3B82F6',
  'editorial'
);

insert into public.album_members (album_id, user_id, added_by) values (
  '5aaaaaaa-0000-0000-0000-000000000001',
  '52222222-2222-2222-2222-222222222222',
  '51111111-1111-1111-1111-111111111111'
);

do $$
declare
  cover uuid;
  accent text;
  layout text;
  memory_count integer;
begin
  select cover_post_id, accent_color, cover_layout
    into cover, accent, layout
    from public.album_feed
   where id = '5aaaaaaa-0000-0000-0000-000000000001';

  if cover <> '5bbbbbbb-0000-0000-0000-000000000001'
     or accent <> '#3B82F6'
     or layout <> 'editorial' then
    raise exception 'saved album customization did not reach album_feed';
  end if;

  select count(*) into memory_count from public.pro_memories();
  if memory_count <> 1 then
    raise exception 'Pro owner should receive exactly their own memory, got %', memory_count;
  end if;
end $$;

-- An already-installed client can still submit the retired palette and split
-- preset while the new build rolls out. The RPC must translate, not reject it.
select public.update_album_customization(
  '5aaaaaaa-0000-0000-0000-000000000001',
  '5bbbbbbb-0000-0000-0000-000000000001',
  '#8fb8ff',
  'split'
);

do $$
begin
  if not exists (
    select 1 from public.albums
    where id = '5aaaaaaa-0000-0000-0000-000000000001'
      and accent_color = '#3B82F6'
      and cover_layout = 'editorial'
  ) then
    raise exception 'legacy album customization was not normalized';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"52222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into public.albums (id, owner_id, title) values
  ('5aaaaaaa-0000-0000-0000-000000000002',
   '52222222-2222-2222-2222-222222222222', 'Gratis-album');

insert into public.posts (id, album_id, author_id, image_path, position) values
  ('5bbbbbbb-0000-0000-0000-000000000002',
   '5aaaaaaa-0000-0000-0000-000000000002',
   '52222222-2222-2222-2222-222222222222',
   '52222222-2222-2222-2222-222222222222/free.jpg', 0);

do $$
begin
  begin
    perform public.pro_memories();
    raise exception 'LEAK: free user read the Pro memories endpoint';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.update_album_customization(
      '5aaaaaaa-0000-0000-0000-000000000002',
      '5bbbbbbb-0000-0000-0000-000000000002',
      '#FF6B4A',
      'framed'
    );
    raise exception 'LEAK: free user customized an album';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.update_album_customization(
      '5aaaaaaa-0000-0000-0000-000000000001',
      null,
      '#9B5CFF',
      'full'
    );
    raise exception 'LEAK: non-owner customized a Pro album';
  exception when insufficient_privilege then null;
  end;

  -- Collaborators can delete posts in a shared album. If the post was the
  -- selected cover, the foreign key must be able to clear the cover without
  -- turning that otherwise-valid delete into a Pro ownership error.
  delete from public.posts
   where id = '5bbbbbbb-0000-0000-0000-000000000001';
  if not found then
    raise exception 'collaborator could not delete the selected cover post';
  end if;

  if (select cover_post_id from public.albums
       where id = '5aaaaaaa-0000-0000-0000-000000000001') is not null then
    raise exception 'deleting the selected post did not clear cover_post_id';
  end if;
end $$;

reset role;

do $$
begin
  raise notice 'Pro features test passed';
end $$;

rollback;

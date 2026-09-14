-- Notification preferences are private.
--
-- The Edge Function reads this table with the service role to decide who to
-- notify, so it deliberately sees everyone. Nothing else should: a user's
-- preferences say something about them, and one account must not be able to
-- read or rewrite another's.

begin;
set local role postgres;

insert into auth.users (id, email) values
  ('c1c1c1c1-0000-0000-0000-000000000001', 'prefsone@test.no'),
  ('d2d2d2d2-0000-0000-0000-000000000002', 'prefstwo@test.no');

insert into public.notification_prefs (user_id, likes) values
  ('c1c1c1c1-0000-0000-0000-000000000001', true);

-- Act as the *other* user throughout.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d2d2d2d2-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare
  visible int;
  updated int;
begin
  select count(*) into visible from public.notification_prefs
   where user_id = 'c1c1c1c1-0000-0000-0000-000000000001';
  if visible <> 0 then
    raise exception 'FAIL: a stranger can read another user''s notification preferences (% rows)', visible;
  end if;

  -- Silently affecting nothing is the correct outcome for an update the policy
  -- filters out; the danger would be a row actually changing.
  update public.notification_prefs set likes = false
   where user_id = 'c1c1c1c1-0000-0000-0000-000000000001';
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'FAIL: a stranger rewrote another user''s preferences (% rows)', updated;
  end if;

  -- Inserting a row *as* someone else must be refused outright.
  begin
    insert into public.notification_prefs (user_id, likes)
    values ('c1c1c1c1-0000-0000-0000-000000000001', false);
    raise exception 'FAIL: a stranger inserted preferences for another user';
  exception
    when insufficient_privilege then null;
  end;

  -- And a user manages their own without trouble.
  insert into public.notification_prefs (user_id, friend_posts)
  values ('d2d2d2d2-0000-0000-0000-000000000002', false);

  select count(*) into visible from public.notification_prefs;
  if visible <> 1 then
    raise exception 'FAIL: expected to see exactly own row, saw %', visible;
  end if;

  raise notice 'OK: notification preferences are private to their owner';
end $$;

rollback;

-- Seed the account App Review signs in with.
--
-- Run this in the Supabase SQL editor (which runs as postgres and so is not
-- subject to RLS) *after* creating the user under Authentication → Add user,
-- with a password and "Auto Confirm User" ticked.
--
-- What it does: gives the demo account a real username, and makes it an
-- accepted friend of your own account. That second part is the whole point —
-- visibility in this app resolves through accepted friendships, so without it
-- a reviewer signs in to an empty grid and has nothing to review.
--
-- Idempotent: safe to run twice.

do $$
declare
  -- ── edit these two ────────────────────────────────────────────────────────
  demo_email constant text := 'demo@ektetid.no';
  own_email  constant text := 'elias@sneii.no';
  -- ──────────────────────────────────────────────────────────────────────────

  demo_id uuid;
  own_id  uuid;
begin
  -- Both looked up by email because that is what the dashboard's user list
  -- shows, so the two constants can be copied straight off that screen.
  select id into demo_id from auth.users where email = demo_email;
  if demo_id is null then
    raise exception
      'No auth user with email %. Create it under Authentication → Add user first.',
      demo_email;
  end if;

  select id into own_id from auth.users where email = own_email;
  if own_id is null then
    raise exception 'No auth user with email %.', own_email;
  end if;

  -- A provisional bruker_… username would send the reviewer through the
  -- username picker before they ever see the app.
  update public.profiles
     set username     = 'demo',
         display_name = 'Demo'
   where id = demo_id;

  -- Every other edge goes first, so that changing own_email *moves* the demo
  -- account rather than adding to it. Without this, re-running against a new
  -- address leaves the old friendship in place and the reviewer sees both
  -- accounts' photos — including those of an account you meant to drop.
  delete from public.friendships
   where (requester_id = demo_id or addressee_id = demo_id)
     and not (requester_id = own_id and addressee_id = demo_id);

  -- are_friends() checks both directions, so one row in either direction is
  -- enough. Inserted as though you sent the request and the demo user accepted.
  insert into public.friendships (requester_id, addressee_id, status)
  values (own_id, demo_id, 'accepted')
  on conflict (requester_id, addressee_id)
    do update set status = 'accepted';

  raise notice 'Demo account % is now an accepted friend of %.', demo_email, own_email;
end;
$$;

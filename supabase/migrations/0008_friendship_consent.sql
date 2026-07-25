-- Fix: friendship acceptance had no consent check.
--
-- Two holes in 0003_rls.sql, either of which let anyone read a stranger's
-- private albums without that person ever being involved:
--
--   1. friendships_insert constrained only requester_id, not status. An
--      attacker could insert a row already marked 'accepted', and
--      are_friends() would immediately return true.
--
--   2. friendships_update allowed either party to write. The requester could
--      therefore accept their own pending request. It also permitted rewriting
--      requester_id, so an addressee could forge an accepted edge naming any
--      victim as the requester.
--
-- The rule that should always have held: only the addressee turns a request
-- into a friendship, and nobody may rewrite who the parties are.

-- 1. A request may only be created as pending, or as a block.
drop policy if exists friendships_insert on public.friendships;

create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and
    status in ('pending', 'blocked') and
    not public.is_blocked((select auth.uid()), addressee_id)
  );

-- 2. Only the addressee may act on a request, and only on `status` —
--    the column grant below is what stops the parties being rewritten.
drop policy if exists friendships_update on public.friendships;

create policy friendships_update on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));

revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- A requester who wants out deletes their edge (friendships_delete already
-- allows either party), and blocking is a delete followed by a fresh insert.

-- ---------------------------------------------------------------------------
-- Pro follows the buyer, not the account that happened to purchase
-- ---------------------------------------------------------------------------
--
-- Apple sells a non-consumable to an Apple ID, once and for all: the same Apple
-- ID can never buy it a second time. Binding the entitlement to whichever
-- EkteTid account was signed in at purchase time therefore stranded anyone who
-- later switched accounts, with no way back.
--
-- A purchase can now be claimed by whichever account restores it. One purchase
-- still grants exactly one entitlement -- claiming hands it over rather than
-- copying it, so the row moves and never multiplies.
--
-- Both statements live in one function so the hand-over is atomic. Split across
-- two round trips, a failure between them would leave the previous owner
-- stripped of Pro and the new one without it.
create or replace function public.claim_pro_entitlement(
  p_user_id uuid,
  p_transaction_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.pro_entitlements
  where transaction_id = p_transaction_id
    and user_id <> p_user_id;

  insert into public.pro_entitlements (user_id, source, transaction_id)
  values (p_user_id, 'purchase', p_transaction_id)
  on conflict (user_id) do update
    set source = 'purchase',
        transaction_id = excluded.transaction_id,
        granted_at = now();
end;
$$;

-- Only the verifier may grant Pro. It runs as service_role, which bypasses this
-- grant; every client-facing role must be locked out, or a signed-in user could
-- award themselves the entitlement by calling the function directly.
revoke all on function public.claim_pro_entitlement(uuid, text) from public;
revoke all on function public.claim_pro_entitlement(uuid, text) from anon, authenticated;

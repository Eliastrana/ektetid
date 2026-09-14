-- Web push subscriptions, for the browser build.
--
-- Deliberately not part of push_tokens. An Expo token is one opaque string that
-- Expo resolves to a device; a Web Push subscription is an endpoint URL owned by
-- the browser vendor plus two keys used to encrypt the payload, and it is
-- delivered by POSTing to that endpoint rather than through anyone's API. The
-- two share a purpose and nothing else, and squeezing both into one table would
-- mean columns that are always null for one of them.

create table public.web_push_subscriptions (
  -- The endpoint identifies the subscription. A browser hands back the same one
  -- until permission is revoked or the subscription is replaced, so it is both
  -- the natural key and what makes re-subscribing idempotent.
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,

  -- The user agent's public key and auth secret, base64url as the browser gives
  -- them. Together with an ephemeral key they derive the content encryption key
  -- for each message; without them a push can carry no payload.
  p256dh     text not null,
  auth       text not null,

  created_at timestamptz not null default now()
);

create index web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

-- Only ever your own. The function that sends uses the service role and so is
-- not subject to these.
create policy web_push_select on public.web_push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy web_push_insert on public.web_push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy web_push_update on public.web_push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy web_push_delete on public.web_push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.web_push_subscriptions is
  'Browser push endpoints. Rows disappear with the account through the profiles cascade.';

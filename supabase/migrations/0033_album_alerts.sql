-- ---------------------------------------------------------------------------
-- Alerts for one album
--
-- The broad switches in notification_prefs are all-or-nothing: "Nye øyeblikk"
-- covers every friend's every post. Following an album is the opposite — one
-- album, chosen by hand — so someone can mute friend posts entirely and still
-- hear the moment anything lands in the album they care about.
--
-- A row means "tell me". There is no off row; turning alerts off deletes it.
-- ---------------------------------------------------------------------------

create table public.album_alerts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  album_id   uuid not null references public.albums (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, album_id)
);

-- The notify function looks followers up by album, never by user.
create index album_alerts_album_idx on public.album_alerts (album_id);

alter table public.album_alerts enable row level security;
grant select, insert, delete on public.album_alerts to authenticated;
revoke all on public.album_alerts from anon;

-- What you follow says something about you. Nobody else reads it.
create policy album_alerts_select on public.album_alerts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only an album you can already see. Otherwise a guessed album id would be a
-- way to be told about posts in an album you have no access to.
create policy album_alerts_insert on public.album_alerts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_see_album(album_id)
  );

create policy album_alerts_delete on public.album_alerts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Who to tell, decided at send time.
--
-- A row stays behind when a friendship ends, so the subscription alone proves
-- nothing about access today. This repeats can_see_album for an arbitrary user
-- rather than for auth.uid(): the notify function runs as the service role,
-- which has no uid of its own to ask about.
--
-- Keep the two in step. If can_see_album grows a new route to an album, this
-- has to learn it too, or followers on that route are silently never told.
-- ---------------------------------------------------------------------------

create or replace function public.album_alert_recipients(p_album uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select aa.user_id
  from public.album_alerts aa
  where aa.album_id = p_album
    and (
      exists (
        select 1 from public.albums al
        where al.id = p_album
          and (al.owner_id = aa.user_id or public.are_friends(aa.user_id, al.owner_id))
      )
      or exists (
        select 1 from public.album_members m
        where m.album_id = p_album
          and (m.user_id = aa.user_id or public.are_friends(aa.user_id, m.user_id))
      )
    );
$$;

-- Service role only. For anyone else it would list who follows an album.
revoke all on function public.album_alert_recipients(uuid) from public, anon, authenticated;
grant execute on function public.album_alert_recipients(uuid) to service_role;

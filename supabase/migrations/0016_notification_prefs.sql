-- Per-user notification preferences.
--
-- A missing row means "everything at its default", so nothing has to be
-- backfilled and a new account needs no write before it can be notified. The
-- Edge Function reads this with the service role and falls back to these same
-- defaults when the row is absent.

create table public.notification_prefs (
  user_id            uuid primary key references public.profiles (id) on delete cascade,

  -- Low volume and dead-ended without a nudge: an unanswered request is
  -- invisible, and the sender never learns they were accepted.
  friend_requests    boolean not null default true,

  -- Someone is waiting for a reply.
  comments           boolean not null default true,

  -- The reason shared albums are worth having. A collaborator otherwise has no
  -- way to learn that something appeared in an album they contribute to.
  shared_album_posts boolean not null default true,

  -- The app's heartbeat, and the first thing to become noise as the friend
  -- list grows.
  friend_posts       boolean not null default true,

  -- Off by default. High volume, almost no information, and the first thing
  -- people mute.
  likes              boolean not null default false,

  updated_at         timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
grant select, insert, update on public.notification_prefs to authenticated;
revoke all on public.notification_prefs from anon;

create policy notification_prefs_select on public.notification_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_prefs_insert on public.notification_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy notification_prefs_update on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger notification_prefs_touch
  before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

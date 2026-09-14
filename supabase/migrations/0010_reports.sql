-- Content reporting.
--
-- App Store guideline 1.2 requires apps with user-generated content to offer a
-- way to report objectionable material, a way to block abusive users, and for
-- the developer to act on reports. Blocking already exists through the
-- friendships table; this adds the reporting half.
--
-- Reports are deliberately write-mostly from the client: a reporter can file
-- one and see their own, but nobody can read anyone else's. Moderation happens
-- out of band with the service role, so a reporter cannot learn who else has
-- reported whom.

create type report_reason as enum (
  'spam',
  'harassment',
  'nudity',
  'violence',
  'other'
);

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  post_id          uuid references public.posts (id) on delete cascade,
  comment_id       uuid references public.comments (id) on delete cascade,
  reason           report_reason not null,
  details          text,
  resolved         boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint no_self_report check (reporter_id <> reported_user_id),
  constraint details_length check (details is null or length(details) <= 1000)
);

create index reports_open_idx on public.reports (created_at desc) where not resolved;

alter table public.reports enable row level security;

grant select, insert on public.reports to authenticated;

create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

revoke all on public.reports from anon;

-- EkteTid core schema.
--
-- Shape carried over from the original Sanity dataset: an album owns an ordered
-- list of posts, and a post is a photo + a selfie + the story around it. What is
-- new is that every row belongs to a user, and visibility runs through the
-- friendship graph.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     citext not null unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

comment on table public.profiles is 'Public-facing identity, one row per auth user.';

-- ---------------------------------------------------------------------------
-- friendships
--
-- One row per pair, stored in a canonical direction (requester -> addressee).
-- Reciprocity is resolved by are_friends() rather than by storing two rows.
-- ---------------------------------------------------------------------------

create type friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (requester_id, addressee_id),
  constraint no_self_friendship check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id, status);

-- ---------------------------------------------------------------------------
-- albums
-- ---------------------------------------------------------------------------

create table public.albums (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint title_not_blank check (length(btrim(title)) > 0)
);

create index albums_owner_idx on public.albums (owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- posts
--
-- image_path / selfie_path are Storage object paths, not URLs. They are always
-- '{author_id}/{uuid}.jpg' so the Storage RLS policy can derive the owner from
-- the first path segment.
--
-- luminance is the mean brightness (0..1) of the top quarter of the photo,
-- computed once at upload. The web app recomputed this on a canvas on every
-- view just to decide between black and white overlay text.
-- ---------------------------------------------------------------------------

create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albums (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  image_path  text not null,
  selfie_path text,
  title       text,
  description text,
  location    text,
  taken_at    timestamptz not null default now(),
  exif        jsonb,
  blurhash    text,
  luminance   real,
  position    integer not null,
  created_at  timestamptz not null default now(),

  constraint luminance_range check (luminance is null or (luminance >= 0 and luminance <= 1)),
  unique (album_id, position)
);

create index posts_album_idx on public.posts (album_id, position);
create index posts_author_idx on public.posts (author_id, taken_at desc);

-- ---------------------------------------------------------------------------
-- likes
--
-- Replaces the `hearts` integer on the Sanity document. One row per user per
-- post makes "have I liked this" server truth instead of a localStorage guess.
-- ---------------------------------------------------------------------------

create table public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, user_id)
);

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),

  constraint body_not_blank check (length(btrim(body)) between 1 and 2000)
);

create index comments_post_idx on public.comments (post_id, created_at desc);

-- ---------------------------------------------------------------------------
-- album_reads
--
-- Replaces localStorage['album_<id>_index']. Read position now follows the user
-- across devices, which is what drives the unseen-count badge on the grid.
-- ---------------------------------------------------------------------------

create table public.album_reads (
  user_id            uuid not null references public.profiles (id) on delete cascade,
  album_id           uuid not null references public.albums (id) on delete cascade,
  last_seen_position integer not null default -1,
  updated_at         timestamptz not null default now(),

  primary key (user_id, album_id)
);

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

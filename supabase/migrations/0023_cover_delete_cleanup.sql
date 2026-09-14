-- A selected cover may be deleted by an album collaborator. PostgreSQL clears
-- albums.cover_post_id through the foreign key's ON DELETE SET NULL action;
-- permit only that nested cleanup while keeping direct customization Pro-only.

create or replace function public.protect_album_customization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.cover_post_id is not distinct from old.cover_post_id
     and new.accent_color is not distinct from old.accent_color
     and new.cover_layout is not distinct from old.cover_layout then
    return new;
  end if;

  if pg_trigger_depth() > 1
     and old.cover_post_id is not null
     and new.cover_post_id is null
     and new.accent_color is not distinct from old.accent_color
     and new.cover_layout is not distinct from old.cover_layout then
    return new;
  end if;

  if old.owner_id <> (select auth.uid())
     or not public.has_pro((select auth.uid())) then
    raise exception 'Album customization requires Pro and album ownership'
      using errcode = '42501';
  end if;

  if new.cover_post_id is not null and not exists (
    select 1
    from public.posts p
    where p.id = new.cover_post_id and p.album_id = new.id
  ) then
    raise exception 'Cover post must belong to the album'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

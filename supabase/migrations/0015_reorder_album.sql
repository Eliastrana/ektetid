-- Reordering posts within an album.
--
-- posts has a unique (album_id, position), so positions cannot simply be
-- reassigned in place: setting the third photo to position 0 collides with
-- whatever is already there, and the constraint is checked per statement.
--
-- Everything is therefore shifted out of the way first, by a constant large
-- enough that it cannot collide with the target range. Adding a constant to
-- every row preserves uniqueness, so the intermediate state is legal.
--
-- SECURITY INVOKER (the default) so posts_update decides whether the caller is
-- allowed — a non-member gets nothing, exactly as if they had run the updates
-- by hand.

create or replace function public.reorder_album(p_album_id uuid, p_post_ids uuid[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  offset_base constant integer := 1000000;
  moved integer;
  i integer;
begin
  if p_post_ids is null or array_length(p_post_ids, 1) is null then
    return;
  end if;

  -- Park every post in the album above the target range.
  update public.posts
     set position = position + offset_base
   where album_id = p_album_id;

  get diagnostics moved = row_count;
  if moved = 0 then
    -- Either the album is empty or the caller cannot write to it. Either way
    -- there is nothing further to do, and RLS has already had its say.
    return;
  end if;

  -- Lay the listed posts out in the order given.
  for i in 1 .. array_length(p_post_ids, 1) loop
    update public.posts
       set position = i - 1
     where id = p_post_ids[i]
       and album_id = p_album_id;
  end loop;

  -- Anything the caller did not list — a post added by someone else between
  -- the client reading the order and submitting it — keeps its relative order
  -- and lands after the listed ones, rather than being stranded at a
  -- six-figure position.
  with leftovers as (
    select id, row_number() over (order by position) - 1 as rank
      from public.posts
     where album_id = p_album_id
       and position >= offset_base
  )
  update public.posts p
     set position = array_length(p_post_ids, 1) + l.rank
    from leftovers l
   where p.id = l.id;
end;
$$;

grant execute on function public.reorder_album to authenticated;
revoke all on function public.reorder_album from anon;

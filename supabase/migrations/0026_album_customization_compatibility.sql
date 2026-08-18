-- Keep already-installed builds compatible while the refreshed album editor
-- rolls out. Legacy values are accepted at the RPC boundary, but only the
-- current palette and editorial layout are stored.

create or replace function public.update_album_customization(
  p_album_id uuid,
  p_cover_post_id uuid,
  p_accent_color text,
  p_cover_layout text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_accent_color text := case p_accent_color
    when '#f5c451' then '#9B5CFF'
    when '#8fb8ff' then '#3B82F6'
    when '#eaa08f' then '#FF6B4A'
    when '#94c9aa' then '#21C7B7'
    when '#b9a0dd' then '#9B5CFF'
    when '#d7d7d7' then '#FF4D6D'
    else p_accent_color
  end;
  v_cover_layout text := case p_cover_layout
    when 'split' then 'editorial'
    when 'poster' then 'editorial'
    else p_cover_layout
  end;
begin
  if not public.has_pro((select auth.uid())) then
    raise exception 'EkteTid Pro is required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.albums a
    where a.id = p_album_id and a.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the album owner may customize it'
      using errcode = '42501';
  end if;

  if p_cover_post_id is not null and not exists (
    select 1 from public.posts p
    where p.id = p_cover_post_id and p.album_id = p_album_id
  ) then
    raise exception 'Cover post must belong to the album'
      using errcode = '23514';
  end if;

  update public.albums
     set cover_post_id = p_cover_post_id,
         accent_color = v_accent_color,
         cover_layout = v_cover_layout
   where id = p_album_id;
end;
$$;

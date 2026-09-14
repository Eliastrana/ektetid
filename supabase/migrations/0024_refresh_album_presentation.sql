-- Refresh the Pro album presentation without leaving old cards on the retired
-- gold palette or split layout.

alter table public.albums
  drop constraint albums_accent_color_allowed,
  drop constraint albums_cover_layout_allowed;

-- These are product-wide presentation migrations, not user customization.
-- The ownership trigger correctly rejects ordinary writes without a signed-in
-- Pro owner, so suspend it only while translating existing stored values.
alter table public.albums disable trigger albums_protect_customization;

update public.albums
set accent_color = case accent_color
  when '#f5c451' then '#9B5CFF'
  when '#8fb8ff' then '#3B82F6'
  when '#eaa08f' then '#FF6B4A'
  when '#94c9aa' then '#21C7B7'
  when '#b9a0dd' then '#9B5CFF'
  when '#d7d7d7' then '#FF4D6D'
  else '#9B5CFF'
end;

update public.albums
set cover_layout = 'poster'
where cover_layout = 'split';

alter table public.albums enable trigger albums_protect_customization;

alter table public.albums
  alter column accent_color set default '#9B5CFF',
  add constraint albums_accent_color_allowed check (
    accent_color in ('#9B5CFF', '#FF4FA3', '#3B82F6', '#21C7B7', '#FF6B4A', '#FF4D6D')
  ),
  add constraint albums_cover_layout_allowed check (
    cover_layout in ('full', 'framed', 'poster')
  );

comment on column public.albums.cover_layout is
  'The Pro album-card layout: full, framed or poster.';

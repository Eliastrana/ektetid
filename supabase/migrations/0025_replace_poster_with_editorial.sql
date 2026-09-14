-- Replace the poster cover with the centered editorial title preset.

alter table public.albums
  drop constraint albums_cover_layout_allowed;

-- Translate the retired preset without invoking the user-facing Pro ownership
-- guard. Ordinary customization writes remain protected before and after this
-- product migration.
alter table public.albums disable trigger albums_protect_customization;

update public.albums
set cover_layout = 'editorial'
where cover_layout = 'poster';

alter table public.albums enable trigger albums_protect_customization;

alter table public.albums
  add constraint albums_cover_layout_allowed check (
    cover_layout in ('full', 'framed', 'editorial')
  );

comment on column public.albums.cover_layout is
  'The Pro album-card layout: full, framed or editorial.';

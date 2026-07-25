-- Realtime for comments.
--
-- Replaces the Firestore onSnapshot listener the web app used. Postgres
-- broadcasts changes over the supabase_realtime publication, and the client's
-- subscription is still filtered by RLS — a user only receives rows they are
-- allowed to select, so no extra visibility rules are needed here.

alter publication supabase_realtime add table public.comments;

-- REPLICA IDENTITY FULL so deletes carry the old row, letting clients remove
-- the right comment from the list rather than refetching the thread.
alter table public.comments replica identity full;

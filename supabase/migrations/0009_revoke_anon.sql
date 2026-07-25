-- Defence in depth: take table privileges away from the anonymous role.
--
-- Hosted Supabase projects grant `anon` SELECT on public tables by default,
-- which is why the cloud project answered 200 with an empty array where local
-- answered 401. Both are secure *today* — every policy is `TO authenticated`,
-- so anon matches none and sees zero rows.
--
-- The concern is tomorrow. With the grant in place, a single future policy
-- written `FOR ALL TO public` (an easy mistake) would immediately expose data
-- to anyone holding the publishable key, which ships in the app binary.
-- Removing the grant means such a policy still would not be enough.
--
-- Nothing in the app reads as anon: sign-in goes through GoTrue, and every
-- screen requires a session.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Applies to anything created later, so this does not have to be repeated.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

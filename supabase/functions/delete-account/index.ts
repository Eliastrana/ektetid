/**
 * Permanently delete the calling user's account.
 *
 * App Store guideline 5.1.1(v) requires an app that supports account creation
 * to also let the user delete the account from inside the app — not merely
 * deactivate it, and not by emailing support.
 *
 * This cannot run on the client: removing a row from auth.users needs the
 * service role, which must never ship in the binary. The function therefore
 * authenticates the caller with their own JWT, then acts as admin on that one
 * verified id — it never accepts a user id from the request body, which would
 * let anyone delete anyone.
 *
 * Deploy with:  supabase functions deploy delete-account
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const PHOTO_BUCKET = 'photos';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'Function is not configured' }, 500);
  }

  // Establish who is calling, using their token and nothing else.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json({ error: 'Not signed in' }, 401);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Storage has no foreign key to auth.users, so the photos would survive the
  // cascade and sit there as orphaned personal data.
  const { data: files } = await admin.storage.from(PHOTO_BUCKET).list(user.id, { limit: 1000 });

  if (files?.length) {
    const paths = files.map((file) => `${user.id}/${file.name}`);
    const { error: removeError } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
    if (removeError) {
      return json({ error: `Could not delete photos: ${removeError.message}` }, 500);
    }
  }

  // Everything else — profile, albums, posts, likes, comments, friendships,
  // read positions, push tokens — hangs off profiles.id, which cascades from
  // auth.users. One delete removes the lot.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ deleted: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

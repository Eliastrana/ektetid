/**
 * One-time backfill for posts created before thumbnail_path existed.
 *
 * Usage (service-role credentials are required because the script updates
 * every user's private media):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backfill:map-thumbnails
 *
 * It is idempotent: rows that already have a thumbnail are skipped, and the
 * object name is derived from the original path so reruns use the same target.
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const bucket = supabase.storage.from('photos');

let processed = 0;
for (;;) {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, image_path')
    .is('thumbnail_path', null)
    .order('created_at')
    .limit(100);
  if (error) throw error;
  if (!posts?.length) break;

  for (const post of posts) {
    const { data: original, error: downloadError } = await bucket.download(post.image_path);
    if (downloadError) throw downloadError;

    const bytes = await sharp(await original.arrayBuffer())
      .resize({ width: 192, withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    const thumbnailPath = post.image_path.replace(/\.[^.]+$/, '.map-thumb.jpg');
    const { error: uploadError } = await bucket.upload(thumbnailPath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('posts')
      .update({ thumbnail_path: thumbnailPath })
      .eq('id', post.id)
      .is('thumbnail_path', null);
    if (updateError) throw updateError;
    processed += 1;
    console.log(`Backfilled ${processed}: ${post.id}`);
  }
}

console.log(`Done. ${processed} map thumbnails created.`);

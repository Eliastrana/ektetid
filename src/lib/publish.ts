import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import type { Coordinates } from '@/lib/geo';
import { processImage, processSelfie } from '@/lib/image-pipeline';
import type { PendingCapture } from '@/lib/pending-capture';
import { notify } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

const BUCKET = 'photos';

export type PublishInput = {
  capture: PendingCapture;
  albumId: string;
  title: string;
  description: string;
  location: string;
  takenAt: Date;
  /** Where the photo was taken, when known. Drives the map. */
  coordinates: Coordinates | null;
};

export type PublishProgress = 'processing' | 'uploading' | 'saving';

/**
 * Storage paths are always '{user_id}/{uuid}.jpg'. The Storage RLS policy reads
 * the owner out of the first path segment, so this layout is load-bearing —
 * see supabase/migrations/0004_storage.sql.
 */
function objectPath(userId: string): string {
  return `${userId}/${Crypto.randomUUID()}.jpg`;
}

async function upload(localUri: string, userId: string): Promise<string> {
  const path = objectPath(userId);
  const bytes = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;
  return path;
}

export async function publishPost(
  input: PublishInput,
  onProgress?: (stage: PublishProgress) => void
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Du er ikke logget inn.');

  onProgress?.('processing');
  const image = await processImage(
    input.capture.imageUri,
    input.capture.width,
    input.capture.height
  );
  const selfie = input.capture.selfieUri
    ? await processSelfie(input.capture.selfieUri)
    : null;

  onProgress?.('uploading');
  const imagePath = await upload(image.uri, userId);
  let selfiePath: string | null = null;
  if (selfie) {
    try {
      selfiePath = await upload(selfie.uri, userId);
    } catch {
      // The selfie is a nice-to-have; losing it should not sink the post.
      selfiePath = null;
    }
  }

  onProgress?.('saving');
  const { data, error } = await supabase.rpc('create_post', {
    p_album_id: input.albumId,
    p_image_path: imagePath,
    // These arguments have SQL defaults, so the generated types accept
    // undefined rather than null.
    p_selfie_path: selfiePath ?? undefined,
    p_title: input.title.trim() || undefined,
    p_description: input.description.trim() || undefined,
    p_location: input.location.trim() || undefined,
    p_taken_at: input.takenAt.toISOString(),
    p_exif: (input.capture.exif ?? undefined) as never,
    p_blurhash: image.blurhash,
    p_luminance: image.luminance,
    p_latitude: input.coordinates?.latitude ?? undefined,
    p_longitude: input.coordinates?.longitude ?? undefined,
  });

  if (error) {
    // The row never landed, so the uploaded bytes are orphaned. Clean up rather
    // than leaving them to count against the user's storage forever.
    await supabase.storage
      .from(BUCKET)
      .remove([imagePath, ...(selfiePath ? [selfiePath] : [])]);
    throw error;
  }

  notify('post', data.id);
  return data.id;
}

export type WritableAlbum = {
  id: string;
  title: string;
  updated_at: string;
  /** Someone else owns this one and added you to it. */
  shared: boolean;
};

/**
 * Albums the signed-in user can post into, newest first.
 *
 * Both the ones they own and the ones they have been added to. Filtering on
 * `owner_id` alone — which this did — matched what the database allows for a
 * personal album and nothing else: `posts_insert` authorises through
 * `can_edit_album`, which accepts members too, so a shared album was writable
 * the whole time but never offered as a destination.
 *
 * Two queries because the condition spans a join, and PostgREST has no way to
 * express `owner_id = me OR exists (membership)` in one request. Merging two
 * small reads is cheaper than the round trip through an RPC, and needs no
 * migration.
 */
export async function listWritableAlbums(userId: string): Promise<WritableAlbum[]> {
  const [owned, joined] = await Promise.all([
    supabase.from('albums').select('id, title, updated_at').eq('owner_id', userId),
    supabase.from('album_members').select('albums (id, title, updated_at)').eq('user_id', userId),
  ]);

  if (owned.error) throw owned.error;
  if (joined.error) throw joined.error;

  const albums: WritableAlbum[] = (owned.data ?? []).map((album) => ({ ...album, shared: false }));
  const seen = new Set(albums.map((album) => album.id));

  for (const row of joined.data ?? []) {
    // An album the user both owns and is a member of would otherwise appear
    // twice, and React would warn about the duplicate key.
    const album = row.albums as { id: string; title: string; updated_at: string } | null;
    if (!album || seen.has(album.id)) continue;
    seen.add(album.id);
    albums.push({ ...album, shared: true });
  }

  return albums.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createAlbum(
  userId: string,
  title: string,
  description?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('albums')
    .insert({ owner_id: userId, title: title.trim(), description: description?.trim() || null })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

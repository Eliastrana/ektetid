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
  /** Optional dice rating chosen by the author. */
  rating: number | null;
};

export type PublishProgress = 'processing' | 'uploading' | 'saving' | 'archiving';

/**
 * Storage paths are always '{user_id}/{uuid}.jpg'. The Storage RLS policy reads
 * the owner out of the first path segment, so this layout is load-bearing —
 * see supabase/migrations/0004_storage.sql.
 */
function objectPath(userId: string, extension = 'jpg'): string {
  return `${userId}/${Crypto.randomUUID()}.${extension}`;
}

async function upload(
  localUri: string,
  userId: string,
  contentType = 'image/jpeg'
): Promise<string> {
  const path = objectPath(userId, contentType.startsWith('video/') ? 'mov' : 'jpg');
  const bytes = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) throw error;
  return path;
}

/**
 * Strip what Postgres will not accept inside jsonb.
 *
 * The exif column is jsonb, and jsonb cannot hold a NUL: Postgres rejects the
 * whole insert with "unsupported Unicode escape sequence" (22P05). Android's
 * camera routinely returns NUL-padded strings in tags like UserComment and the
 * maker notes, so a perfectly good post failed to publish on the strength of
 * metadata nobody reads. Unpaired surrogates are removed for the same reason —
 * they survive JSON.stringify and then fail on the way into jsonb.
 *
 * Exif is decoration: dropping a tag is always better than losing the photo,
 * so anything unrepresentable is discarded rather than escaped.
 */
function jsonbSafe(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;

  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, (char, index) => {
      const code = char.charCodeAt(0);
      const next = value.charCodeAt(index + 1);
      const previous = value.charCodeAt(index - 1);
      const paired =
        (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) ||
        (code >= 0xdc00 && previous >= 0xd800 && previous <= 0xdbff);
      return paired ? char : '';
    });
  }

  // Infinity and NaN have no JSON form; both arrive from odd exif rationals.
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || value === null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => jsonbSafe(item, depth + 1)).filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = jsonbSafe(item, depth + 1);
      if (cleaned !== undefined) out[jsonbSafe(key, depth + 1) as string] = cleaned;
    }
    return out;
  }

  // Functions, symbols, undefined: nothing jsonb can represent.
  return undefined;
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
  const [imagePath, thumbnailPath] = await Promise.all([
    upload(image.uri, userId),
    upload(image.thumbnailUri, userId),
  ]);

  /*
   * The clip, uploaded as it came off the camera.
   *
   * Not re-encoded: the device already wrote H.264 at a sane bitrate, and a
   * second pass would cost seconds of the user's time to save megabytes that
   * the ten-second cap has already bounded. iOS writes QuickTime, hence the
   * mime type — the bucket accepts both that and mp4.
   */
  let videoPath: string | null = null;
  if (input.capture.videoUri) {
    videoPath = await upload(input.capture.videoUri, userId, 'video/quicktime');
  }
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
    p_exif: (jsonbSafe(input.capture.exif) ?? undefined) as never,
    p_blurhash: image.blurhash,
    p_luminance: image.luminance,
    p_latitude: input.coordinates?.latitude ?? undefined,
    p_longitude: input.coordinates?.longitude ?? undefined,
    p_video_path: videoPath ?? undefined,
    p_thumbnail_path: thumbnailPath,
    p_rating: input.rating ?? undefined,
    // Kept for backwards-compatible RPC/database shape. New posts are always
    // stored unfiltered now that the filter picker has been removed.
    p_filter_name: 'original',
  });

  if (error) {
    // The row never landed, so the uploaded bytes are orphaned. Clean up rather
    // than leaving them to count against the user's storage forever.
    await supabase.storage
      .from(BUCKET)
      .remove([
        imagePath,
        thumbnailPath,
        ...(selfiePath ? [selfiePath] : []),
        ...(videoPath ? [videoPath] : []),
      ]);
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
  /**
   * Who the album belongs to, for shared ones only. Posting into someone
   * else's album is visible to their friends, so the destination has to say
   * whose it is — a title alone gives no way to tell two people's albums apart.
   */
  ownerName: string | null;
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
    supabase
      .from('album_members')
      .select('albums (id, title, updated_at, owner:profiles!albums_owner_id_fkey (username, display_name))')
      .eq('user_id', userId),
  ]);

  if (owned.error) throw owned.error;
  if (joined.error) throw joined.error;

  const albums: WritableAlbum[] = (owned.data ?? []).map((album) => ({
    ...album,
    shared: false,
    ownerName: null,
  }));
  const seen = new Set(albums.map((album) => album.id));

  for (const row of joined.data ?? []) {
    // An album the user both owns and is a member of would otherwise appear
    // twice, and React would warn about the duplicate key.
    const album = row.albums as
      | {
          id: string;
          title: string;
          updated_at: string;
          owner: { username: string | null; display_name: string | null } | null;
        }
      | null;
    if (!album || seen.has(album.id)) continue;
    seen.add(album.id);
    const { owner, ...rest } = album;
    albums.push({
      ...rest,
      shared: true,
      // Prefer the chosen display name, fall back to the handle: one or the
      // other is always set, and an album labelled with neither is worse than
      // one labelled with the less friendly of the two.
      ownerName: owner?.display_name?.trim() || owner?.username || null,
    });
  }

  return albums.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/**
 * Create an album owned by whoever is signed in right now.
 *
 * The owner comes from the server rather than from a component's copy of the
 * session, which is what publishPost already did and this did not. The
 * albums_insert policy checks `owner_id = auth.uid()`, so the two have to agree
 * — and a cached id that has drifted from the token the client is actually
 * sending fails as a row-level security violation, which reads like a
 * permissions bug rather than an expired session.
 */
export async function createAlbum(title: string, description?: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Du er ikke logget inn.');

  const { data, error } = await supabase
    .from('albums')
    .insert({ owner_id: userId, title: title.trim(), description: description?.trim() || null })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

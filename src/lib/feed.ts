import type { AlbumFeedRow } from '@/lib/database.types';
import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export type FeedAlbum = AlbumFeedRow & { coverUrl: string | null };

/**
 * Albums visible to the signed-in user — their own plus their friends' — newest
 * activity first.
 *
 * The cover image, post count and unseen count all come out of the album_feed
 * view. The web version fetched every album, counted images client-side, and
 * diffed against localStorage to work out the badge.
 */
export async function fetchFeed(): Promise<FeedAlbum[]> {
  const { data, error } = await supabase
    .from('album_feed')
    .select('*')
    // Newest post first, so an album someone added to five minutes ago outranks
    // one they last touched a month back — regardless of whose album it is.
    // Empty albums have no last_post_at and fall to the bottom.
    .order('last_post_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const coverPaths = data
    .map((album) => album.cover_image_path)
    .filter((path): path is string => !!path);

  // A brand-new account has no albums yet, so skip the signing round-trip.
  const urls = coverPaths.length ? await signedUrls(coverPaths) : new Map<string, string>();

  return data.map((album) => ({
    ...album,
    coverUrl: album.cover_image_path ? (urls.get(album.cover_image_path) ?? null) : null,
  }));
}

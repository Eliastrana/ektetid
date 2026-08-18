import type { AlbumFeedRow } from '@/lib/database.types';
import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { hasPro } from '@/lib/social';

export type FeedAlbum = AlbumFeedRow & {
  coverUrl: string | null;
  /**
   * Someone else's album that you were added to and can post into — as opposed
   * to a friend's album, which the feed also shows but which you can only read.
   *
   * Optional because the profile screens reuse the same card for a list that is
   * all one person's albums, where the distinction cannot arise.
   */
  shared?: boolean;
  ownerPro?: boolean;
};

export type FeedResult = {
  albums: FeedAlbum[];
  /** Whether the person viewing the feed already owns or earned Pro. */
  viewerPro: boolean;
};

/**
 * Albums visible to the signed-in user — their own plus their friends' — newest
 * activity first.
 *
 * The cover image, post count and unseen count all come out of the album_feed
 * view. The web version fetched every album, counted images client-side, and
 * diffed against localStorage to work out the badge.
 */
export async function fetchFeed(userId: string): Promise<FeedResult> {
  /*
   * Memberships are fetched alongside the feed rather than joined into it.
   *
   * album_feed has owner_id but no notion of who else may write to an album,
   * and teaching the view about membership would mean a migration against the
   * production database for something one small read answers. The row count
   * here is the number of albums shared with this one user.
   */
  const memberships = supabase.from('album_members').select('album_id').eq('user_id', userId);

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

  const shared = new Set((await memberships).data?.map((row) => row.album_id) ?? []);
  // Include the viewer even when they have no album yet. This lets the header
  // hide its Pro invitation for someone who purchased Pro before posting,
  // without a second status request from the screen.
  const ownerIds = [
    ...new Set([userId, ...data.map((album) => album.owner_id).filter(Boolean)]),
  ] as string[];
  const proOwners = new Map(
    await Promise.all(ownerIds.map(async (ownerId) => [ownerId, await hasPro(ownerId)] as const))
  );

  return {
    viewerPro: proOwners.get(userId) ?? false,
    albums: data.map((album) => ({
      ...album,
      coverUrl: album.cover_image_path ? (urls.get(album.cover_image_path) ?? null) : null,
      shared: !!album.id && shared.has(album.id),
      ownerPro: album.owner_id ? (proOwners.get(album.owner_id) ?? false) : false,
    })),
  };
}

import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export type LocatedPost = {
  id: string;
  albumId: string;
  title: string | null;
  location: string | null;
  takenAt: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** Storage path resolved after the coordinate-only result is on screen. */
  imagePath: string;
  blurhash: string | null;
};

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Whose pins to show. */
export type MapFilter = 'all' | 'mine';

/**
 * Maximum number of photo-backed map pins.
 *
 * Beyond this density the thumbnails overlap, while signing and decoding more
 * media still competes with the native map for bandwidth and main-thread time.
 */
export const MAX_MAP_PHOTO_PINS = 30;

/**
 * Posts with coordinates that the caller can see.
 *
 * RLS already limits this to your own posts and your friends', so 'all' needs
 * no visibility rules of its own — the same policy that governs the feed
 * governs the pins. 'mine' narrows further, server-side, so a filtered map
 * does not pull rows it will only discard.
 */
export async function fetchLocatedPosts(
  filter: MapFilter = 'all',
  selfId?: string
): Promise<LocatedPost[]> {
  let query = supabase
    .from('posts')
    .select(
      'id, album_id, title, location, taken_at, latitude, longitude, image_path, thumbnail_path, blurhash'
    )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (filter === 'mine' && selfId) {
    query = query.eq('author_id', selfId);
  }

  const { data, error } = await query.order('taken_at', { ascending: false }).limit(500);

  if (error) throw error;

  // New posts carry a 192px derivative made specifically for compact
  // surfaces. Older rows fall back to the original until the backfill runs.
  return data.map((post) => ({
    id: post.id,
    albumId: post.album_id,
    title: post.title,
    location: post.location,
    takenAt: post.taken_at,
    latitude: post.latitude!,
    longitude: post.longitude!,
    imageUrl: null,
    imagePath: post.thumbnail_path ?? post.image_path,
    blurhash: post.blurhash,
  }));
}

/**
 * Resolve pin media after coordinates have already mounted the native map.
 * Signing and downloading images is useful decoration, not a prerequisite for
 * panning or selecting fallback camera pins.
 */
export async function hydrateLocatedPostImages(
  posts: LocatedPost[]
): Promise<LocatedPost[]> {
  const photoPosts = posts.slice(0, MAX_MAP_PHOTO_PINS);
  const urls = await signedUrls(photoPosts.map((post) => post.imagePath));
  return posts.map((post) => ({ ...post, imageUrl: urls.get(post.imagePath) ?? null }));
}

/** Padding around the outermost pins, as a fraction of their spread. */
const REGION_PADDING = 0.4;

/** Smallest span we will zoom to, so a single pin does not fill the screen. */
const MIN_DELTA = 0.02;

/**
 * A region that fits every pin.
 *
 * Longitude is not wrapped across the antimeridian: someone with posts in both
 * Norway and Alaska gets a view spanning the long way round. Handling that
 * properly means clustering by hemisphere, which is not worth it until someone
 * actually travels that way.
 */
export function regionFor(posts: LocatedPost[]): MapRegion | null {
  if (posts.length === 0) return null;

  const lats = posts.map((p) => p.latitude);
  const lngs = posts.map((p) => p.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * (1 + REGION_PADDING), MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * (1 + REGION_PADDING), MIN_DELTA),
  };
}

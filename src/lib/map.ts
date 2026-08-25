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
 * Safety cap on photo-backed pins rendered at once.
 *
 * Clustering already keeps this far below its limit — the grid yields at most
 * CLUSTER_GRID² cells on screen, and only cells holding a single post become
 * photos. The cap remains for the pathological case of a viewport spanning
 * nothing but singles.
 */
export const MAX_MAP_PHOTO_PINS = 30;

/**
 * Cells across the viewport's shorter axis.
 *
 * Cells are measured in degrees of the *current* span, so they shrink as the
 * camera zooms in: the same two posts that share a cell across a country
 * separate into their own once the street is on screen. Five reads as a
 * handful of groups rather than a scattering of near-identical bubbles.
 */
const CLUSTER_GRID = 5;

/** One map bubble: a lone post shows its photo, several show a count. */
export type MapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  posts: LocatedPost[];
};

/**
 * Break clusters back into individual photos wherever the budget allows.
 *
 * Clustering exists to stop a dense map signing and capturing hundreds of
 * thumbnails, not to hide photos that would happily fit. Once the camera is
 * close enough that only a handful of posts are in view, a bubble reading "2"
 * is strictly worse than the two photos it stands for.
 *
 * Smallest first, so the budget is spent where it reveals the most: expanding
 * three twos shows six photos, while one six shows the same for the same cost
 * but leaves the map looking coarser. Whatever will not fit stays a count.
 */
export function expandSmallClusters(
  clusters: MapCluster[],
  budget = MAX_MAP_PHOTO_PINS
): MapCluster[] {
  const singles = clusters.filter((cluster) => cluster.posts.length === 1);
  const groups = clusters
    .filter((cluster) => cluster.posts.length > 1)
    .sort((a, b) => a.posts.length - b.posts.length);

  let spent = singles.length;
  const out: MapCluster[] = [...singles];

  for (const group of groups) {
    if (spent + group.posts.length <= budget) {
      spent += group.posts.length;
      out.push(
        ...group.posts.map((post) => ({
          id: post.id,
          latitude: post.latitude,
          longitude: post.longitude,
          posts: [post],
        }))
      );
    } else {
      out.push(group);
    }
  }

  return out;
}

/**
 * Posts near enough to the camera to be worth drawing.
 *
 * The margin keeps pins just off screen ready, so a short pan reveals photos
 * already signed rather than a row of fallback glyphs. This replaces taking
 * the first N of the list: ordering by capture date meant the posts that got
 * images were whichever happened to be most recent, not the ones being
 * looked at.
 */
export function postsInView(
  posts: LocatedPost[],
  region: MapRegion,
  margin = 0.3
): LocatedPost[] {
  const latReach = region.latitudeDelta * (0.5 + margin);
  const lngReach = region.longitudeDelta * (0.5 + margin);
  return posts.filter(
    (post) =>
      Math.abs(post.latitude - region.latitude) <= latReach &&
      Math.abs(post.longitude - region.longitude) <= lngReach
  );
}

/**
 * Group posts into grid cells for the current span.
 *
 * A cluster sits at the mean of its members rather than at its cell's centre,
 * so a bubble points at where the photos actually are instead of drifting to
 * arbitrary grid lines as the camera moves.
 */
export function clusterPosts(posts: LocatedPost[], region: MapRegion): MapCluster[] {
  const cellLat = Math.max(region.latitudeDelta, 0.0001) / CLUSTER_GRID;
  const cellLng = Math.max(region.longitudeDelta, 0.0001) / CLUSTER_GRID;

  const cells = new Map<string, LocatedPost[]>();
  for (const post of posts) {
    const key = `${Math.floor(post.latitude / cellLat)}:${Math.floor(post.longitude / cellLng)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(post);
    else cells.set(key, [post]);
  }

  return [...cells.values()].map((members) => {
    const total = members.length;
    return {
      // Identified by a member rather than the cell, so a bubble keeps its
      // identity across camera moves instead of remounting on every pan.
      id: members[0].id,
      latitude: members.reduce((sum, p) => sum + p.latitude, 0) / total,
      longitude: members.reduce((sum, p) => sum + p.longitude, 0) / total,
      posts: members,
    };
  });
}

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
 * Sign thumbnails for `wanted` and fold them into `posts`.
 *
 * Signing is decoration, not a prerequisite for panning or selecting fallback
 * camera pins, so it runs after coordinates have already mounted the map.
 * Callers pass only the posts currently drawn as photos; anything already
 * signed is kept, so panning back to a place does not re-sign what it had.
 */
export async function hydrateLocatedPostImages(
  posts: LocatedPost[],
  /** Defaults to every post, for callers that draw them all rather than cluster. */
  wanted: LocatedPost[] = posts
): Promise<LocatedPost[]> {
  const unsigned = wanted.filter((post) => !post.imageUrl).slice(0, MAX_MAP_PHOTO_PINS);
  if (unsigned.length === 0) return posts;

  const urls = await signedUrls(unsigned.map((post) => post.imagePath));
  return posts.map((post) =>
    post.imageUrl ? post : { ...post, imageUrl: urls.get(post.imagePath) ?? null }
  );
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

import { supabase } from '@/lib/supabase';

/** A restaurant on the map, scored by the terningkast on posts you can see. */
export type VenueRating = {
  /** Stable across reloads, so a selected place survives a refresh. */
  key: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  /** Mean terningkast, one decimal, 1–6. */
  average: number;
  ratings: number;
  /** The newest review, which is where tapping the place leads. */
  latestPostId: string;
  latestAlbumId: string;
};

/**
 * Every rated venue the caller can see.
 *
 * Aggregated in Postgres under the caller's own row-level security — see
 * 0034_venue_ratings.sql for why a stranger's rating never counts.
 */
export async function fetchVenueRatings(): Promise<VenueRating[]> {
  const { data, error } = await supabase.rpc('venue_ratings');
  if (error) throw error;

  return data.map((row) => ({
    key: `${row.name.trim().toLowerCase()}@${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}`,
    name: row.name,
    category: row.category,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    average: Number(row.average),
    ratings: row.ratings,
    latestPostId: row.latest_post_id,
    latestAlbumId: row.latest_album_id,
  }));
}

/** "5,3" — one decimal, Norwegian comma. */
export function formatRating(average: number): string {
  return average.toFixed(1).replace('.', ',');
}

/** "1 terningkast" / "4 terningkast" — the word does not inflect. */
export function formatRatingCount(count: number): string {
  return `${count} terningkast`;
}

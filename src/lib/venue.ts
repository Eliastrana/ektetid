import type { Venue } from '@/../modules/venue-search';

/** What a post carries once a venue is attached, mirroring the posts columns. */
export type PostVenue = {
  venue_name: string | null;
  venue_category: string | null;
  venue_address: string | null;
  venue_latitude: number | null;
  venue_longitude: number | null;
};

export const NO_VENUE: PostVenue = {
  venue_name: null,
  venue_category: null,
  venue_address: null,
  venue_latitude: null,
  venue_longitude: null,
};

export function toPostVenue(venue: Venue): PostVenue {
  return {
    venue_name: venue.name,
    venue_category: venue.category,
    venue_address: venue.address || null,
    venue_latitude: venue.latitude,
    venue_longitude: venue.longitude,
  };
}

/** Read a stored post's columns back as a venue, or null when it has none. */
export function fromPostVenue(row: Partial<PostVenue>): Venue | null {
  if (!row.venue_name || row.venue_latitude == null || row.venue_longitude == null) {
    return null;
  }
  return {
    name: row.venue_name,
    category: row.venue_category ?? null,
    address: row.venue_address ?? '',
    latitude: row.venue_latitude,
    longitude: row.venue_longitude,
    // Distance is relative to whoever searched, so it means nothing once
    // stored — a reader is not standing where the photographer was.
    distance: null,
  };
}

/**
 * MapKit's category constants, in Norwegian.
 *
 * Only the ones the search asks for. An unmapped value falls back to nothing
 * rather than to the raw constant, because "MKPOICategoryRestaurant" on
 * someone's holiday photo is worse than no label at all.
 */
const CATEGORY_NAMES: Record<string, string> = {
  MKPOICategoryRestaurant: 'Restaurant',
  MKPOICategoryCafe: 'Kafé',
  MKPOICategoryBakery: 'Bakeri',
  MKPOICategoryBrewery: 'Bryggeri',
  MKPOICategoryWinery: 'Vinbar',
  MKPOICategoryNightlife: 'Uteliv',
  MKPOICategoryFoodMarket: 'Matbutikk',
};

export function venueCategoryName(category: string | null): string | null {
  return category ? (CATEGORY_NAMES[category] ?? null) : null;
}

/** Metres, rounded the way people say distances. */
export function formatDistance(metres: number | null): string | null {
  if (metres == null) return null;
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * A link to the venue in Maps.
 *
 * `maps.apple.com` rather than the `maps://` scheme: the https form opens the
 * Maps app on an Apple device and a web map anywhere else, so a post shared
 * outside iOS still leads somewhere. The coordinates carry the pin and the
 * name labels it — searching by name alone can land on a different branch.
 */
export function venueMapsUrl(venue: Pick<Venue, 'name' | 'latitude' | 'longitude'>): string {
  const at = `${venue.latitude},${venue.longitude}`;
  return `https://maps.apple.com/?ll=${at}&q=${encodeURIComponent(venue.name)}`;
}

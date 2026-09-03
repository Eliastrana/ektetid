/**
 * The stand-in where MapKit does not exist.
 *
 * Venue suggestions come from Apple's map data through MKLocalPointsOfInterest,
 * which has no counterpart on Android or the web. Rather than substitute a
 * different provider — two sources of truth for one field, with different
 * names and categories for the same restaurant — the feature is simply absent,
 * and `isVenueSearchAvailable` is how callers find that out.
 *
 * This file exists so importing the module off Apple platforms resolves instead
 * of throwing on `requireNativeModule`, the way the volume-buttons stub does.
 */

export type Venue = {
  name: string;
  category: string | null;
  address: string;
  latitude: number;
  longitude: number;
  distance: number | null;
};

export const DEFAULT_RADIUS = 250;

export const isVenueSearchAvailable = false;

export async function searchVenues(): Promise<Venue[]> {
  return [];
}

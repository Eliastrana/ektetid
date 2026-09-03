import { requireOptionalNativeModule } from 'expo-modules-core';

/** A place to eat or drink, as MapKit knows it. */
export type Venue = {
  name: string;
  /** MapKit's own category string, e.g. "MKPOICategoryRestaurant". May be null. */
  category: string | null;
  /** Street and area, for telling two branches of the same name apart. */
  address: string;
  latitude: number;
  longitude: number;
  /** Metres from the coordinate searched, or null when MapKit gave no location. */
  distance: number | null;
};

/**
 * How far out to look, in metres.
 *
 * The question is which venue you are standing in, not which ones are in the
 * city — and a list that reaches a kilometre out is a list you have to read
 * rather than recognise.
 */
export const DEFAULT_RADIUS = 250;

type VenueSearchModule = {
  searchVenues: (latitude: number, longitude: number, radius: number) => Promise<Venue[]>;
};

/**
 * Optional, not required — the difference matters more than it looks.
 *
 * `requireNativeModule` throws at import time, so a build that does not contain
 * this module could not so much as load the composer: the red screen came from
 * the import, long before anything checked whether the feature was available.
 * That is exactly the situation `isVenueSearchAvailable` exists to handle, and
 * a hardcoded `true` could never describe it.
 *
 * It happens on any binary older than the module — which includes every copy
 * of the app already installed, and will include the next one if this module
 * ever fails to link.
 */
const native = requireOptionalNativeModule<VenueSearchModule>('VenueSearch');

/**
 * Whether venue suggestions can be offered at all.
 *
 * False off Apple platforms, where MapKit has no equivalent, and false on a
 * build that predates the module. Callers leave the field out entirely rather
 * than show an option that cannot produce anything.
 */
export const isVenueSearchAvailable = native !== null;

export function searchVenues(
  latitude: number,
  longitude: number,
  radius: number = DEFAULT_RADIUS
): Promise<Venue[]> {
  if (!native) {
    // Reached only by a caller that ignored isVenueSearchAvailable. Empty
    // rather than thrown: a missing suggestion is not an error worth a screen.
    return Promise.resolve([]);
  }
  return native.searchVenues(latitude, longitude, radius);
}

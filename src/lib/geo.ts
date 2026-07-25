export type Coordinates = { latitude: number; longitude: number };

/**
 * Read coordinates out of a photo's EXIF.
 *
 * EXIF stores latitude and longitude as unsigned magnitudes, with the
 * hemisphere in separate GPSLatitudeRef / GPSLongitudeRef fields. Ignoring the
 * refs puts every western longitude in the wrong hemisphere — Iceland lands in
 * Siberia — so the sign is applied here.
 *
 * Preferred over the device's current position, because a photo picked from the
 * library was taken wherever it was taken, not where the user is standing now.
 */
export function exifCoordinates(exif: unknown): Coordinates | null {
  if (typeof exif !== 'object' || exif === null) return null;
  const record = exif as Record<string, unknown>;

  const latitude = signed(record.GPSLatitude, record.GPSLatitudeRef, 'S');
  const longitude = signed(record.GPSLongitude, record.GPSLongitudeRef, 'W');
  if (latitude === null || longitude === null) return null;

  // 0,0 is in the Atlantic and is what a camera writes when it has no fix.
  if (latitude === 0 && longitude === 0) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
}

function signed(value: unknown, ref: unknown, negativeRef: string): number | null {
  const magnitude = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(magnitude)) return null;

  const hemisphere = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  return hemisphere === negativeRef ? -Math.abs(magnitude) : Math.abs(magnitude);
}

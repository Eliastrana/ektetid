import { Image, type ImageRef } from 'expo-image';

import type { LocatedPost } from '@/lib/map';

/**
 * Pin thumbnails.
 *
 * Apple Maps annotations take a native image reference rather than a URL, so
 * each thumbnail has to be loaded into memory before the map can draw it. That
 * is real work per pin, hence the cap and the cache — a hundred posts should
 * not mean a hundred full-size decodes every time the tab regains focus.
 */

/** Pixel size of the thumbnail handed to the map. */
const PIN_SIZE = 96;

/**
 * How many pins get a photo.
 *
 * Beyond this they fall back to plain markers. Loading an image per pin is
 * bounded work, and at this density the thumbnails overlap into mush anyway,
 * so the photo stops carrying information.
 */
export const MAX_PHOTO_PINS = 60;

const cache = new Map<string, ImageRef>();

/**
 * Load thumbnails for the given posts, newest first.
 *
 * Failures are skipped rather than thrown: one unreadable photo should cost
 * that pin its picture, not take the whole map down.
 */
export async function loadPinIcons(posts: LocatedPost[]): Promise<Map<string, ImageRef>> {
  const wanted = posts.slice(0, MAX_PHOTO_PINS);
  const result = new Map<string, ImageRef>();

  await Promise.all(
    wanted.map(async (post) => {
      if (!post.imageUrl) return;

      const cached = cache.get(post.id);
      if (cached) {
        result.set(post.id, cached);
        return;
      }

      try {
        const ref = await Image.loadAsync(
          { uri: post.imageUrl },
          // Decode straight to pin size. Loading a 2048px photo to draw it at
          // 96 wastes both memory and time, and there are up to sixty of them.
          { maxWidth: PIN_SIZE, maxHeight: PIN_SIZE }
        );
        cache.set(post.id, ref);
        result.set(post.id, ref);
      } catch {
        // No icon for this pin; it falls back to a plain marker.
      }
    })
  );

  return result;
}

/** Drop cached refs, e.g. when signing out. */
export function clearPinIcons(): void {
  cache.clear();
}

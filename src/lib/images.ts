import { Image, type ImageSource } from 'expo-image';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUCKET = 'photos';

/** How long a signed URL stays valid. */
const TTL_SECONDS = 60 * 60;

/** Re-sign a little early so an image never expires mid-scroll. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const signing = new Map<string, Promise<string | null>>();
const prefetching = new Map<string, Promise<void>>();
let cacheGeneration = 0;

function imageCacheKey(path: string): string {
  return `storage:${path}`;
}

/**
 * The URL authorises this request; the storage path identifies the bytes.
 *
 * Signed URL tokens change between launches. Letting expo-image use the URL as
 * its key therefore stranded perfectly good files in its disk cache whenever a
 * token was renewed. The immutable object path survives those renewals.
 */
export function storageImageSource(path: string, url: string): ImageSource {
  return { uri: url, cacheKey: imageCacheKey(path) };
}

function fresh(path: string): string | null {
  const entry = cache.get(path);
  if (!entry) return null;
  if (entry.expiresAt - REFRESH_MARGIN_MS < Date.now()) {
    cache.delete(path);
    return null;
  }
  return entry.url;
}

function remember(path: string, url: string): void {
  cache.set(path, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

/**
 * Resolve Storage paths to signed URLs.
 *
 * The bucket is private, so images cannot be addressed directly — the Storage
 * policy checks the friendship graph on every signature. Signing in one batch
 * keeps a feed of albums to a single request.
 */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const waiting = new Map<string, Promise<string | null>>();
  const missing: string[] = [];

  for (const path of paths) {
    const hit = fresh(path);
    if (hit) resolved.set(path, hit);
    else {
      const pending = signing.get(path);
      if (pending) waiting.set(path, pending);
      else if (!missing.includes(path)) missing.push(path);
    }
  }

  if (missing.length > 0) {
    const requestGeneration = cacheGeneration;
    const request = supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, TTL_SECONDS)
      .then(({ data, error }) => {
        if (error) throw error;
        const batch = new Map<string, string>();
        // A sign-out may have happened while Storage was answering. Do not
        // repopulate credentials or hand them to an obsolete screen afterward.
        if (requestGeneration !== cacheGeneration) return batch;
        for (const item of data) {
          if (!item.signedUrl || !item.path) continue;
          remember(item.path, item.signedUrl);
          batch.set(item.path, item.signedUrl);
        }
        return batch;
      });

    for (const path of missing) {
      const pending = request
        .then((batch) => batch.get(path) ?? null)
        .finally(() => signing.delete(path));
      signing.set(path, pending);
      waiting.set(path, pending);
    }
  }

  await Promise.all(
    [...waiting].map(async ([path, pending]) => {
      const url = await pending;
      if (url) resolved.set(path, url);
    })
  );

  return resolved;
}

export async function signedUrl(path: string): Promise<string | null> {
  const resolved = await signedUrls([path]);
  return resolved.get(path) ?? null;
}

/**
 * Warm expo-image under the same stable key the eventual Image view will use.
 *
 * `Image.prefetch()` only accepts URL strings, so it would cache private media
 * under an expiring signed URL. On native, load the bitmap and explicitly seed
 * the disk cache under the storage path instead. Web keeps its ordinary HTTP
 * cache because the native cache-writing API is unavailable there.
 */
export async function prefetchStorageImages(
  images: { path: string; url: string }[]
): Promise<void> {
  const unique = new Map(images.map((image) => [image.path, image]));
  if (unique.size === 0) return;

  if (Platform.OS === 'web') {
    await Image.prefetch([...unique.values()].map((image) => image.url));
    return;
  }

  await Promise.all(
    [...unique.values()].map(async ({ path, url }) => {
      const key = imageCacheKey(path);
      const existing = prefetching.get(key);
      if (existing) return existing;

      const taskGeneration = cacheGeneration;
      const task = (async () => {
        if (await Image.getCachePathAsync(key)) return;
        const ref = await Image.loadAsync(storageImageSource(path, url));
        if (taskGeneration !== cacheGeneration) return;
        await Image.writeToCacheAsync(ref, key);
      })().finally(() => prefetching.delete(key));

      prefetching.set(key, task);
      return task;
    })
  );
}

/** Drop cached signatures, e.g. on sign-out. */
export function clearSignedUrlCache(): void {
  cacheGeneration += 1;
  cache.clear();
  signing.clear();
}

/** Private photos must not remain readable after a deliberate sign-out. */
export async function clearPrivateImageCaches(): Promise<void> {
  clearSignedUrlCache();
  if (Platform.OS === 'web') return;
  // Let requests started by the outgoing account settle first, then clear.
  // Otherwise a late decode could refill the cache just after sign-out.
  await Promise.allSettled([...prefetching.values()]);
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}

import { supabase } from '@/lib/supabase';

const BUCKET = 'photos';

/** How long a signed URL stays valid. */
const TTL_SECONDS = 60 * 60;

/** Re-sign a little early so an image never expires mid-scroll. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

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
  const missing: string[] = [];

  for (const path of paths) {
    const hit = fresh(path);
    if (hit) resolved.set(path, hit);
    else if (!missing.includes(path)) missing.push(path);
  }

  if (missing.length === 0) return resolved;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(missing, TTL_SECONDS);

  if (error) throw error;

  for (const item of data) {
    if (!item.signedUrl || !item.path) continue;
    remember(item.path, item.signedUrl);
    resolved.set(item.path, item.signedUrl);
  }

  return resolved;
}

export async function signedUrl(path: string): Promise<string | null> {
  const resolved = await signedUrls([path]);
  return resolved.get(path) ?? null;
}

/** Drop cached signatures, e.g. on sign-out. */
export function clearSignedUrlCache(): void {
  cache.clear();
}

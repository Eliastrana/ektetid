import { Image, type ImageRef } from 'expo-image';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { CountPin, PhotoPin, PIN_HEIGHT, PIN_WIDTH, RatingPin } from '@/components/photo-pin';
import { MAX_MAP_PHOTO_PINS, type LocatedPost } from '@/lib/map';
import { prefetchStorageImages } from '@/lib/images';

/** Cached across mounts: capturing the same pin twice is pure waste. */
const cache = new Map<string, ImageRef>();

/**
 * One pin awaiting capture, of any kind.
 *
 * `id` is what the map will look the finished icon up by; `cacheKey` is what
 * makes two pins the same drawing. For photos those differ (many posts, one
 * image each), but every cluster showing the same number is one identical
 * picture — so counts key on the number and are drawn once however many
 * bubbles use them. Ratings work the same way: every "5,3" is one drawing.
 */
type PendingPin = {
  id: string;
  cacheKey: string;
  run: number;
} & (
  | { kind: 'photo'; post: LocatedPost }
  | { kind: 'count'; count: number }
  | { kind: 'rating'; label: string }
);

type Props = {
  /** Posts drawn as their own photo. */
  posts: LocatedPost[];
  /** Distinct cluster sizes needing a numbered pin. */
  counts: number[];
  /** Distinct formatted scores ("5,3") needing a rating pin. */
  ratings?: string[];
  onReady: (icons: Map<string, ImageRef>) => void;
};

/** How the map addresses a numbered pin. */
export const countIconId = (count: number) => `count:${count}`;

/** How the map addresses a rating pin. */
export const ratingIconId = (label: string) => `rating:${label}`;

const NO_RATINGS: string[] = [];

/**
 * Renders pins offscreen, captures each one, and hands back native image refs.
 *
 * Apple Maps needs a finished image — it will not compose a photo into its own
 * pin — so the pin is built as a React view and photographed. The rendering
 * host sits at a large negative offset rather than behind `opacity: 0` or
 * `display: none`: a view that is not actually laid out captures blank.
 */
export function PinFactory({ posts, counts, ratings = NO_RATINGS, onReady }: Props) {
  const [pending, setPending] = useState<PendingPin | null>(null);
  const hostRef = useRef<View>(null);
  const queue = useRef<PendingPin[]>([]);
  const results = useRef<Map<string, ImageRef>>(new Map());
  const activeRun = useRef(0);
  const captureFrame = useRef<number | null>(null);

  const next = useCallback((run: number) => {
    if (run !== activeRun.current) return;
    const item = queue.current.shift();
    if (!item) {
      setPending(null);
      return;
    }
    setPending(item);
  }, []);

  useEffect(() => {
    const run = ++activeRun.current;
    queue.current = [];
    const wanted = posts.slice(0, MAX_MAP_PHOTO_PINS).filter((post) => post.imageUrl);
    const wantedCounts = [...new Set(counts)];
    const wantedRatings = [...new Set(ratings)];

    // The first render contains coordinates but deliberately has no signed
    // URLs. Keep any already-visible cached icons during that short phase;
    // clearing them here is what made revisiting the map flash back to the
    // loading glyphs. Numbered and rating pins need nothing signed, so a view
    // of nothing but those must not be caught by this.
    if (
      posts.length > 0 &&
      wanted.length === 0 &&
      wantedCounts.length === 0 &&
      wantedRatings.length === 0
    ) {
      setPending(null);
      return () => {
        if (activeRun.current === run) activeRun.current += 1;
      };
    }

    // Warm a small leading window. Prefetching all thirty at once can delay the
    // first visible pin on a constrained connection, while the remaining tiny
    // thumbnails will naturally load as their turn reaches the capture host.
    const warm = wanted
      .slice(0, 8)
      .flatMap((post) =>
        post.imageUrl ? [{ path: post.imagePath, url: post.imageUrl }] : []
      );
    if (warm.length) void prefetchStorageImages(warm).catch(() => {});

    results.current = new Map();
    const uncached: PendingPin[] = [];

    for (const post of wanted) {
      const hit = cache.get(post.imagePath);
      if (hit) results.current.set(post.id, hit);
      else uncached.push({ kind: 'photo', id: post.id, cacheKey: post.imagePath, post, run });
    }

    for (const count of wantedCounts) {
      const id = countIconId(count);
      const hit = cache.get(id);
      if (hit) results.current.set(id, hit);
      else uncached.push({ kind: 'count', id, cacheKey: id, count, run });
    }

    for (const label of wantedRatings) {
      const id = ratingIconId(label);
      const hit = cache.get(id);
      if (hit) results.current.set(id, hit);
      else uncached.push({ kind: 'rating', id, cacheKey: id, label, run });
    }

    // Cached pins are useful immediately. Previously they were withheld until
    // every uncached pin had also rendered, which defeated the cache visually.
    onReady(new Map(results.current));

    if (uncached.length === 0) {
      setPending(null);
      return () => {
        if (activeRun.current === run) activeRun.current += 1;
      };
    }

    queue.current = uncached;
    next(run);

    return () => {
      if (activeRun.current === run) {
        activeRun.current += 1;
        queue.current = [];
      }
    };
  }, [counts, next, onReady, posts, ratings]);

  const capture = useCallback(async () => {
    const item = pending;
    if (!item || !hostRef.current || item.run !== activeRun.current) return;

    let uri: string | null = null;
    try {
      uri = await captureRef(hostRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const ref = await Image.loadAsync({ uri });
      if (item.run !== activeRun.current) return;

      cache.set(item.cacheKey, ref);
      results.current.set(item.id, ref);

      // Publish each completed pin instead of holding the whole sequential
      // queue hostage. The first photos now replace their native fallback as
      // soon as they are ready.
      onReady(new Map(results.current));
    } catch {
      // This pin keeps the fallback glyph; one bad capture is not worth
      // abandoning the rest.
    } finally {
      if (uri) {
        try {
          const file = new File(uri);
          if (file.exists) file.delete();
        } catch {
          // The decoded native ImageRef is already retained; trim best effort.
        }
      }
      next(item.run);
    }
  }, [next, onReady, pending]);

  // Numbered and rating pins have no image to decode, so nothing will report
  // them ready. One paint frame after mounting is enough, and matches the frame
  // the photo path waits for after onLoad.
  useEffect(() => {
    if (pending?.kind !== 'count' && pending?.kind !== 'rating') return;
    const frame = requestAnimationFrame(() => void capture());
    return () => cancelAnimationFrame(frame);
  }, [capture, pending]);

  const onImageLoaded = useCallback(() => {
    if (captureFrame.current !== null) cancelAnimationFrame(captureFrame.current);

    // The capture host is intentionally far outside the viewport. expo-image's
    // onDisplay event is therefore not guaranteed to fire, even though the
    // bitmap has decoded. onLoad plus one paint frame is reliable offscreen and
    // still advances much sooner than the old fixed timeout.
    captureFrame.current = requestAnimationFrame(() => {
      captureFrame.current = null;
      void capture();
    });
  }, [capture]);

  const onImageError = useCallback(() => {
    if (pending) next(pending.run);
  }, [next, pending]);

  useEffect(
    () => () => {
      if (captureFrame.current !== null) cancelAnimationFrame(captureFrame.current);
    },
    []
  );

  return (
    <View
      // Offscreen but genuinely laid out. Anything hidden with opacity or
      // display captures as blank.
      style={{ position: 'absolute', left: -9999, top: -9999, width: PIN_WIDTH, height: PIN_HEIGHT }}
      pointerEvents="none">
      {pending ? (
        <View ref={hostRef} collapsable={false}>
          {pending.kind === 'count' ? (
            <CountPin key={pending.id} count={pending.count} />
          ) : pending.kind === 'rating' ? (
            <RatingPin key={pending.id} label={pending.label} />
          ) : pending.post.imageUrl ? (
            <PhotoPin
              // Keyed so a new post remounts the image and fires onLoaded again;
              // reusing the element would leave the previous photo on screen and
              // never report.
              key={pending.post.id}
              uri={pending.post.imageUrl}
              cacheKey={pending.post.imagePath}
              onLoaded={onImageLoaded}
              onError={onImageError}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

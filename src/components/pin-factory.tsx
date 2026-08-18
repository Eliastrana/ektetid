import { Image, type ImageRef } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { PhotoPin, PIN_HEIGHT, PIN_WIDTH } from '@/components/photo-pin';
import { MAX_MAP_PHOTO_PINS, type LocatedPost } from '@/lib/map';

/** Cached across mounts: capturing the same pin twice is pure waste. */
const cache = new Map<string, ImageRef>();

type PendingPin = {
  post: LocatedPost;
  run: number;
};

type Props = {
  posts: LocatedPost[];
  onReady: (icons: Map<string, ImageRef>) => void;
};

/**
 * Renders pins offscreen, captures each one, and hands back native image refs.
 *
 * Apple Maps needs a finished image — it will not compose a photo into its own
 * pin — so the pin is built as a React view and photographed. The rendering
 * host sits at a large negative offset rather than behind `opacity: 0` or
 * `display: none`: a view that is not actually laid out captures blank.
 */
export function PinFactory({ posts, onReady }: Props) {
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

    // The first render contains coordinates but deliberately has no signed
    // URLs. Keep any already-visible cached icons during that short phase;
    // clearing them here is what made revisiting the map flash back to the
    // loading glyphs.
    if (posts.length > 0 && wanted.length === 0) {
      setPending(null);
      return () => {
        if (activeRun.current === run) activeRun.current += 1;
      };
    }

    // Warm a small leading window. Prefetching all thirty at once can delay the
    // first visible pin on a constrained connection, while the remaining tiny
    // thumbnails will naturally load as their turn reaches the capture host.
    const urls = wanted.map((post) => post.imageUrl).filter((url): url is string => !!url);
    if (urls.length) void Image.prefetch(urls.slice(0, 8), 'memory-disk');

    results.current = new Map();
    const uncached: LocatedPost[] = [];
    for (const post of wanted) {
      const hit = cache.get(post.imagePath);
      if (hit) results.current.set(post.id, hit);
      else uncached.push(post);
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

    queue.current = uncached.map((post) => ({ post, run }));
    next(run);

    return () => {
      if (activeRun.current === run) {
        activeRun.current += 1;
        queue.current = [];
      }
    };
  }, [next, onReady, posts]);

  const capture = useCallback(async () => {
    const item = pending;
    if (!item || !hostRef.current || item.run !== activeRun.current) return;

    try {
      const uri = await captureRef(hostRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const ref = await Image.loadAsync({ uri });
      if (item.run !== activeRun.current) return;

      cache.set(item.post.imagePath, ref);
      results.current.set(item.post.id, ref);

      // Publish each completed pin instead of holding the whole sequential
      // queue hostage. The first photos now replace their native fallback as
      // soon as they are ready.
      onReady(new Map(results.current));
    } catch {
      // This pin keeps the fallback glyph; one bad capture is not worth
      // abandoning the rest.
    } finally {
      next(item.run);
    }
  }, [next, onReady, pending]);

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
      {pending?.post.imageUrl ? (
        <View ref={hostRef} collapsable={false}>
          <PhotoPin
            // Keyed so a new post remounts the image and fires onLoaded again;
            // reusing the element would leave the previous photo on screen and
            // never report.
            key={pending.post.id}
            uri={pending.post.imageUrl}
            onLoaded={onImageLoaded}
            onError={onImageError}
          />
        </View>
      ) : null}
    </View>
  );
}

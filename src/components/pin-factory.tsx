import { Image, type ImageRef } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { PhotoPin, PIN_HEIGHT, PIN_WIDTH } from '@/components/photo-pin';
import type { LocatedPost } from '@/lib/map';

/**
 * How many pins get a photo.
 *
 * Each one is a view render plus a capture plus an image decode, so this is
 * bounded work rather than free. Past this density the pins overlap into mush
 * anyway and the photo stops carrying information.
 */
const MAX_PHOTO_PINS = 40;

/** Cached across mounts: capturing the same pin twice is pure waste. */
const cache = new Map<string, ImageRef>();

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
  const [pending, setPending] = useState<LocatedPost | null>(null);
  const hostRef = useRef<View>(null);
  const queue = useRef<LocatedPost[]>([]);
  const results = useRef<Map<string, ImageRef>>(new Map());

  const next = useCallback(() => {
    const item = queue.current.shift();
    if (!item) {
      onReady(new Map(results.current));
      setPending(null);
      return;
    }
    setPending(item);
  }, [onReady]);

  useEffect(() => {
    const wanted = posts.slice(0, MAX_PHOTO_PINS).filter((post) => post.imageUrl);

    results.current = new Map();
    const uncached: LocatedPost[] = [];
    for (const post of wanted) {
      const hit = cache.get(post.id);
      if (hit) results.current.set(post.id, hit);
      else uncached.push(post);
    }

    // Everything was cached, so there is nothing to render.
    if (uncached.length === 0) {
      onReady(new Map(results.current));
      setPending(null);
      return;
    }

    queue.current = uncached;
    next();
  }, [next, onReady, posts]);

  const capture = useCallback(async () => {
    const post = pending;
    if (!post || !hostRef.current) return;

    try {
      const uri = await captureRef(hostRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const ref = await Image.loadAsync({ uri });
      cache.set(post.id, ref);
      results.current.set(post.id, ref);
    } catch {
      // This pin keeps the fallback glyph; one bad capture is not worth
      // abandoning the rest.
    } finally {
      next();
    }
  }, [next, pending]);

  /**
   * Fired once the photo has decoded. One frame is still allowed after that so
   * the decoded image has actually been painted — onLoadEnd reports the decode,
   * not the draw.
   */
  const onImageLoaded = useCallback(() => {
    const timer = setTimeout(capture, 32);
    return () => clearTimeout(timer);
  }, [capture]);

  return (
    <View
      // Offscreen but genuinely laid out. Anything hidden with opacity or
      // display captures as blank.
      style={{ position: 'absolute', left: -9999, top: -9999, width: PIN_WIDTH, height: PIN_HEIGHT }}
      pointerEvents="none">
      {pending?.imageUrl ? (
        <View ref={hostRef} collapsable={false}>
          <PhotoPin
            // Keyed so a new post remounts the image and fires onLoaded again;
            // reusing the element would leave the previous photo on screen and
            // never report.
            key={pending.id}
            uri={pending.imageUrl}
            onLoaded={onImageLoaded}
          />
        </View>
      ) : null}
    </View>
  );
}


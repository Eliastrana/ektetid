import type { View } from 'react-native';

/**
 * Where on screen a card sits, so the album can grow out of it.
 *
 * Passed through route params, which are strings — hence the encode/decode
 * pair rather than handing an object around.
 */
export type Origin = { x: number; y: number; width: number; height: number };

/**
 * Measure a view in window coordinates.
 *
 * Resolves null rather than rejecting if the view has gone: a missing origin
 * just means the transition falls back to a plain fade, which is a far better
 * outcome than failing to open the album at all.
 */
export function measureOrigin(ref: React.RefObject<View | null>): Promise<Origin | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);

    node.measureInWindow((x, y, width, height) => {
      if ([x, y, width, height].some((n) => typeof n !== 'number' || Number.isNaN(n))) {
        return resolve(null);
      }
      resolve({ x, y, width, height });
    });
  });
}

export function encodeOrigin(origin: Origin | null): Record<string, string> {
  if (!origin) return {};
  return {
    ox: Math.round(origin.x).toString(),
    oy: Math.round(origin.y).toString(),
    ow: Math.round(origin.width).toString(),
    oh: Math.round(origin.height).toString(),
  };
}

export function decodeOrigin(params: {
  ox?: string;
  oy?: string;
  ow?: string;
  oh?: string;
}): Origin | null {
  const values = [params.ox, params.oy, params.ow, params.oh].map((v) =>
    v == null ? NaN : Number.parseFloat(v)
  );
  if (values.some(Number.isNaN)) return null;
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

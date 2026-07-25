import { encode as encodeBlurhash } from 'blurhash';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

/** Long edge of the uploaded image. Plenty for a full-bleed phone screen. */
const MAX_EDGE = 2048;

/** Size of the throwaway thumbnail used to derive blurhash and luminance. */
const PROBE_EDGE = 32;

export type ProcessedImage = {
  uri: string;
  width: number;
  height: number;
  blurhash: string;
  /**
   * Mean brightness (0..1) of the top quarter of the photo.
   *
   * The web app recomputed this on a canvas on every single view just to pick
   * between black and white overlay text. Doing it once here means the carousel
   * can read it straight off the row.
   */
  luminance: number;
};

function fit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Downscale to a 32px probe, decode it, and derive both the blurhash
 * placeholder and the top-strip luminance from the same pixel buffer.
 */
async function probe(uri: string): Promise<{ blurhash: string; luminance: number }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: PROBE_EDGE, height: PROBE_EDGE });

  const rendered = await context.renderAsync();
  const probeImage = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

  // Read the bytes directly. Hermes does not reliably provide atob, so going
  // via base64 would mean shipping a decoder for no reason.
  const bytes = new Uint8Array(await new File(probeImage.uri).arrayBuffer());
  const decoded = decodeJpeg(bytes, { useTArray: true });
  const pixels = new Uint8ClampedArray(decoded.data);

  const blurhash = encodeBlurhash(pixels, decoded.width, decoded.height, 4, 3);

  // Rec. 601 luma over the top quarter, matching the region the original
  // sampled with its canvas.
  const stripRows = Math.max(1, Math.floor(decoded.height / 4));
  let total = 0;
  let counted = 0;
  for (let y = 0; y < stripRows; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const i = (y * decoded.width + x) * 4;
      total += (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
      counted += 1;
    }
  }

  return { blurhash, luminance: counted ? total / counted / 255 : 0.5 };
}

/** Resize, compress, and derive the placeholder and luminance metadata. */
export async function processImage(
  uri: string,
  sourceWidth: number,
  sourceHeight: number
): Promise<ProcessedImage> {
  const target = fit(sourceWidth, sourceHeight, MAX_EDGE);

  const context = ImageManipulator.manipulate(uri);
  context.resize(target);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });

  const { blurhash, luminance } = await probe(uri);

  return {
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    blurhash,
    luminance,
  };
}

/** Selfies are only ever shown small, so they get a tighter bound. */
export async function processSelfie(uri: string): Promise<{ uri: string }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1080 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri };
}

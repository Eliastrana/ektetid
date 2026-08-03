/**
 * Import the old EkteTid website's photos into the app.
 *
 * The web version was a broadcast: Elias authored posts in Sanity, friends
 * browsed them. This walks that dataset and republishes it as ordinary posts
 * owned by one account, so the years of photos already published do not stop
 * at the day the app shipped.
 *
 * Plain JavaScript rather than TypeScript on purpose: it is a one-off run from
 * a terminal, and adding a TS runner to the project for it would be a
 * permanent dependency bought for a temporary job.
 *
 *   node --env-file=.env scripts/import-sanity.mjs --dry-run
 *   EKTETID_EMAIL=… EKTETID_PASSWORD=… node --env-file=.env scripts/import-sanity.mjs
 *
 * Safe to re-run: every created album and post is recorded in a ledger keyed by
 * the Sanity document id, and anything already there is skipped. A run killed
 * halfway resumes where it stopped.
 */

import { createClient } from '@supabase/supabase-js';
import { encode as encodeBlurhash } from 'blurhash';
import exifr from 'exifr';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SANITY_PROJECT = '3fashnpi';
const SANITY_DATASET = 'production';
const SANITY_API = `https://${SANITY_PROJECT}.api.sanity.io/v2023-01-01/data/query/${SANITY_DATASET}`;

/** Matches the app: plenty for a full-bleed phone screen, and no more. */
const MAX_EDGE = 2048;
const SELFIE_WIDTH = 1080;

/**
 * WebP rather than the JPEG the app writes.
 *
 * The bucket has accepted image/webp since the first storage migration, and at
 * matched visual quality it lands roughly a third smaller than JPEG — which
 * over 185 photos and their selfies is the difference between comfortably
 * inside the free tier and thinking about it. `effort: 6` spends more time
 * searching for a better encoding; irrelevant for a one-off script, and worth
 * a few percent.
 *
 * Set IMPORT_FORMAT=jpeg to fall back to exactly what the app produces.
 */
const FORMAT = process.env.IMPORT_FORMAT === 'jpeg' ? 'jpeg' : 'webp';
const IMAGE_QUALITY = 82;
const SELFIE_QUALITY = 78;

const PROBE_EDGE = 32;
const BUCKET = 'photos';

const here = dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = join(here, '.import-ledger.json');

const dryRun = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Sanity
// ---------------------------------------------------------------------------

async function groq(query) {
  const url = `${SANITY_API}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Sanity ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  return body.result;
}

/**
 * Every album with its photos, in the order the album itself defines.
 *
 * `images[]->` dereferences in array order, which is the order the carousel
 * showed them in — so position in the new album matches position in the old
 * one without needing to sort by anything.
 */
function albumsQuery() {
  return `*[_type == "album" && !(_id in path("drafts.**"))]{
    _id, title, description,
    "images": images[]->{
      _id, title, description, date, location,
      "imageUrl": image.asset->url,
      "selfieUrl": selfie.asset->url,
      "exif": image.asset->metadata.exif
    }
  }`;
}

// ---------------------------------------------------------------------------
// images
// ---------------------------------------------------------------------------

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Coordinates out of the original file's own EXIF.
 *
 * Sanity's extracted `metadata.location` is empty for every photo in this
 * dataset, but that is Sanity's index rather than the file — so the original
 * bytes get asked directly. Most of these came off a camera with no GPS, so
 * the honest answer is usually null, and null means the post simply does not
 * appear on the map.
 */
async function coordinates(buffer) {
  try {
    const gps = await exifr.gps(buffer);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }
    // 0,0 is in the Atlantic and is what a camera writes when it has a GPS
    // chip but no fix.
    if (gps.latitude === 0 && gps.longitude === 0) return null;
    return { latitude: gps.latitude, longitude: gps.longitude };
  } catch {
    return null;
  }
}

/**
 * The blurhash placeholder and the top-strip luminance, from one 32px probe.
 *
 * Deliberately identical to src/lib/image-pipeline.ts, including the Rec. 601
 * weights and the top-quarter strip: the carousel picks black or white overlay
 * text off this number, and an imported post that computed it differently
 * would be subtly wrong in a way nobody would trace back to here.
 */
async function probe(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(PROBE_EDGE, PROBE_EDGE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data);
  const blurhash = encodeBlurhash(pixels, info.width, info.height, 4, 3);

  const stripRows = Math.max(1, Math.floor(info.height / 4));
  let total = 0;
  let counted = 0;
  for (let y = 0; y < stripRows; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4;
      total += (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
      counted += 1;
    }
  }

  return { blurhash, luminance: counted ? total / counted / 255 : 0.5 };
}

function encode(pipeline, quality) {
  return FORMAT === 'webp'
    ? pipeline.webp({ quality, effort: 6 })
    : pipeline.jpeg({ quality, mozjpeg: true });
}

async function processImage(buffer) {
  // `withoutEnlargement` keeps a photo smaller than the bound at its own size
  // rather than upscaling it into blur.
  const resized = await encode(
    sharp(buffer).rotate().resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    }),
    IMAGE_QUALITY
  ).toBuffer();

  // Probed from the resized copy, as the app does: same averages, one less
  // full-resolution decode.
  const { blurhash, luminance } = await probe(resized);
  return { buffer: resized, blurhash, luminance };
}

async function processSelfie(buffer) {
  return encode(
    sharp(buffer).rotate().resize({ width: SELFIE_WIDTH, withoutEnlargement: true }),
    SELFIE_QUALITY
  ).toBuffer();
}

// ---------------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------------

async function readLedger() {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, 'utf8'));
  } catch {
    return { albums: {}, posts: {} };
  }
}

async function writeLedger(ledger) {
  if (dryRun) return;
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.EKTETID_EMAIL;
  const password = process.env.EKTETID_PASSWORD;

  if (!url || !anonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY. Run with --env-file=.env');
  }
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    throw new Error(`.env points at local Supabase (${url}). Switch it to the cloud project.`);
  }
  if (!dryRun && (!email || !password)) {
    throw new Error('Set EKTETID_EMAIL and EKTETID_PASSWORD, or pass --dry-run.');
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId = null;
  if (!dryRun) {
    // Signed in as an ordinary user, so every insert below is checked by the
    // same row-level security the app runs under. No service-role key exists
    // anywhere in this script, which is the point.
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Sign-in failed: ${error.message}`);
    userId = data.user.id;
    console.log(`signed in as ${email} (${userId})`);
  }

  const albums = await groq(albumsQuery());
  const ledger = await readLedger();

  const totalPhotos = albums.reduce((sum, album) => sum + (album.images?.length ?? 0), 0);
  console.log(
    `${albums.length} albums, ${totalPhotos} photos, format=${FORMAT}${dryRun ? ' (dry run)' : ''}`
  );

  let done = 0;
  let skipped = 0;
  let bytes = 0;

  for (const album of albums) {
    const images = (album.images ?? []).filter((image) => image?.imageUrl);
    if (images.length === 0) continue;

    let albumId = ledger.albums[album._id];
    if (!albumId) {
      if (dryRun) {
        console.log(`\n[album] ${album.title?.trim()} — ${images.length} photos`);
        albumId = 'dry-run';
      } else {
        const { data, error } = await supabase
          .from('albums')
          .insert({
            owner_id: userId,
            title: album.title?.trim() || 'Uten navn',
            description: album.description?.trim() || null,
          })
          .select('id')
          .single();
        if (error) throw new Error(`Album "${album.title}": ${error.message}`);
        albumId = data.id;
        ledger.albums[album._id] = albumId;
        await writeLedger(ledger);
        console.log(`\n[album] ${album.title?.trim()} → ${albumId}`);
      }
    } else {
      console.log(`\n[album] ${album.title?.trim()} → ${albumId} (existing)`);
    }

    for (const image of images) {
      if (ledger.posts[image._id]) {
        skipped += 1;
        continue;
      }

      const label = image.title?.trim() || image._id.slice(0, 8);
      try {
        const original = await download(image.imageUrl);
        const geo = await coordinates(original);
        const processed = await processImage(original);
        bytes += processed.buffer.length;

        let selfie = null;
        if (image.selfieUrl) {
          selfie = await processSelfie(await download(image.selfieUrl));
          bytes += selfie.length;
        }

        if (dryRun) {
          console.log(
            `  ${label} — ${(processed.buffer.length / 1024).toFixed(0)} kB` +
              `${selfie ? ` + ${(selfie.length / 1024).toFixed(0)} kB selfie` : ''}` +
              `${geo ? ` @ ${geo.latitude.toFixed(4)},${geo.longitude.toFixed(4)}` : ''}`
          );
          done += 1;
          continue;
        }

        const imagePath = await upload(supabase, userId, processed.buffer);
        const selfiePath = selfie ? await upload(supabase, userId, selfie) : null;

        const { data, error } = await supabase.rpc('create_post', {
          p_album_id: albumId,
          p_image_path: imagePath,
          p_selfie_path: selfiePath ?? undefined,
          p_title: image.title?.trim() || undefined,
          p_description: image.description?.trim() || undefined,
          p_location: image.location?.trim() || undefined,
          p_taken_at: takenAt(image),
          p_exif: image.exif ?? undefined,
          p_blurhash: processed.blurhash,
          p_luminance: processed.luminance,
          p_latitude: geo?.latitude ?? undefined,
          p_longitude: geo?.longitude ?? undefined,
        });

        if (error) {
          // The row never landed, so the bytes are orphaned. Same cleanup the
          // app does, for the same reason.
          await supabase.storage
            .from(BUCKET)
            .remove([imagePath, ...(selfiePath ? [selfiePath] : [])]);
          throw new Error(error.message);
        }

        ledger.posts[image._id] = data.id;
        await writeLedger(ledger);
        done += 1;
        console.log(`  ${done}/${totalPhotos} ${label}`);
      } catch (caught) {
        // One bad photo should not end a run of 185. It stays out of the
        // ledger, so the next run retries exactly this one.
        console.error(`  ! ${label}: ${caught.message}`);
      }
    }
  }

  console.log(
    `\ndone: ${done} imported, ${skipped} already there, ${(bytes / 1024 / 1024).toFixed(1)} MB`
  );
}

/**
 * Storage paths are '{user_id}/{uuid}.{ext}'. The storage policy reads the
 * owner out of the first segment, so this layout is load-bearing — see
 * supabase/migrations/0004_storage.sql.
 */
async function upload(supabase, userId, buffer) {
  const extension = FORMAT === 'webp' ? 'webp' : 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: `image/${FORMAT}`,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * When the photo was taken.
 *
 * The album's own `date` field first, then EXIF, then now. Four of the 185 have
 * no date at all, and a post with no date would sort to whenever it happened to
 * be imported.
 */
function takenAt(image) {
  const candidate =
    image.date ?? image.exif?.DateTimeOriginal ?? image.exif?.DateTimeDigitized ?? null;
  if (!candidate) return new Date().toISOString();
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

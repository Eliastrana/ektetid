import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';

import type { PendingCapture } from '@/lib/pending-capture';
import { secureStorage } from '@/lib/secure-storage';
import { hasPro } from '@/lib/social';

const ARCHIVE_ALBUM = 'EkteTid';

function preferenceKey(userId: string): string {
  return `ektetid.local_archive.${userId}`;
}

/** Pro gets the archive automatically unless the user explicitly turns it off. */
export async function isLocalArchiveEnabled(userId: string): Promise<boolean> {
  return (await secureStorage.getItem(preferenceKey(userId))) !== 'false';
}

export async function setLocalArchiveEnabled(userId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    const permission = await requestPermissionsAsync(false, ['photo', 'video']);
    if (!permission.granted) {
      throw new Error('Gi EkteTid tilgang til Bilder for å bruke automatisk arkiv.');
    }
  }

  await secureStorage.setItem(preferenceKey(userId), String(enabled));
}

/**
 * Copy the just-published main media into a dedicated Photos album.
 *
 * This deliberately runs after the database write. Local Photos access is a
 * convenience, so a denied permission or a device-side failure must never
 * turn a successful post into a failed one.
 */
export async function archivePublishedCapture(
  userId: string,
  capture: PendingCapture
): Promise<boolean> {
  const [enabled, pro] = await Promise.all([isLocalArchiveEnabled(userId), hasPro(userId)]);
  if (!enabled || !pro) return false;

  const kind = capture.videoUri ? 'video' : 'photo';
  const permission = await requestPermissionsAsync(false, [kind]);
  if (!permission.granted) return false;

  const uri = capture.videoUri ?? capture.imageUri;
  const album = await Album.get(ARCHIVE_ALBUM);
  if (album) {
    await Asset.create(uri, album);
  } else {
    await Album.create(ARCHIVE_ALBUM, [uri], false);
  }
  return true;
}

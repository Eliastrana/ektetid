import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

/** Download a signed media URL and add it to the device's camera roll. */
export async function saveMediaLocally(
  url: string,
  postId: string,
  kind: 'photo' | 'video'
): Promise<void> {
  const permission = await requestPermissionsAsync(true, [kind]);
  if (!permission.granted) {
    throw new Error('Gi EkteTid tilgang til å lagre i Bilder i Innstillinger.');
  }

  const extension = kind === 'video' ? 'mov' : 'jpg';
  const destination = new File(Paths.cache, `ektetid-${postId}.${extension}`);
  const downloaded = await File.downloadFileAsync(url, destination, { idempotent: true });
  await Asset.create(downloaded.uri);
}

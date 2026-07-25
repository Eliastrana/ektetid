import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';

/** Avatars are never shown larger than ~72pt, so 512 is generous even at 3x. */
const AVATAR_SIZE = 512;

/**
 * Let the user pick a picture and crop it square.
 *
 * Returns null when they cancel, which is not an error and should stay silent.
 */
export async function pickAvatar(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

/**
 * Upload an avatar and point the profile at it.
 *
 * The object path is fixed at '{user_id}/avatar.jpg' and written with upsert,
 * so replacing a picture overwrites the old one instead of leaving orphans
 * behind. That makes the URL stable, which in turn means it would be cached
 * forever — hence the version parameter, which changes on every upload and
 * forces clients to refetch.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(localUri);
  context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
  const rendered = await context.renderAsync();
  const resized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });

  const path = `${userId}/avatar.jpg`;
  const bytes = await new File(resized.uri).arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId);
  if (profileError) throw profileError;

  return url;
}

/** Remove the picture and clear the profile reference. */
export async function removeAvatar(userId: string): Promise<void> {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);
  if (profileError) throw profileError;

  // Best effort: the profile no longer points at it either way, so a failure
  // here leaves an unreferenced file rather than a broken avatar.
  await supabase.storage.from(BUCKET).remove([`${userId}/avatar.jpg`]);
}

import * as SecureStore from 'expo-secure-store';

/**
 * A Supabase auth storage adapter backed by the Keychain / Keystore.
 *
 * SecureStore rejects values much over 2KB, and a Supabase session carrying a
 * Google ID token comfortably exceeds that. So values are split into numbered
 * chunks and a small header records how many there are.
 */

const CHUNK_SIZE = 1536;

const headerKey = (key: string) => `${key}.meta`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readChunkCount(key: string): Promise<number> {
  const header = await SecureStore.getItemAsync(headerKey(key));
  if (!header) return 0;
  const count = Number.parseInt(header, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function clear(key: string): Promise<void> {
  const count = await readChunkCount(key);
  const deletions: Promise<void>[] = [SecureStore.deleteItemAsync(headerKey(key))];
  for (let i = 0; i < count; i += 1) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  }
  await Promise.all(deletions);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readChunkCount(key);
    if (count === 0) return null;

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i)))
    );

    // A partially-evicted value is unusable; treat it as absent rather than
    // handing Supabase a truncated session it would fail to parse.
    if (chunks.some((chunk) => chunk == null)) {
      await clear(key);
      return null;
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await clear(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk))
    );
    await SecureStore.setItemAsync(headerKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await clear(key);
  },
};

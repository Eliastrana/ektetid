/**
 * The browser has no camera roll to save into.
 *
 * A stub rather than a guard inside save-media.ts, because the problem is the
 * import itself: expo-media-library declares `class Query extends
 * ExpoMediaLibraryNext.Query` at module scope, and with no web implementation
 * that base is undefined. Merely importing it throws while the module loads,
 * which took down the whole static web export — long before any code could
 * check which platform it was on.
 */
export async function saveMediaLocally(
  _url: string,
  _postId: string,
  _kind: 'photo' | 'video'
): Promise<void> {
  throw new Error('Nedlasting til Bilder er bare tilgjengelig i appen.');
}

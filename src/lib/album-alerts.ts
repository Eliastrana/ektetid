import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Albums you have asked to be alerted about.
 *
 * Held in one module-level store rather than per screen: the feed and a
 * friend's profile show the same albums, and a bell switched on in one must
 * already be lit when you go back to the other.
 */
type State = { userId: string | null; ids: ReadonlySet<string> };

const EMPTY: ReadonlySet<string> = new Set();
let state: State = { userId: null, ids: EMPTY };
const listeners = new Set<() => void>();
let inflight: { userId: string; promise: Promise<void> } | null = null;

function publish(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function fetchAlbumAlerts(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('album_alerts')
    .select('album_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.album_id));
}

export async function setAlbumAlert(
  userId: string,
  albumId: string,
  enabled: boolean
): Promise<void> {
  const { error } = enabled
    ? await supabase
        .from('album_alerts')
        .upsert({ user_id: userId, album_id: albumId }, { ignoreDuplicates: true })
    : await supabase.from('album_alerts').delete().eq('user_id', userId).eq('album_id', albumId);
  if (error) throw error;
}

function load(userId: string): Promise<void> {
  if (inflight?.userId === userId) return inflight.promise;
  const promise = fetchAlbumAlerts(userId)
    .then((ids) => publish({ userId, ids }))
    .catch(() => {
      // The bells are a hint, not the album itself. Without them the grid is
      // still fully usable, and the next focus tries again.
    })
    .finally(() => {
      if (inflight?.userId === userId) inflight = null;
    });
  inflight = { userId, promise };
  return promise;
}

export function useAlbumAlerts(userId: string | undefined) {
  const snapshot = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (userId && state.userId !== userId) void load(userId);
  }, [userId]);

  const ids = userId && snapshot.userId === userId ? snapshot.ids : EMPTY;

  /** Optimistic; reverts and rethrows if the server refuses. */
  const setEnabled = useCallback(
    async (albumId: string, enabled: boolean) => {
      if (!userId) return;
      const before = state.userId === userId ? state.ids : EMPTY;
      const next = new Set(before);
      if (enabled) next.add(albumId);
      else next.delete(albumId);
      publish({ userId, ids: next });

      try {
        await setAlbumAlert(userId, albumId, enabled);
      } catch (error) {
        publish({ userId, ids: before });
        throw error;
      }
    },
    [userId]
  );

  return { ids, setEnabled, refresh: useCallback(() => (userId ? load(userId) : undefined), [userId]) };
}

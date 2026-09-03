import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import QuickCameraWidget from '@/widgets/quick-camera-widget';
import RecentFriendsWidget, {
  type RecentFriendWidgetItem,
} from '@/widgets/recent-friends-widget';

async function recentFriends(): Promise<RecentFriendWidgetItem[]> {
  const { data, error } = await supabase.rpc('recent_friend_posts', { p_limit: 4 });
  if (error) throw error;

  return data.map((row) => {
    const name = row.display_name?.trim() || row.username;
    return {
      id: row.author_id,
      name,
      initial: (name.trim()[0] || '?').toLocaleUpperCase('nb-NO'),
      postedAt: new Date(row.posted_at).getTime(),
      albumId: row.album_id,
      albumTitle: row.album_title,
      postId: row.post_id,
    };
  });
}

/** Keep WidgetKit's shared snapshot fresh while the signed-in app is alive. */
export function useHomeWidgets(userId: string | null | undefined): void {
  useEffect(() => {
    if (userId === undefined) return;

    let active = true;

    function refresh() {
      // A snapshot makes the layout available after a fresh installation.
      QuickCameraWidget.updateSnapshot({});

      if (!userId) {
        RecentFriendsWidget.updateSnapshot({ state: 'signedOut', friends: [] });
        return;
      }

      void recentFriends()
        .then((friends) => {
          if (active) RecentFriendsWidget.updateSnapshot({ state: 'ready', friends });
        })
        // A stale snapshot is more useful than replacing it with an error card.
        .catch(() => {});
    }

    refresh();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    if (!userId) {
      return () => {
        active = false;
        appState.remove();
      };
    }

    const channel = supabase
      .channel(`home-widgets-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        refresh
      )
      .subscribe();

    return () => {
      active = false;
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}

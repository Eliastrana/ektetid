import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import {
  listFriendSuggestions,
  sendFriendRequest,
  type FriendSuggestion,
} from '@/lib/friends';

/**
 * People the viewer probably knows, drawn from friends of their friends.
 *
 * Lives on the feed rather than only on the friends page because the feed is
 * where the absence is felt: a thin feed reads as an empty app, not as a
 * prompt to add anyone. Renders nothing at all when there is no one to
 * suggest — an empty carousel is worse than no carousel.
 */
export function FriendSuggestions({ limit = 12 }: { limit?: number }) {
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;

  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void listFriendSuggestions(limit)
      .then((data) => {
        if (active) setSuggestions(data);
      })
      // Suggestions are an invitation, not part of the feed's job. A failure
      // here hides the strip rather than surfacing an error over the albums.
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [limit]);

  const add = useCallback(
    async (id: string) => {
      if (!selfId) return;
      setBusyId(id);
      void Haptics.selectionAsync();
      try {
        await sendFriendRequest(selfId, id);
        setSent((current) => new Set(current).add(id));
      } catch {
        // Leaving the button in its unsent state is the whole error report:
        // the row stays tappable and the reader can try again.
      } finally {
        setBusyId(null);
      }
    },
    [selfId]
  );

  if (!loaded || suggestions.length === 0) return null;

  return (
    <View className="pb-5">
      <View className="flex-row items-center justify-between pb-3">
        <Text className="text-sm text-muted">Folk du kanskje kjenner</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/venner')}>
          <Text className="text-sm text-ink">Se alle</Text>
        </Pressable>
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => {
          const already = sent.has(item.id);
          return (
            <View className="w-36 items-center gap-2 rounded-tile border border-ink bg-glass p-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Se profilen til ${item.username}`}
                onPress={() => router.push(`/profil/${item.id}`)}
                className="items-center gap-2 active:opacity-70">
                {item.avatar_url ? (
                  <Image
                    source={{ uri: item.avatar_url }}
                    style={{ width: 56, height: 56, borderRadius: 28 }}
                  />
                ) : (
                  <View className="h-14 w-14 rounded-full bg-surface-raised" />
                )}
                <Text numberOfLines={1} className="text-center text-sm text-ink">
                  {item.display_name ?? item.username}
                </Text>
                <Text numberOfLines={1} className="text-center text-xs text-muted">
                  {item.mutualCount} {item.mutualCount === 1 ? 'felles venn' : 'felles venner'}
                </Text>
              </Pressable>

              {busyId === item.id ? (
                <ActivityIndicator color="#ffffff" />
              ) : already ? (
                <Text className="py-2 text-xs text-muted">Sendt</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void add(item.id)}
                  className="w-full items-center rounded-full bg-ink py-2 active:opacity-80">
                  <Text className="text-sm text-canvas">Legg til</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

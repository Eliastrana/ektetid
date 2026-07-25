import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';

import { AlbumCard } from '@/components/album-card';
import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { encodeOrigin } from '@/lib/origin';
import { fetchFeed, type FeedAlbum } from '@/lib/feed';

export default function FeedScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [albums, setAlbums] = useState<FeedAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<1 | 2>(2);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setAlbums(await fetchFeed(userId));
      setError(null);
    } catch {
      setError('Klarte ikke å hente albumene.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Reload on focus so a freshly published post and its unseen counts are
  // current when returning from the camera or a carousel.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top']}>
        <FlatList
          data={albums}
          keyExtractor={(album) => album.id!}
          numColumns={columns}
          // Remounts the list when the count changes. FlatList cannot alter
          // numColumns on an existing instance and warns if you try.
          key={columns}
          contentContainerClassName="px-5 pb-32 gap-3"
          // Only meaningful with more than one column, and passing it at one
          // column wraps every row in a redundant view.
          columnWrapperClassName={columns > 1 ? 'gap-3' : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#ffffff"
            />
          }
          ListHeaderComponent={
            <View className="flex-row items-start justify-between pb-5 pt-2">
              <View className="flex-1">
                <Text className="text-5xl text-ink">EkteTid</Text>
                <Text className="mt-1 text-base text-muted">Det er tid for å være ekte</Text>
              </View>

              {/* Shows the layout it switches to, not the one you are in — a
                  control labelled with the current state reads as a status. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  columns === 2 ? 'Vis ett album per rad' : 'Vis to album per rad'
                }
                onPress={() => {
                  void Haptics.selectionAsync();
                  setColumns((current) => (current === 2 ? 1 : 2));
                }}
                hitSlop={8}
                className="mt-2 h-10 w-10 items-center justify-center rounded-full bg-glass active:bg-glass-strong">
                <SymbolView
                  name={columns === 2 ? 'square.fill' : 'square.grid.2x2.fill'}
                  size={17}
                  tintColor="#ffffff"
                  fallback={<Text className="text-base text-ink">▦</Text>}
                />
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View className="items-center py-20">
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : (
              <View className="items-center gap-2 py-20">
                <Text className="text-base text-ink">
                  {error ?? 'Ingen album ennå'}
                </Text>
                <Text className="text-center text-sm text-muted">
                  {error
                    ? 'Dra ned for å prøve igjen.'
                    : 'Ta ditt første bilde, eller legg til en venn.'}
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              wide={columns === 1}
              isOwn={item.owner_id === userId}
              onPress={(origin) =>
                router.push({
                  pathname: '/album/[id]',
                  params: {
                    id: item.id!,
                    ...encodeOrigin(origin),
                    // Lets the opening animation show the photo immediately
                    // rather than growing an empty rectangle.
                    ...(item.coverUrl ? { cover: item.coverUrl } : {}),
                    ...(item.cover_blurhash ? { cb: item.cover_blurhash } : {}),
                  },
                })
              }
            />
          )}
        />
      </Screen>
    </View>
  );
}

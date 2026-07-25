import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { AlbumCard } from '@/components/album-card';
import { Screen } from '@/components/screen';
import { fetchFeed, type FeedAlbum } from '@/lib/feed';

export default function FeedScreen() {
  const router = useRouter();
  const [albums, setAlbums] = useState<FeedAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAlbums(await fetchFeed());
      setError(null);
    } catch {
      setError('Klarte ikke å hente albumene.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
          numColumns={2}
          contentContainerClassName="px-5 pb-8 gap-3"
          columnWrapperClassName="gap-3"
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
            <View className="pb-5 pt-2">
              <Text className="text-5xl text-ink">EkteTid</Text>
              <Text className="mt-1 text-base text-muted">Det er tid for å være ekte</Text>
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
            <AlbumCard album={item} onPress={() => router.push(`/album/${item.id}`)} />
          )}
        />
      </Screen>
    </View>
  );
}

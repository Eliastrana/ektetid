import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';

import { AlbumCard } from '@/components/album-card';
import { FriendSuggestions } from '@/components/friend-suggestions';
import { useAuth } from '@/components/auth-provider';
import { PostStream } from '@/components/post-stream';
import { Screen } from '@/components/screen';
import { AlbumGridSkeleton } from '@/components/skeleton';
import { encodeOrigin } from '@/lib/origin';
import { fetchFeed, type FeedAlbum } from '@/lib/feed';

type FeedView = 'albums' | 'stream';

function FeedHeader({
  view,
  viewerPro,
  onProPress,
  onToggle,
}: {
  view: FeedView;
  viewerPro: boolean | null;
  onProPress: () => void;
  onToggle: () => void;
}) {
  return (
    <View className="flex-row items-start justify-between pb-5 pt-2">
      <View className="flex-1">
        <Text className="text-5xl text-ink">EkteTid</Text>
        <Text className="mt-1 text-base text-muted">
          {view === 'albums'
            ? 'Det er tid for å være ekte'
            : 'Nyeste innlegg fra deg og vennene dine'}
        </Text>
      </View>

      <View className="mt-2 flex-row items-center gap-2">
        {viewerPro !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={viewerPro ? 'EkteTid Pro er aktiv' : 'Se EkteTid Pro'}
            onPress={onProPress}
            hitSlop={6}
            className="h-8 items-center justify-center rounded-full bg-ink px-3.5 active:opacity-80">
            <Text className="text-xs font-semibold text-black">{viewerPro ? 'Pro' : 'Kjøp Pro'}</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === 'albums' ? 'Vis strømmen' : 'Vis albumene'}
          onPress={onToggle}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-glass active:bg-glass-strong">
          <SymbolView
            name={view === 'albums' ? 'rectangle.stack.fill' : 'square.grid.2x2.fill'}
            size={17}
            tintColor="#ffffff"
            fallback={<Text className="text-base text-ink">{view === 'albums' ? '▤' : '▦'}</Text>}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [albums, setAlbums] = useState<FeedAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<FeedView>('albums');
  const [viewerPro, setViewerPro] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await fetchFeed(userId);
      setAlbums(result.albums);
      setViewerPro(result.viewerPro);
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

  const toggleView = () => {
    void Haptics.selectionAsync();
    setView((current) => (current === 'albums' ? 'stream' : 'albums'));
  };

  const openPro = () => {
    void Haptics.selectionAsync();
    router.push('/innstillinger');
  };

  const header = (
    <>
      <FeedHeader
        view={view}
        viewerPro={viewerPro}
        onProPress={openPro}
        onToggle={toggleView}
      />
      {/* Someone with a handful of friends sees a thin feed and reads it as an
          empty app. Suggestions sit where that gap is felt. */}
      <FriendSuggestions />
    </>
  );

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top']}>
        {view === 'albums' ? (
          <FlatList
            data={albums}
            keyExtractor={(album) => album.id!}
            numColumns={2}
            contentContainerClassName="gap-3 px-5 pb-32"
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
            ListHeaderComponent={header}
            ListEmptyComponent={
              loading ? (
                <AlbumGridSkeleton />
              ) : (
                <View className="items-center gap-2 py-20">
                  <Text className="text-base text-ink">{error ?? 'Ingen album ennå'}</Text>
                  <Text className="text-center text-sm text-muted">
                    {error
                      ? 'Dra ned for å prøve igjen.'
                      : 'Ta ditt første bilde, eller legg til en venn.'}
                  </Text>
                  {/* Telling a new account to add friends without a way to get
                      there left the instruction to be acted on from memory. */}
                  {error ? null : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void Haptics.selectionAsync();
                        router.push('/venner');
                      }}
                      className="mt-4 rounded-full bg-ink px-5 py-3 active:opacity-80">
                      <Text className="text-sm text-canvas">Finn venner</Text>
                    </Pressable>
                  )}
                </View>
              )
            }
            renderItem={({ item }) => (
              <AlbumCard
                album={item}
                isOwn={item.owner_id === userId}
                pro={item.ownerPro}
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
        ) : (
          <PostStream header={header} />
        )}
      </Screen>
    </View>
  );
}

import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ErrorNotice } from '@/components/error-notice';
import { SkeletonBox } from '@/components/skeleton';
import { fetchPostFeed, type PostFeedItem } from '@/lib/post-feed';

function StreamSkeleton() {
  return (
    <View className="gap-5">
      {[0, 1].map((key) => (
        <View key={key} className="gap-3">
          <View className="flex-row items-center gap-3">
            <SkeletonBox style={{ width: 40, height: 40, borderRadius: 20 }} />
            <SkeletonBox style={{ width: 144, height: 16, borderRadius: 8 }} />
          </View>
          <SkeletonBox style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }} />
        </View>
      ))}
    </View>
  );
}

function PostCard({ item }: { item: PostFeedItem }) {
  const router = useRouter();
  const authorName = item.author.display_name ?? item.author.username;

  return (
    <View className="overflow-hidden rounded-tile bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Åpne ${item.title || 'innlegg'} av ${authorName}`}
        onPress={() =>
          router.push({
            pathname: '/album/[id]',
            params: {
              id: item.album.id,
              post: item.id,
              cover: item.imageUrl,
              ...(item.blurhash ? { cb: item.blurhash } : {}),
            },
          })
        }>
        <View className="aspect-[3/4] bg-surface-raised">
          <Image
            source={{ uri: item.imageUrl }}
            placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={160}
            style={{ flex: 1 }}
          />
          {item.video_path ? (
            <View className="absolute inset-0 items-center justify-center">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-overlay-strong">
                <SymbolView name="play.fill" size={24} tintColor="#ffffff" />
              </View>
            </View>
          ) : null}
          {item.rating ? (
            <View className="absolute right-3 top-3 flex-row items-center gap-1.5 rounded-full bg-overlay-strong px-3 py-2">
              <SymbolView
                name={`die.face.${item.rating}.fill` as 'die.face.1.fill'}
                size={16}
                tintColor="#ffffff"
              />
              <Text className="text-sm text-ink">{item.rating}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View className="gap-2 p-4">
        <View className="flex-row items-center gap-3">
          <Avatar
            url={item.author.avatar_url}
            name={authorName}
            seed={item.author.id}
            size={40}
            ringWidth={item.authorHasPro ? 2 : 0}
          />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-base text-ink">
              {authorName}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted">
              {item.album.title}
              {item.location ? ` · ${item.location}` : ''}
            </Text>
          </View>
        </View>

        {item.title ? <Text className="text-lg text-ink">{item.title}</Text> : null}
        {item.description ? (
          <Text numberOfLines={3} className="text-sm leading-5 text-muted">
            {item.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function PostStream({ header }: { header: ReactElement }) {
  const [posts, setPosts] = useState<PostFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPosts(await fetchPostFeed());
      setError(null);
    } catch {
      setError('Klarte ikke å hente strømmen.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostCard item={item} />}
      contentContainerClassName="gap-5 px-4 pb-32"
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews
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
          <StreamSkeleton />
        ) : error ? (
          <ErrorNotice message={error} />
        ) : (
          <Text className="py-20 text-center text-sm text-muted">Ingen innlegg ennå.</Text>
        )
      }
    />
  );
}

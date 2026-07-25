import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { FeedAlbum } from '@/lib/feed';

type Props = {
  album: FeedAlbum;
  onPress: () => void;
};

/**
 * The album cover from the original grid: a tall photo with a frosted info bar
 * floating over the bottom, and a red badge counting posts you have not seen.
 */
export function AlbumCard({ album, onPress }: Props) {
  const unseen = album.unseen_count ?? 0;
  const count = album.post_count ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.title}, ${count} bilder${unseen > 0 ? `, ${unseen} nye` : ''}`}
      onPress={onPress}
      className="flex-1 active:opacity-90">
      <View className="aspect-[3/4] overflow-hidden rounded-tile bg-surface">
        {album.coverUrl ? (
          <Image
            source={{ uri: album.coverUrl }}
            placeholder={album.cover_blurhash ? { blurhash: album.cover_blurhash } : undefined}
            transition={200}
            contentFit="cover"
            style={{ flex: 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-xs text-muted">Tomt album</Text>
          </View>
        )}

        <View className="absolute inset-x-2 bottom-2 rounded-glass border border-glass-border bg-glass p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className="flex-1 text-base text-ink">
              {album.title}
            </Text>
            <Text className="text-xs text-ink opacity-80">{count}</Text>
          </View>
          {album.description ? (
            <Text numberOfLines={1} className="mt-1 text-xs text-ink opacity-80">
              {album.description}
            </Text>
          ) : null}
        </View>
      </View>

      {unseen > 0 ? (
        <View className="absolute -right-1 -top-1 h-6 min-w-6 items-center justify-center rounded-full bg-alert px-1.5">
          <Text className="text-xs text-ink">{unseen}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

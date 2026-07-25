import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Scrim } from '@/components/scrim';
import type { FeedAlbum } from '@/lib/feed';

type Props = {
  album: FeedAlbum;
  onPress: () => void;
};

/**
 * The album cover from the original grid: a tall photo with its title reading
 * straight off the image, over a bottom dim, and a red badge counting posts
 * you have not seen.
 */
export function AlbumCard({ album, onPress }: Props) {
  const unseen = album.unseen_count ?? 0;
  const count = album.post_count ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.title}, ${count} bilder${unseen > 0 ? `, ${unseen} nye` : ''}`}
      onPress={onPress}
      // maxWidth caps a lone card at half the row. With numColumns={2}, flex-1
      // otherwise stretches the last item across the full width when the count
      // is odd, which makes it enormous.
      style={{ maxWidth: '50%' }}
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

        {album.coverUrl ? <Scrim /> : null}

        <View className="absolute inset-x-3 bottom-3">
          <View className="flex-row items-end justify-between gap-2">
            <Text numberOfLines={1} className="flex-1 text-base text-ink">
              {album.title}
            </Text>
            <Text className="text-xs text-ink opacity-70">{count}</Text>
          </View>
          {album.description ? (
            <Text numberOfLines={1} className="mt-0.5 text-xs text-ink opacity-70">
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

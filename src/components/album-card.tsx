import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Scrim } from '@/components/scrim';
import type { FeedAlbum } from '@/lib/feed';
import { measureOrigin, type Origin } from '@/lib/origin';

type Props = {
  album: FeedAlbum;
  /** Receives where the card was on screen, so the album can grow from it. */
  onPress: (origin: Origin | null) => void;
  /**
   * Your own album. Hides the unseen badge, which counts posts you have not
   * seen and is therefore meaningless for something you posted yourself.
   */
  isOwn?: boolean;
  /**
   * Show who the album belongs to. On the feed this stays on even for your own
   * albums: the grid is a mixed list, and cards with and without the row have
   * different content heights, so the titles stop lining up. Off on your own
   * profile, where every album is yours and the name is pure repetition.
   */
  showOwner?: boolean;
};

/**
 * The album cover from the original grid: a tall photo with its title reading
 * straight off the image over a bottom dim, and a red badge counting posts you
 * have not seen.
 */
export function AlbumCard({ album, onPress, isOwn = false, showOwner = true }: Props) {
  const cardRef = useRef<View>(null);
  const unseen = isOwn ? 0 : (album.unseen_count ?? 0);
  const count = album.post_count ?? 0;
  const owner = album.owner_display_name ?? album.owner_username ?? '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.title}${showOwner ? ` av ${owner}` : ''}, ${count} bilder${
        unseen > 0 ? `, ${unseen} nye` : ''
      }`}
      onPress={() => void measureOrigin(cardRef).then(onPress)}
      // maxWidth caps a lone card at half the row. With numColumns={2}, flex-1
      // otherwise stretches the last item across the full width when the count
      // is odd, which makes it enormous.
      style={{ maxWidth: '50%' }}
      className="flex-1 active:opacity-90">
      <View ref={cardRef} className="aspect-[3/4] overflow-hidden rounded-tile bg-surface">
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
          {showOwner ? (
            <View className="mb-1.5 flex-row items-center gap-1.5">
              {album.owner_avatar_url ? (
                <Image
                  source={{ uri: album.owner_avatar_url }}
                  style={{ width: 18, height: 18, borderRadius: 9 }}
                />
              ) : (
                <View className="h-[18px] w-[18px] items-center justify-center rounded-full bg-glass-strong">
                  <Text className="text-[9px] text-ink">
                    {owner.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text numberOfLines={1} className="flex-1 text-xs text-ink opacity-85">
                {owner}
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-end justify-between gap-2">
            <Text numberOfLines={1} className="flex-1 text-base text-ink">
              {album.title}
            </Text>
            <Text className="text-xs text-ink opacity-70">{count}</Text>
          </View>
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

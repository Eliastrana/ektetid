import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

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
  /** One card per row, so the cover gets the full width. */
  wide?: boolean;
};

/**
 * The album cover from the original grid: a tall photo with its title reading
 * straight off the image over a bottom dim, and a red badge counting posts you
 * have not seen.
 */
export function AlbumCard({
  album,
  onPress,
  isOwn = false,
  showOwner = true,
  wide = false,
}: Props) {
  const cardRef = useRef<View>(null);
  const unseen = isOwn ? 0 : (album.unseen_count ?? 0);
  const count = album.post_count ?? 0;
  const owner = album.owner_display_name ?? album.owner_username ?? '';
  const avatar = wide ? 24 : 18;

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
      style={wide ? undefined : { maxWidth: '50%' }}
      className="flex-1 active:opacity-90">
      {/* One shape at both sizes, so switching layout rezooms the same photo
          rather than recomposing it. */}
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

        {/* More breathing room at full width — the same 12pt inset that reads
            as generous on a half-width card looks cramped on a large one. */}
        <View className={wide ? 'absolute inset-x-5 bottom-5' : 'absolute inset-x-3 bottom-3'}>
          {/*
            Who the album belongs to, and what your relationship to it is.

            Three cases share one row so every card is the same height: your
            own, one a friend has shared with you and that you can post into,
            and one you can only look at. Without this, a shared album was
            indistinguishable from your own once you had posted into it.
          */}
          {showOwner ? (
            <View className="mb-1.5 flex-row items-center gap-1.5">
              {album.owner_avatar_url ? (
                <Image
                  source={{ uri: album.owner_avatar_url }}
                  style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }}
                />
              ) : (
                <View
                  className="items-center justify-center rounded-full bg-glass-strong"
                  style={{ width: avatar, height: avatar }}>
                  <Text className={`text-ink ${wide ? 'text-[11px]' : 'text-[9px]'}`}>
                    {owner.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text
                numberOfLines={1}
                className={`flex-1 text-ink opacity-85 ${wide ? 'text-sm' : 'text-xs'}`}>
                {isOwn ? 'Ditt album' : owner}
              </Text>
              {album.shared && !isOwn ? (
                <View className="flex-row items-center gap-1 rounded-full bg-glass-strong px-1.5 py-0.5">
                  <SymbolView
                    name="person.2.fill"
                    size={9}
                    tintColor="#ffffff"
                    fallback={<Text className="text-[9px] text-ink">··</Text>}
                  />
                  <Text className={`text-ink ${wide ? 'text-[11px]' : 'text-[9px]'}`}>Delt</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="flex-row items-end justify-between gap-2">
            <Text numberOfLines={1} className={`flex-1 text-ink ${wide ? 'text-2xl' : 'text-base'}`}>
              {album.title}
            </Text>
            <Text className={`text-ink opacity-70 ${wide ? 'text-base' : 'text-xs'}`}>{count}</Text>
          </View>

          {album.description ? (
            <Text
              numberOfLines={wide ? 2 : 1}
              className={`mt-0.5 text-ink opacity-70 ${wide ? 'text-sm' : 'text-xs'}`}>
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

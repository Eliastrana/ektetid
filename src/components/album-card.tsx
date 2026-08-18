import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Scrim } from '@/components/scrim';
import { albumCoverLayout } from '@/lib/album-customization';
import type { FeedAlbum } from '@/lib/feed';
import { measureOrigin, type Origin } from '@/lib/origin';

const EDITORIAL_SERIF = 'GravitasOne_400Regular';

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
  /** Pro owners get an understated monochrome frame around their profile photo. */
  pro?: boolean;
};

/**
 * The album cover from the original grid: a tall photo with its title reading
 * straight off the image over a bottom dim, and an understated badge counting
 * posts you have not seen.
 */
export function AlbumCard({
  album,
  onPress,
  isOwn = false,
  showOwner = true,
  wide = false,
  pro = false,
}: Props) {
  const cardRef = useRef<View>(null);
  const unseen = isOwn ? 0 : (album.unseen_count ?? 0);
  const count = album.post_count ?? 0;
  const owner = album.owner_display_name ?? album.owner_username ?? '';
  const avatar = wide ? 24 : 18;
  const layout = albumCoverLayout(album.cover_layout);
  const accent = album.accent_color ?? '#9B5CFF';
  const editorial = layout === 'editorial';

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
      <View
        ref={cardRef}
        className="aspect-[3/4] overflow-hidden rounded-tile bg-surface"
        style={
          layout === 'framed'
            ? {
                borderWidth: wide ? 8 : 6,
                borderColor: accent,
                borderCurve: 'continuous',
              }
            : undefined
        }>
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

        {album.coverUrl ? <Scrim height={editorial ? 0.72 : undefined} /> : null}

        {editorial ? (
          <>
            {album.coverUrl ? (
              <View
                pointerEvents="none"
                className="absolute inset-0"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.40)' }}
              />
            ) : null}
            <View
              pointerEvents="none"
              className="absolute inset-x-4 items-center justify-center"
              style={{ top: '25%', bottom: '27%' }}>
              <Text
                numberOfLines={wide ? 3 : 2}
                className={`text-center text-ink ${wide ? 'text-4xl' : 'text-[22px]'}`}
                style={{ fontFamily: EDITORIAL_SERIF, lineHeight: wide ? 43 : 27 }}>
                {album.title}
              </Text>
              {/*<View*/}
              {/*  className="mt-3 h-0.5 rounded-full"*/}
              {/*  style={{ width: wide ? 42 : 28, backgroundColor: accent }}*/}
              {/*/>*/}
            </View>
          </>
        ) : null}

        {unseen > 0 ? (
          <View
            className="absolute right-2.5 top-2.5 h-5 min-w-5 items-center justify-center rounded-full px-1.5"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.82)' }}>
            <Text
              className="text-[11px] font-medium text-black opacity-75"
              style={{ fontVariant: ['tabular-nums'] }}>
              {unseen}
            </Text>
          </View>
        ) : null}

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
            <View
              className={`${editorial && album.description ? 'mb-0.5' : 'mb-1.5'} flex-row items-center gap-1.5`}>
              {album.owner_avatar_url ? (
                <View
                  className="overflow-hidden rounded-full"
                  style={{
                    width: avatar,
                    height: avatar,
                    borderWidth: pro ? 1.5 : 0,
                    borderColor: pro ? '#ffffff' : 'transparent',
                  }}>
                  <Image
                    source={{ uri: album.owner_avatar_url }}
                    contentFit="cover"
                    style={{ flex: 1 }}
                  />
                </View>
              ) : (
                <View
                  className="items-center justify-center rounded-full bg-glass-strong"
                  style={{
                    width: avatar,
                    height: avatar,
                    borderWidth: pro ? 1.5 : 0,
                    borderColor: pro ? '#ffffff' : 'transparent',
                  }}>
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
                  <Text className={`text-ink ${wide ? 'text-[11px]' : 'text-[9px]'}`}>
                    Delt
                  </Text>
                </View>
              ) : null}
              {editorial ? (
                <Text
                  className={`text-ink opacity-70 ${wide ? 'text-sm' : 'text-xs'}`}
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {count}
                </Text>
              ) : null}
            </View>
          ) : null}

          {editorial && album.description ? (
            <Text
              numberOfLines={wide ? 2 : 1}
              className={`mb-1.5 text-ink opacity-70 ${wide ? 'text-sm' : 'text-xs'}`}>
              {album.description}
            </Text>
          ) : null}

          {!editorial || !showOwner ? (
            <View className="flex-row items-end justify-between gap-2">
              {!editorial ? (
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-ink ${wide ? 'text-2xl' : 'text-base'}`}>
                  {album.title}
                </Text>
              ) : (
                <View className="flex-1" />
              )}
              <Text
                className={`text-ink opacity-70 ${wide ? 'text-base' : 'text-xs'}`}
                style={{ fontVariant: ['tabular-nums'] }}>
                {count}
              </Text>
            </View>
          ) : null}

          {!editorial && album.description ? (
            <Text
              numberOfLines={wide ? 2 : 1}
              className={`mt-0.5 text-ink opacity-70 ${wide ? 'text-sm' : 'text-xs'}`}>
              {album.description}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Dimensions, FlatList, Modal, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { NativePostButton } from '@/components/native-post-button';
import { Screen } from '@/components/screen';
import type { AlbumPost } from '@/lib/album';
import { storageImageSource } from '@/lib/images';

const COLUMNS = 4;
const GAP = 3;

/**
 * Every post in the album at once, four across, for jumping straight to one.
 *
 * Tapping forward through a long album is the only way to reach its middle, and
 * the segmented progress bar stops being readable — and stops being drawn at
 * all — once there are more than thirty posts. This is the way back to a photo
 * the reader has already seen.
 */
export function PostGridSheet({
  posts,
  index,
  visible,
  onSelect,
  onClose,
}: {
  posts: AlbumPost[];
  index: number;
  visible: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const { width } = Dimensions.get('window');
  // Sized from the same padding the grid uses, so the last column ends flush
  // with the first rather than drifting by the accumulated gaps.
  const tile = useMemo(
    () => Math.floor((width - GAP * 2 - GAP * (COLUMNS - 1)) / COLUMNS),
    [width]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-canvas">
        <Screen className="flex-1" edges={['top', 'bottom']}>
          <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
            <Text className="text-base text-ink">
              {posts.length} {posts.length === 1 ? 'bilde' : 'bilder'}
            </Text>
            <NativePostButton
              label="Lukk oversikten"
              systemImage="xmark"
              appearance="glass"
              onPress={onClose}
            />
          </View>

          <FlatList
            data={posts}
            keyExtractor={(post) => post.id}
            numColumns={COLUMNS}
            // Opens already showing the current photo, however deep it sits.
            // Both of these count items, not rows; the offset is the row's,
            // because every item in a row shares one.
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({
              length: tile + GAP,
              offset: (tile + GAP) * Math.floor(i / COLUMNS),
              index: i,
            })}
            contentContainerStyle={{ padding: GAP, gap: GAP }}
            columnWrapperStyle={{ gap: GAP }}
            /*
             * Kept deliberately small, because every mounted tile starts a
             * download. The defaults render ten items and keep twenty-one
             * screens of them alive, which on a long album means the whole
             * thing decoding at once and the rows the reader is actually
             * looking at queued behind the rest.
             *
             * Three rows ahead is enough that scrolling at a normal speed never
             * reaches an empty one, and the blurhash covers it if it does.
             */
            initialNumToRender={COLUMNS * 4}
            maxToRenderPerBatch={COLUMNS * 3}
            windowSize={3}
            removeClippedSubviews
            renderItem={({ item, index: position }) => {
              const active = position === index;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Gå til bilde ${position + 1}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onSelect(position);
                  }}
                  style={{ width: tile, height: tile }}
                  className="overflow-hidden rounded-md bg-surface-raised active:opacity-70">
                  {item.thumbnailUrl ? (
                    <Image
                      // The small copy, not the full image. A tile is a quarter
                      // of the screen's width; the full one is up to 2048px, so
                      // this asks for about a hundredth of the bytes.
                      source={storageImageSource(
                        item.thumbnail_path ?? item.image_path,
                        item.thumbnailUrl
                      )}
                      placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
                      // The blurhash is there to be shown while the tile
                      // loads, so let it: without this expo-image holds the
                      // placeholder back until it has the real bytes, and the
                      // grid opens as a field of empty squares.
                      placeholderContentFit="cover"
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={120}
                      // Thumbnails are small and reopened constantly, so they
                      // are worth keeping on disk between sessions.
                      cachePolicy="memory-disk"
                      // The photo the reader is about to look at matters more
                      // than the grid they are leaving.
                      priority="low"
                      recyclingKey={item.id}
                    />
                  ) : null}

                  {/* A video is indistinguishable from a photo at this size. */}
                  {item.video_path ? (
                    <View className="absolute bottom-1 right-1">
                      <Icon
                        name="play.fill"
                        size={11}
                        tintColor="#ffffff"
                        fallback={<Text className="text-[10px] text-ink">▶</Text>}
                      />
                    </View>
                  ) : null}

                  {/* Marks where the reader already is, so tapping the grid
                      open and closed again does not lose their place. */}
                  {active ? (
                    <View className="absolute inset-0 rounded-md border-2 border-ink" />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Screen>
      </View>
    </Modal>
  );
}

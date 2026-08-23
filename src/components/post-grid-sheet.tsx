import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Dimensions, FlatList, Modal, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import type { AlbumPost } from '@/lib/album';

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lukk oversikten"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-glass">
              <SymbolView
                name="xmark"
                size={15}
                tintColor="#ffffff"
                fallback={<Text className="text-base text-ink">✕</Text>}
              />
            </Pressable>
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
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : null}

                  {/* A video is indistinguishable from a photo at this size. */}
                  {item.video_path ? (
                    <View className="absolute bottom-1 right-1">
                      <SymbolView
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

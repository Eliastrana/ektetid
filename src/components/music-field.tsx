import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { MusicPicker } from '@/components/music-picker';
import type { MusicTrack } from '@/lib/music';

/**
 * The attach-music row, shared by the composer and the post editor.
 *
 * One component because the two screens want the identical thing and the state
 * it can be in — nothing chosen, something chosen — is worth describing once.
 */
export function MusicField({
  track,
  onChange,
}: {
  track: MusicTrack | null;
  onChange: (track: MusicTrack | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <>
      <View className="rounded-tile bg-glass p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-base text-ink">Musikk</Text>
            <Text className="mt-0.5 text-xs text-muted">
              Et utdrag på 30 sekunder spilles når bildet åpnes
            </Text>
          </View>

          {track ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fjern musikken"
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(null);
              }}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-glass-strong">
              <Icon
                name="xmark"
                size={14}
                tintColor="#b0b4ba"
                fallback={<Text className="text-muted">✕</Text>}
              />
            </Pressable>
          ) : null}
        </View>

        {track ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Bytt musikk. Nå: ${track.title} av ${track.artist}`}
            onPress={() => setPicking(true)}
            className="mt-3 flex-row items-center gap-3 rounded-xl bg-surface-raised p-2 active:opacity-70">
            {track.artworkUrl ? (
              <Image
                source={{ uri: track.artworkUrl }}
                style={{ width: 44, height: 44, borderRadius: 6 }}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <View className="h-11 w-11 rounded-md bg-glass" />
            )}
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base text-ink">
                {track.title}
              </Text>
              <Text numberOfLines={1} className="text-sm text-muted">
                {track.artist}
              </Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicking(true)}
            className="mt-3 h-11 flex-row items-center justify-center gap-2 rounded-xl bg-surface-raised active:opacity-70">
            <Icon
              name="music.note"
              size={15}
              tintColor="#ffffff"
              fallback={<Text className="text-ink">♪</Text>}
            />
            <Text className="text-base text-ink">Legg til musikk</Text>
          </Pressable>
        )}
      </View>

      <MusicPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          onChange(picked);
          setPicking(false);
        }}
      />
    </>
  );
}

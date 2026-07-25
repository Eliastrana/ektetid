import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { AlbumPost } from '@/lib/album';

type Props = {
  post: AlbumPost;
  expanded: boolean;
  onToggle: () => void;
};

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

function formatNorwegianDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The frosted card floating over the photo. Collapsed it shows title, date and
 * place with the selfie as a thumbnail; tapping expands it to the description
 * with the selfie full-width — the same interaction as the original ImageTile.
 *
 * Text colour comes from the luminance stored on the row at upload time, so a
 * bright sky gets black text without any per-view pixel work.
 */
export function PostTile({ post, expanded, onToggle }: Props) {
  const dark = (post.luminance ?? 0) > 0.55;
  const textClass = dark ? 'text-canvas' : 'text-ink';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={expanded ? 'Skjul detaljer' : 'Vis detaljer'}
      onPress={onToggle}
      className="rounded-tile border border-glass-border bg-glass p-4">
      <View className={expanded ? 'flex-col' : 'flex-row items-start'}>
        <View className="flex-1">
          {post.title ? (
            <Text className={`text-3xl ${textClass}`} numberOfLines={expanded ? undefined : 1}>
              {post.title}
            </Text>
          ) : null}

          <Text className={`mt-1 text-sm ${textClass} opacity-80`}>
            {formatNorwegianDate(post.taken_at)}
          </Text>

          {post.location ? (
            <Text className={`mt-1 text-sm ${textClass} opacity-80`} numberOfLines={1}>
              📍 {post.location}
            </Text>
          ) : null}

          {expanded && post.description ? (
            <Text className={`mt-3 text-base ${textClass}`}>{post.description}</Text>
          ) : null}
        </View>

        {post.selfieUrl ? (
          <Image
            source={{ uri: post.selfieUrl }}
            contentFit="cover"
            transition={150}
            style={
              expanded
                ? { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, marginTop: 12 }
                : { width: 72, height: 96, borderRadius: 10, marginLeft: 12 }
            }
          />
        ) : null}
      </View>
    </Pressable>
  );
}

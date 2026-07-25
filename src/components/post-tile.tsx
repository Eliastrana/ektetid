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
 * Title, date, place and description, reading directly off the photo.
 *
 * The frosted card this replaces had to cover a slab of the image to stay
 * legible. Sitting on the carousel's bottom scrim instead keeps the photo
 * whole, which matters when the photo is the point.
 *
 * Text is always white here: the scrim guarantees a dark backdrop, so the
 * per-post luminance is not needed to choose a colour. It is still stored, and
 * still worth having if the layout ever puts text somewhere undimmed.
 */
export function PostTile({ post, expanded, onToggle }: Props) {
  const hasDetail = !!post.description || !!post.selfieUrl;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={expanded ? 'Skjul detaljer' : 'Vis detaljer'}
      onPress={onToggle}
      disabled={!hasDetail}>
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          {post.title ? (
            <Text
              className="text-3xl text-ink"
              numberOfLines={expanded ? undefined : 2}
              style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8 }}>
              {post.title}
            </Text>
          ) : null}

          <View className="mt-1 flex-row items-center gap-2">
            <Text className="text-sm text-ink opacity-75">
              {formatNorwegianDate(post.taken_at)}
            </Text>
            {post.location ? (
              <Text numberOfLines={1} className="flex-1 text-sm text-ink opacity-75">
                · {post.location}
              </Text>
            ) : null}
          </View>

          {expanded && post.description ? (
            <Text className="mt-3 text-base text-ink opacity-95">{post.description}</Text>
          ) : null}

          {hasDetail && !expanded ? (
            <Text className="mt-1 text-xs text-ink opacity-50">Trykk for mer</Text>
          ) : null}
        </View>

        {post.selfieUrl ? (
          <Image
            source={{ uri: post.selfieUrl }}
            contentFit="cover"
            transition={150}
            style={
              expanded
                ? { width: 132, height: 176, borderRadius: 12 }
                : { width: 60, height: 80, borderRadius: 10 }
            }
          />
        ) : null}
      </View>
    </Pressable>
  );
}

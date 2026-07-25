import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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

const SELFIE_COLLAPSED = { width: 60, height: 80 };
const SELFIE_EXPANDED = { width: 132, height: 176 };

/*
 * One animated value drives everything, and there are deliberately no layout
 * transitions.
 *
 * The selfie's size is animated per frame, which already resizes the row on
 * every frame — so the text reflows continuously as a consequence. Adding
 * LinearTransition on top made React Native's layout system animate those same
 * changes a second time, always a step behind, and that lag read as a bounce.
 * Two systems animating one reflow cannot agree.
 */
const DURATION = 260;
const EASING = Easing.out(Easing.cubic);

function formatNorwegianDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Title, date, place and description, reading directly off the photo.
 *
 * Expanding animates rather than jumping: the selfie eases between its two
 * sizes and the text reflows with it, since the row resizes as the selfie
 * does. The description fades in once the space has opened.
 *
 * Text is always white here — the scrim guarantees a dark backdrop, so the
 * per-post luminance is not needed to choose a colour.
 */
export function PostTile({ post, expanded, onToggle }: Props) {
  const hasDetail = !!post.description || !!post.selfieUrl;
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [expanded, progress]);

  const selfieStyle = useAnimatedStyle(() => ({
    width:
      SELFIE_COLLAPSED.width +
      (SELFIE_EXPANDED.width - SELFIE_COLLAPSED.width) * progress.value,
    height:
      SELFIE_COLLAPSED.height +
      (SELFIE_EXPANDED.height - SELFIE_COLLAPSED.height) * progress.value,
  }));

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
            <Animated.Text
              entering={FadeIn.duration(220).delay(60)}
              exiting={FadeOut.duration(120)}
              className="mt-3 text-base text-ink opacity-95">
              {post.description}
            </Animated.Text>
          ) : null}

          {hasDetail && !expanded ? (
            <Animated.Text
              entering={FadeIn.duration(180).delay(60)}
              exiting={FadeOut.duration(100)}
              className="mt-1 text-xs text-ink opacity-50">
              Trykk for mer
            </Animated.Text>
          ) : null}
        </View>

        {post.selfieUrl ? (
          <Animated.View style={[selfieStyle, { borderRadius: 12, overflow: 'hidden' }]}>
            <Image
              source={{ uri: post.selfieUrl }}
              contentFit="cover"
              transition={150}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        ) : null}
      </View>
    </Pressable>
  );
}

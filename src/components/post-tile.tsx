import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { AlbumPost } from '@/lib/album';

type Props = {
  post: AlbumPost;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Attribute the photo. Only meaningful in a shared album — in a personal one
   * every post is the owner's, so the name would be noise on every frame.
   */
  showAuthor?: boolean;
};

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

const SELFIE_COLLAPSED = { width: 60, height: 80 };
const SELFIE_EXPANDED = { width: 132, height: 176 };

/**
 * Both dimensions shrink by the same factor, so the selfie can be scaled
 * rather than resized. 60/132 and 80/176 are both 0.4545.
 */
const SELFIE_MIN_SCALE = SELFIE_COLLAPSED.width / SELFIE_EXPANDED.width;

/*
 * One animated value drives everything, and nothing here is a layout
 * animation.
 *
 * Two things used to make this stutter. The selfie's *width* was animated, and
 * since the text sits in a flex-1 column beside it, every frame changed the
 * text's available width and re-wrapped the title and description — text
 * re-layout sixty times a second, with words jumping between lines. And the
 * description and the hint were mounted and unmounted behind FadeIn/FadeOut,
 * which are layout animations, so React Native was animating the same reflow
 * the timing was already animating.
 *
 * Now the selfie's column is a fixed width and only its height animates, so
 * the text column never changes width and never re-wraps. The photo itself is
 * scaled, which costs nothing — it is a transform, not a layout. The
 * description and hint stay mounted and animate their own measured height from
 * the same progress value, so every moving part is driven by one clock.
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
 * Text is always white here — the scrim guarantees a dark backdrop, so the
 * per-post luminance is not needed to choose a colour.
 */
export function PostTile({ post, expanded, onToggle, showAuthor = false }: Props) {
  const hasDetail = !!post.description || !!post.selfieUrl;
  const progress = useSharedValue(expanded ? 1 : 0);

  /*
   * Natural heights, measured once from the laid-out text.
   *
   * A height cannot be animated from nothing to "however tall this turns out
   * to be", so each block reports its own height and then animates against it.
   * The blocks stay mounted and clipped at zero, which is what makes the
   * measurement available before it is needed.
   */
  const [detailHeight, setDetailHeight] = useState(0);
  const [hintHeight, setHintHeight] = useState(0);

  /*
   * Keep the last real measurement, and never accept zero.
   *
   * A block reports its height while its parent is already clipped to zero, so
   * a zero reading is ambiguous — it may mean the text is genuinely empty, or
   * that the clip was applied first. Taking it at face value would let the
   * height collapse permanently and the description would stop opening at all;
   * worse, it can oscillate, since writing the height back changes the layout
   * that produced it.
   */
  const measure = (set: (value: number) => void) => (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) set(height);
  };

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [expanded, progress]);

  const selfieBoxStyle = useAnimatedStyle(() => ({
    height:
      SELFIE_COLLAPSED.height +
      (SELFIE_EXPANDED.height - SELFIE_COLLAPSED.height) * progress.value,
  }));

  const selfieImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: SELFIE_MIN_SCALE + (1 - SELFIE_MIN_SCALE) * progress.value }],
  }));

  const detailStyle = useAnimatedStyle(() => ({
    height: detailHeight * progress.value,
    opacity: progress.value,
  }));

  const hintStyle = useAnimatedStyle(() => ({
    height: hintHeight * (1 - progress.value),
    opacity: 1 - progress.value,
  }));

  /*
   * Until a height is known the block is left unconstrained and invisible, so
   * it lays out at its natural size and can be measured. Constraining it from
   * the first frame would be circular — the height is needed to compute the
   * height.
   */
  const UNMEASURED = { opacity: 0 } as const;

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

          {showAuthor && post.author ? (
            <View className="mt-1 flex-row items-center gap-1.5">
              {post.author.avatar_url ? (
                <Image
                  source={{ uri: post.author.avatar_url }}
                  style={{ width: 18, height: 18, borderRadius: 9 }}
                />
              ) : null}
              <Text className="text-sm text-ink opacity-90">
                {post.author.display_name ?? post.author.username}
              </Text>
            </View>
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

          {post.description ? (
            <Animated.View
              style={[detailHeight > 0 ? detailStyle : UNMEASURED, { overflow: 'hidden' }]}>
              <View className="pt-3" onLayout={measure(setDetailHeight)}>
                <Text className="text-base text-ink opacity-95">{post.description}</Text>
              </View>
            </Animated.View>
          ) : null}

          {hasDetail ? (
            <Animated.View
              style={[hintHeight > 0 ? hintStyle : UNMEASURED, { overflow: 'hidden' }]}>
              <View className="pt-1" onLayout={measure(setHintHeight)}>
                <Text className="text-xs text-ink opacity-50">Trykk for mer</Text>
              </View>
            </Animated.View>
          ) : null}
        </View>

        {post.selfieUrl ? (
          /*
           * Fixed width, so the text column beside it keeps the same width at
           * every point in the animation. Only the height moves, and that
           * changes the row's height without touching how the text wraps.
           */
          <Animated.View
            style={[
              selfieBoxStyle,
              { width: SELFIE_EXPANDED.width, overflow: 'hidden' },
            ]}>
            <Animated.View
              style={[
                selfieImageStyle,
                {
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: SELFIE_EXPANDED.width,
                  height: SELFIE_EXPANDED.height,
                  borderRadius: 12,
                  overflow: 'hidden',
                  // Anchored to the corner it is pinned to, so shrinking pulls
                  // it into the bottom right rather than towards its centre.
                  transformOrigin: ['100%', '100%', 0],
                },
              ]}>
              <Image
                source={{ uri: post.selfieUrl }}
                contentFit="cover"
                transition={150}
                style={{ width: '100%', height: '100%' }}
              />
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </Pressable>
  );
}

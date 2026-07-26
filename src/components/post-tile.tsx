import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  type SharedValue,
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
            <Collapsible progress={progress}>
              <View className="pt-3">
                <Text className="text-base text-ink opacity-95">{post.description}</Text>
              </View>
            </Collapsible>
          ) : null}

          {hasDetail ? (
            <Collapsible progress={progress} invert>
              <View className="pt-1">
                <Text className="text-xs text-ink opacity-50">Trykk for mer</Text>
              </View>
            </Collapsible>
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

/**
 * A block that opens and closes with the tile, from zero to its own height.
 *
 * The content is rendered twice: once invisibly and unconstrained purely to be
 * measured, and once inside the animated clip. That looks wasteful, and the
 * obvious version — measure the visible copy — is what broke the description.
 * A child reports a smaller height once its parent is clipped, that value gets
 * written back as the new target, and the two ratchet each other down: the
 * measurements came in at 31, then 17, then 10 points, until the text had no
 * room left to appear in. Guarding against zero does not help, because none of
 * those readings is zero. The measuring copy is never given a height, so it
 * always reports the real one.
 */
function Collapsible({
  progress,
  invert = false,
  children,
}: {
  progress: SharedValue<number>;
  /** Open as the tile closes, for the "Trykk for mer" hint. */
  invert?: boolean;
  children: React.ReactNode;
}) {
  const [height, setHeight] = useState(0);

  const style = useAnimatedStyle(() => {
    const t = invert ? 1 - progress.value : progress.value;
    return { height: height * t, opacity: t };
  });

  return (
    <View>
      <View
        // Out of flow, so it contributes nothing to the layout it is measuring.
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
        pointerEvents="none"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          // Half a point of tolerance: text metrics land on fractions, and
          // rewriting state for 31.6667 vs 31.6666 would loop forever.
          if (next > 0 && Math.abs(next - height) > 0.5) setHeight(next);
        }}>
        {children}
      </View>

      <Animated.View style={[style, { overflow: 'hidden' }]}>{children}</Animated.View>
    </View>
  );
}

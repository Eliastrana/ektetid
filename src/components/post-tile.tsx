import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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

/**
 * The selfie springs — it reads as a physical thing changing size.
 *
 * Text does not. A spring overshoots, and overshoot on a block of prose looks
 * like the layout is unstable rather than lively, so the reflow is a plain
 * ease-out instead.
 */
/*
 * Overdamped on purpose. A spring overshoots whenever damping falls below
 * 2 * sqrt(stiffness * mass) — here that threshold is 23.9, so 30 settles
 * without ever crossing its target. It keeps the weighted feel of a spring
 * while removing the bounce entirely.
 */
const SPRING = { damping: 30, stiffness: 190, mass: 0.75 } as const;
const REFLOW = LinearTransition.duration(240).easing(Easing.out(Easing.quad));

function formatNorwegianDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Title, date, place and description, reading directly off the photo.
 *
 * Expanding animates rather than jumping: the selfie springs between its two
 * sizes, the description fades in, and the surrounding text reflows through a
 * layout transition so nothing snaps into place around it.
 *
 * Text is always white here — the scrim guarantees a dark backdrop, so the
 * per-post luminance is not needed to choose a colour.
 */
export function PostTile({ post, expanded, onToggle }: Props) {
  const hasDetail = !!post.description || !!post.selfieUrl;
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(expanded ? 1 : 0, SPRING);
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
      <Animated.View layout={REFLOW}>
        <View className="flex-row items-end gap-3">
          <Animated.View
            className="flex-1"
            layout={REFLOW}>
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
          </Animated.View>

          {post.selfieUrl ? (
            <Animated.View
              style={[selfieStyle, { borderRadius: 12, overflow: 'hidden' }]}>
              <Image
                source={{ uri: post.selfieUrl }}
                contentFit="cover"
                transition={150}
                style={{ width: '100%', height: '100%' }}
              />
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

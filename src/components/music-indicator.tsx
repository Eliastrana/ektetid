import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';

const ARTWORK = 30;

/**
 * The inset around the cover, and why it is not the obvious 6.
 *
 * A pill's corner radius is half its height, so the shorter the capsule the
 * tighter the curve at its ends — and a square sitting in there has to clear
 * that curve at its own corners, not just at its edges. At 6pt of padding the
 * capsule is 42 tall, its radius is 21, and at the cover's corner height the
 * pill's own edge falls at x = 6.30: the corners were sitting a fraction
 * outside the shape containing them.
 *
 * Taller padding makes the curve gentler as well as adding room, so 8 brings
 * that edge in to 5.56 and 10 to the left leaves about four points of daylight
 * at the tightest point. The cover is rounded further for the same reason —
 * corners pulled in read as belonging to a pill rather than fighting it.
 */
const PAD_VERTICAL = 8;
const PAD_LEFT = 10;
const PAD_RIGHT = 14;
const ARTWORK_RADIUS = 9;

/** One beat of the equaliser, in milliseconds. Roughly 80bpm, so it reads as music. */
const BEAT = 380;

const BAR_WIDTH = 3;
const BAR_MIN = 4;
const BAR_MAX = 16;
const BARS = 3;

/** How far the cover swells on the beat. Small: it sits over someone's photo. */
const PULSE = 1.06;

const EASING = Easing.inOut(Easing.quad);

/**
 * What is playing, and a press to silence it.
 *
 * Composed in React Native rather than as a native button, which the rest of
 * the chrome is, for one reason: the cover art is a remote URL, and a SwiftUI
 * label can only take a system symbol or a local asset. `GlassView` gives the
 * same Liquid Glass material with React Native children, so the capsule still
 * matches its neighbours — and falls back to a flat fill where the material
 * does not exist, exactly as the metadata pills do.
 *
 * Nothing moves while it is muted. The animation is the answer to "is this
 * making sound right now", so a muted post that still pulsed would be lying.
 */
export function MusicIndicator({
  artworkUrl,
  title,
  artist,
  muted,
  onPress,
}: {
  artworkUrl: string | null;
  title: string;
  artist: string;
  muted: boolean;
  onPress: () => void;
}) {
  const playing = !muted;

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 180, easing: EASING });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(PULSE, { duration: BEAT, easing: EASING }),
        withTiming(1, { duration: BEAT, easing: EASING })
      ),
      -1,
      false
    );
    return () => cancelAnimation(pulse);
  }, [playing, pulse]);

  const coverStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${muted ? 'Slå på lyd' : 'Slå av lyd'}: ${title} av ${artist}`}
      onPress={onPress}
      className="active:opacity-70">
      <GlassView
        glassEffectStyle="regular"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingLeft: PAD_LEFT,
          paddingRight: PAD_RIGHT,
          paddingVertical: PAD_VERTICAL,
          borderRadius: 999,
          // Only when the material is absent: over glass this would be a grey
          // film on top of the blur.
          backgroundColor: isLiquidGlassAvailable() ? undefined : 'rgba(255,255,255,0.13)',
        }}>
        <Animated.View style={coverStyle}>
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              style={{ width: ARTWORK, height: ARTWORK, borderRadius: ARTWORK_RADIUS }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              style={{ width: ARTWORK, height: ARTWORK, borderRadius: ARTWORK_RADIUS }}
              className="items-center justify-center bg-surface-raised">
              <Icon
                name="music.note"
                size={14}
                tintColor="#ffffff"
                fallback={<Text className="text-ink">♪</Text>}
              />
            </View>
          )}
        </Animated.View>

        <Text
          numberOfLines={1}
          style={{ maxWidth: 118 }}
          className="text-xs font-semibold text-ink">
          {title}
        </Text>

        {playing ? (
          <Equaliser />
        ) : (
          <Icon
            name="speaker.slash.fill"
            size={13}
            tintColor="#ffffff"
            fallback={<Text className="text-xs text-ink">🔇</Text>}
          />
        )}
      </GlassView>
    </Pressable>
  );
}

/**
 * Three bars keeping time.
 *
 * Centred rather than sitting on a baseline, so they read as a pulse rather
 * than as a chart. Staggered by a third of a beat each, because three bars
 * moving in unison looks like one wide bar.
 */
function Equaliser() {
  return (
    <View
      style={{ height: BAR_MAX, flexDirection: 'row', alignItems: 'center', gap: 2 }}
      accessible={false}>
      {Array.from({ length: BARS }, (_, index) => (
        <Bar key={index} index={index} />
      ))}
    </View>
  );
}

function Bar({ index }: { index: number }) {
  const height = useSharedValue(BAR_MIN);

  useEffect(() => {
    height.value = withDelay(
      (index * BEAT) / BARS,
      withRepeat(
        withSequence(
          withTiming(BAR_MAX, { duration: BEAT, easing: EASING }),
          withTiming(BAR_MIN, { duration: BEAT, easing: EASING })
        ),
        -1,
        false
      )
    );
    return () => cancelAnimation(height);
  }, [height, index]);

  const style = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[
        style,
        { width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2, backgroundColor: '#ffffff' },
      ]}
    />
  );
}

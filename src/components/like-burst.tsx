import { Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';

/** The heart that answers the tap. */
const MAIN = 108;

/**
 * How far the heart is allowed to lean, in degrees.
 *
 * A tilt, not a spin. The point is that two taps do not produce the identical
 * picture; past twenty degrees it stops reading as a heart landing at a slight
 * angle and starts reading as a heart that has been knocked over.
 */
const MAX_TILT = 20;

/** The ring that goes with it. */
const SPARKS = 8;
const SPARK = 22;
const TRAVEL = 104;

/**
 * The heart a double tap leaves behind.
 *
 * Three things make this feel like an answer rather than a notice. It lands
 * where the finger did, so the gesture is acknowledged at the point of contact
 * instead of in the middle of a photograph nobody tapped. It overshoots and
 * settles, which is how something arriving with force behaves. And a ring of
 * small hearts leaves with it, offset by an angle that changes every time, so
 * two taps in a row are never the same picture twice.
 *
 * Every value is derived from one progress clock, so nothing can drift out of
 * step with anything else. Takes no touches at any point — it sits above the
 * photo and below the chrome, and must not swallow the next tap while fading.
 */
export function LikeBurst({
  progress,
  x,
  y,
  spin,
}: {
  /** 0 to 1 across the whole burst. Reset to 0 to arm the next one. */
  progress: SharedValue<number>;
  /** Where the finger was, in the photo's own coordinates. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** Radians of rotation for the ring, rolled fresh for each tap. */
  spin: SharedValue<number>;
}) {
  /**
   * A zero-sized point at the tap, which everything else hangs off.
   *
   * Translating one anchor is cheaper than positioning nine views, and it means
   * the ring and the heart cannot end up centred on slightly different places.
   */
  const anchor = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const heart = useAnimatedStyle(() => {
    const t = progress.value;
    // Idle at both ends: 0 is armed and waiting, 1 is spent. Neither should
    // leave a heart on the screen.
    if (t === 0 || t === 1) return { opacity: 0, transform: [{ scale: 0 }] };

    return {
      opacity: interpolate(t, [0, 0.07, 0.5, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          // Past its size and back: the overshoot is the whole difference
          // between landing and appearing.
          scale: interpolate(
            t,
            [0, 0.16, 0.3, 1],
            [0.35, 1.22, 1, 1.08],
            Extrapolation.CLAMP
          ),
        },
        {
          /*
           * Mapped from the ring's angle into a small lean.
           *
           * `spin` is radians, chosen anywhere in a full turn because that is
           * what the ring needs. Using it as the heart's rotation as well —
           * which is what `spin * 6` did — asked for up to two thousand
           * degrees, so the heart arrived upside down as often as not.
           */
          rotate: `${((spin.value / (Math.PI * 2)) * 2 - 1) * MAX_TILT}deg`,
        },
      ],
    };
  });

  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Animated.View style={[anchor, { position: 'absolute', left: 0, top: 0 }]}>
        {Array.from({ length: SPARKS }, (_, index) => (
          <Spark key={index} index={index} progress={progress} spin={spin} />
        ))}

        <Animated.View
          style={[heart, { position: 'absolute', left: -MAIN / 2, top: -MAIN / 2 }]}>
          <Icon
            name="heart.fill"
            size={MAIN}
            tintColor="#ffffff"
            fallback={<Text style={{ fontSize: MAIN }}>❤️</Text>}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * One of the small hearts thrown outwards.
 *
 * Leaves after the main heart has landed rather than with it, so the sequence
 * reads as an impact and its consequence instead of one simultaneous flash.
 */
function Spark({
  index,
  progress,
  spin,
}: {
  index: number;
  progress: SharedValue<number>;
  spin: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    if (t === 0 || t === 1) return { opacity: 0, transform: [{ scale: 0 }] };

    // Eased out, so they fly fast and coast — thrown, not driven.
    const launch = interpolate(t, [0.08, 0.6], [0, 1], Extrapolation.CLAMP);
    const distance = TRAVEL * (1 - (1 - launch) * (1 - launch));

    const angle = (index / SPARKS) * Math.PI * 2 + spin.value;

    return {
      opacity: interpolate(t, [0.08, 0.22, 0.55], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: Math.cos(angle) * distance },
        { translateY: Math.sin(angle) * distance },
        {
          scale: interpolate(
            t,
            [0.08, 0.28, 0.6],
            [0.3, 1, 0.35],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[style, { position: 'absolute', left: -SPARK / 2, top: -SPARK / 2 }]}>
      <Icon
        name="heart.fill"
        size={SPARK}
        tintColor="#ffffff"
        fallback={<Text style={{ fontSize: SPARK }}>❤️</Text>}
      />
    </Animated.View>
  );
}

import { useCallback } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * How far the control swells, and for how long.
 *
 * Enough to register as a response to the tap, not so much that a 44pt control
 * bounces like a notification. Nothing clips these buttons, so the ceiling is
 * how it reads rather than what fits.
 */
const SCALE = 1.2;
const IN = 110;
const OUT = 190;
const EASING = Easing.out(Easing.cubic);

/**
 * A swell on press, for a control that acts in place.
 *
 * Most chrome buttons open something, and the thing opening is the response.
 * The heart has no such confirmation — you press it and the glyph fills — so it
 * needs one of its own.
 *
 * Shared rather than written twice: the heart used to live inside the action
 * cluster and now sits outside it, and both wanted the identical motion. Two
 * copies would have drifted the moment either was adjusted.
 */
// Return type inferred on purpose: naming it costs the generic that
// useAnimatedStyle infers from the style object, and an Animated.View then
// rejects the result.
export function usePressPop() {
  const value = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + value.value * (SCALE - 1) }],
  }));

  const pop = useCallback(() => {
    value.value = withSequence(
      withTiming(1, { duration: IN, easing: EASING }),
      withTiming(0, { duration: OUT, easing: EASING })
    );
  }, [value]);

  return { style, pop };
}

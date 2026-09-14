import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Matches the post tile: timed easing, no spring, nothing overshoots. */
const DURATION = 220;
const EASING = Easing.out(Easing.cubic);

type Rect = { x: number; width: number };

/**
 * A segmented control whose selection slides between options.
 *
 * The indicator is one view that moves, rather than each segment toggling its
 * own background — that is what makes it read as a single thing travelling
 * instead of two things blinking.
 *
 * Each segment reports its own position and width. Deriving them from the
 * container's width instead creates a feedback loop: the container is sized by
 * its children, so setting the children from the container shrinks both on
 * every layout pass until the control collapses. Measuring per segment also
 * means labels of different lengths still line up with the indicator.
 */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const [rects, setRects] = useState<Record<number, Rect>>({});

  const index = Math.max(
    options.findIndex((option) => option.value === value),
    0
  );
  const target = rects[index];

  const offset = useDerivedValue(
    () => withTiming(target?.x ?? 0, { duration: DURATION, easing: EASING }),
    [target?.x]
  );
  const indicatorWidth = useDerivedValue(
    () => withTiming(target?.width ?? 0, { duration: DURATION, easing: EASING }),
    [target?.width]
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View className="flex-row rounded-full bg-overlay p-1">
      {target ? (
        <Animated.View
          pointerEvents="none"
          style={indicatorStyle}
          className="absolute bottom-1 left-0 top-1 rounded-full bg-ink"
        />
      ) : null}

      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              setRects((previous) =>
                previous[i]?.x === x && previous[i]?.width === width
                  ? previous
                  : { ...previous, [i]: { x, width } }
              );
            }}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            className="h-9 items-center justify-center rounded-full px-5">
            <Text className={`text-sm ${active ? 'text-canvas' : 'text-ink opacity-80'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

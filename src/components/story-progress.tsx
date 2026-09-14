import { Pressable, Text, View } from 'react-native';

type Props = {
  count: number;
  index: number;
  /** Opens the grid of every post. Given a generous hit area, since the bar
   *  itself is only a few points tall. */
  onPress?: () => void;
};

/**
 * Instagram-style segmented progress. The web version drew one continuous bar
 * with tick marks over it; discrete segments read better at phone width, and
 * make the "how many left" question answerable at a glance.
 */
export function StoryProgress({ count, index, onPress }: Props) {
  // Past a certain length the segments become invisible slivers, so a long
  // album gets a plain count instead. It still has to be reachable: that is
  // exactly when jumping to a specific photo matters most, so the bar is
  // replaced rather than dropped.
  const body =
    count > 30 ? (
      <View className="w-full flex-row justify-center">
        <View className="rounded-full bg-overlay px-3 py-1">
          <Text className="text-xs text-ink opacity-85">
            {index + 1} / {count}
          </Text>
        </View>
      </View>
    ) : (
      <View className="w-full flex-row gap-1" accessibilityRole="progressbar">
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-ink' : 'bg-glass'}`}
          />
        ))}
      </View>
    );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Vis alle bildene i albumet"
      onPress={onPress}
      // Vertical padding only: the bar spans the full width already, and the
      // row above it is close enough that a taller target would swallow taps
      // meant for the close button.
      className="w-full py-2 active:opacity-70">
      {body}
    </Pressable>
  );
}

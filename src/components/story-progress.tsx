import { View } from 'react-native';

type Props = {
  count: number;
  index: number;
};

/**
 * Instagram-style segmented progress. The web version drew one continuous bar
 * with tick marks over it; discrete segments read better at phone width, and
 * make the "how many left" question answerable at a glance.
 */
export function StoryProgress({ count, index }: Props) {
  // Past a certain length individual segments become invisible slivers.
  if (count > 30) return null;

  return (
    <View className="w-full flex-row gap-1" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-ink' : 'bg-glass'}`}
        />
      ))}
    </View>
  );
}

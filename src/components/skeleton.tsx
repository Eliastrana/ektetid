import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Screen } from '@/components/screen';

export function SkeletonBox({ style }: { style?: ViewStyle }) {
  const opacity = useSharedValue(0.42);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.8, { duration: 650 }), withTiming(0.42, { duration: 650 })),
      -1,
      true
    );
  }, [opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { backgroundColor: '#24272c', borderCurve: 'continuous' },
        style,
        animatedStyle,
      ]}
    />
  );
}

export function AlbumGridSkeleton() {
  return (
    <View className="flex-row flex-wrap gap-3 py-4">
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={{ width: '48%' }}>
          <SkeletonBox style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14 }} />
          <SkeletonBox style={{ width: '72%', height: 14, borderRadius: 7, marginTop: 10 }} />
          <SkeletonBox style={{ width: '46%', height: 10, borderRadius: 5, marginTop: 7 }} />
        </View>
      ))}
    </View>
  );
}

/** First paint while Keychain/Supabase restores the session. */
export function AppBootSkeleton() {
  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top', 'bottom']}>
        <View className="px-5 pt-3">
          <SkeletonBox style={{ width: 150, height: 42, borderRadius: 12 }} />
          <SkeletonBox style={{ width: 210, height: 16, borderRadius: 8, marginTop: 10 }} />
        </View>
        <View className="px-5">
          <AlbumGridSkeleton />
        </View>
        <View className="mt-auto flex-row justify-around border-t border-glass-border px-5 py-3">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBox key={item} style={{ width: 28, height: 28, borderRadius: 14 }} />
          ))}
        </View>
      </Screen>
    </View>
  );
}

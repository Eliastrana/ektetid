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

/**
 * The album editor: two fields, then a row per photo.
 *
 * Its own shape rather than the feed's. The editor was showing
 * AlbumGridSkeleton — two columns of 3:4 cards — and then resolving into a
 * single column of short rows with a thumbnail on the left, so the placeholder
 * described a different screen from the one arriving. A skeleton that guesses
 * wrong is worse than none: it moves everything once the real layout lands.
 */
export function AlbumEditSkeleton() {
  return (
    <View>
      {/* "Tittel", and the field under it. */}
      <SkeletonBox
        style={{ width: 46, height: 12, borderRadius: 6, marginTop: 16, marginBottom: 8 }}
      />
      <SkeletonBox style={{ width: '100%', height: 56, borderRadius: 14 }} />

      {/* "Beskrivelse", which is taller because it takes more than one line. */}
      <SkeletonBox
        style={{ width: 86, height: 12, borderRadius: 6, marginTop: 16, marginBottom: 8 }}
      />
      <SkeletonBox style={{ width: '100%', height: 80, borderRadius: 14 }} />

      <View style={{ marginTop: 28 }}>
        {[0, 1, 2, 3].map((row) => (
          <View
            key={row}
            className="mb-2 flex-row items-center gap-3 rounded-tile bg-glass p-2">
            {/* The same 52x68 the real thumbnail uses. */}
            <SkeletonBox style={{ width: 52, height: 68, borderRadius: 8 }} />
            <View className="flex-1 gap-2">
              <SkeletonBox style={{ width: '64%', height: 14, borderRadius: 7 }} />
              <SkeletonBox style={{ width: '38%', height: 10, borderRadius: 5 }} />
            </View>
            {/* Share, delete and the reorder grip: the three every row has. */}
            {[0, 1, 2].map((button) => (
              <SkeletonBox
                key={button}
                style={{ width: 36, height: 36, borderRadius: 18 }}
              />
            ))}
          </View>
        ))}
      </View>
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

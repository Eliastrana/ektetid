import { Text, View } from 'react-native';

import { Screen } from '@/components/screen';

/**
 * The camera, on web: not available.
 *
 * expo-camera does have a web implementation, but almost nothing this screen
 * does survives the trip. The dual capture flips between the back and front
 * cameras mid-shot; the lens picker matches iOS device names to reach the
 * ultra-wide; hold-to-record leans on a Reanimated gesture and on the volume
 * observer. A browser tab offers a single stream and a shutter, which is a
 * different product wearing the same name.
 *
 * The web build is for looking at what is already there. Taking photos is what
 * the app is for.
 */
export default function CameraScreenWeb() {
  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-xl text-ink">Kameraet finnes bare i appen</Text>
        <Text className="mt-3 text-center text-base text-muted">
          Her kan du se øyeblikkene dine. For å ta nye trenger du EkteTid på iPhone.
        </Text>
      </Screen>
    </View>
  );
}

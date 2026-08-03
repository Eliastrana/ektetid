import { Text, View } from 'react-native';

import { Screen } from '@/components/screen';

/**
 * The map, on web: not available.
 *
 * expo-maps is Android and iOS only — it wraps Google Maps and MapKit, neither
 * of which has a JavaScript equivalent behind the same API. Importing the real
 * screen throws `Cannot find native module 'ExpoMaps'` at module scope, which
 * happens whether or not the tab is ever opened, so this file has to exist even
 * though the web tab bar no longer offers it. Anyone arriving by URL lands
 * here.
 *
 * Every post already carries `latitude` and `longitude`, so a web map is a
 * matter of drawing them with MapLibre or Leaflet whenever it is worth doing —
 * the data is not the missing part.
 */
export default function MapScreenWeb() {
  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-xl text-ink">Kartet finnes bare i appen</Text>
        <Text className="mt-3 text-center text-base text-muted">
          Last ned EkteTid på iPhone for å se øyeblikkene dine på kartet.
        </Text>
      </Screen>
    </View>
  );
}

import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/*
 * The tab icons, drawn rather than named.
 *
 * The native bar asks for SF Symbols by name and lets iOS render them; there is
 * no such catalogue in a browser. These are react-native-svg, which is already
 * a dependency and works on web unchanged, and they trace the same two symbols
 * the app uses — square.grid.2x2.fill and person.crop.circle.fill — so the two
 * platforms do not look like different products.
 */

function GridIcon({ color, size }: { color: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x="3" y="3" width="8" height="8" rx="2" />
      <Rect x="13" y="3" width="8" height="8" rx="2" />
      <Rect x="3" y="13" width="8" height="8" rx="2" />
      <Rect x="13" y="13" width="8" height="8" rx="2" />
    </Svg>
  );
}

function PersonIcon({ color, size }: { color: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M12 13.5c-4.4 0-8 3.1-8 7 0 .3.2.5.5.5h15c.3 0 .5-.2.5-.5 0-3.9-3.6-7-8-7z" />
    </Svg>
  );
}

/**
 * The web tab bar.
 *
 * NativeTabs renders UITabBar on iOS, which has no browser equivalent, so the
 * web build uses the JS tab bar instead. Kamera and Kart are dropped rather
 * than shown broken: neither works here, and a tab that apologises when tapped
 * is worse than one that was never offered. Both routes still exist for anyone
 * arriving by URL — see kamera.web.tsx and kart.web.tsx.
 *
 * What is left is what the web build is for: looking at albums, and your own
 * profile.
 */
export default function TabsLayoutWeb() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#000000', borderTopColor: '#1e1f22' },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#6b6f76',
        sceneStyle: { backgroundColor: '#000000' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Øyeblikk',
          tabBarIcon: ({ color, size }) => <GridIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <PersonIcon color={color} size={size} />,
        }}
      />

      {/* Present so the routes resolve, absent from the bar. */}
      <Tabs.Screen name="kart" options={{ href: null }} />
      <Tabs.Screen name="kamera" options={{ href: null }} />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';

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
      <Tabs.Screen name="index" options={{ title: 'Øyeblikk' }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />

      {/* Present so the routes resolve, absent from the bar. */}
      <Tabs.Screen name="kart" options={{ href: null }} />
      <Tabs.Screen name="kamera" options={{ href: null }} />
    </Tabs>
  );
}

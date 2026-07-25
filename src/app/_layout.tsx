import '@/global.css';

import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/components/auth-provider';
import { useNotificationRouting } from '@/lib/use-notification-routing';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1 bg-canvas">
      <SafeAreaProvider>
        <ThemeProvider value={DarkTheme}>
          <AuthProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, initializing, needsUsername } = useAuth();

  // Tapping a notification should land on the thing it is about, not the feed.
  useNotificationRouting();

  // Hold the splash until we know whether there is a stored session, so the
  // sign-in screen never flashes for an already-signed-in user.
  if (initializing) return null;
  void SplashScreen.hideAsync();

  const signedIn = !!session;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
      }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && needsUsername}>
        <Stack.Screen name="velg-brukernavn" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !needsUsername}>
        <Stack.Screen name="(tabs)" />
        {/*
          No stack animation: the album animates itself out of the card it was
          opened from, and a simultaneous fade would fight it.

          Transparent so the grid underneath stays on screen. Opaque, there was
          nothing behind the album as it shrank, so the close played against a
          flat background and never read as returning to the card.
        */}
        <Stack.Screen
          name="album/[id]"
          options={{
            animation: 'none',
            presentation: 'transparentModal',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="venner" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profil/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="rediger-album/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="innstillinger" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="nytt-innlegg"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

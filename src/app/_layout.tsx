import '@/global.css';

import { GravitasOne_400Regular } from '@expo-google-fonts/gravitas-one/400Regular';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/components/auth-provider';
import { AppBootSkeleton } from '@/components/skeleton';
import { useNotificationRouting } from '@/lib/use-notification-routing';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // The font is bundled with the app and loads in the background. Keeping the
  // useful first paint means a decorative album title never delays launch.
  useFonts({ GravitasOne_400Regular });

  useEffect(() => {
    // Session restoration continues behind a useful first paint rather than
    // holding the launch screen until both auth and profile requests finish.
    void SplashScreen.hideAsync();
  }, []);

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
  const { session, initializing, needsUsername, onboardingComplete } = useAuth();

  // Tapping a notification should land on the thing it is about, not the feed.
  // Wait until the protected routes exist; routing during session restoration
  // made a notification tap appear to load forever without opening anything.
  useNotificationRouting(
    !!session && !initializing && !needsUsername && onboardingComplete
  );

  // Hold the splash until we know whether there is a stored session, so the
  // sign-in screen never flashes for an already-signed-in user.
  if (initializing) return <AppBootSkeleton />;

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

      <Stack.Protected guard={signedIn && !needsUsername && !onboardingComplete}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !needsUsername && onboardingComplete}>
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
        <Stack.Screen
          name="venner"
          options={{
            headerShown: true,
            title: 'Venner',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="profil/[id]"
          options={{
            animation: 'slide_from_right',
            headerShown: true,
            title: 'Profil',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="rediger-album/[id]"
          options={{
            animation: 'slide_from_right',
            headerShown: true,
            title: 'Rediger album',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="rediger-innlegg/[id]"
          options={{
            headerShown: true,
            title: 'Rediger innlegg',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="innstillinger"
          options={{
            headerShown: true,
            title: 'Innstillinger',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="minneblikk"
          options={{
            headerShown: true,
            title: 'Minneblikk',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="passord"
          options={{
            headerShown: true,
            title: 'Passord',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="nytt-innlegg"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

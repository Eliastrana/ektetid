import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text } from 'react-native';

import { ensureNotificationPermission, registerForPush } from '@/lib/notifications';

type State = 'idle' | 'busy' | 'on' | 'denied';

/**
 * The onboarding button that turns notifications on.
 *
 * Registering here, and not only after someone's first post, is the point:
 * the push token is what the server sends to, and a friend who had never
 * posted had none — so they heard nothing, whatever their settings said.
 */
export function NotificationOptIn({ userId }: { userId: string }) {
  const [state, setState] = useState<State>('idle');

  // Someone reinstalling, or signing in on a phone that already said yes,
  // should see it as done rather than be asked for something they gave.
  useEffect(() => {
    let active = true;
    void Notifications.getPermissionsAsync()
      .then((permission) => {
        if (!active) return;
        if (permission.granted) {
          setState('on');
          void registerForPush(userId).catch(() => {});
        } else if (!permission.canAskAgain) {
          setState('denied');
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const enable = async () => {
    void Haptics.selectionAsync();
    setState('busy');
    try {
      if (!(await ensureNotificationPermission())) {
        setState('denied');
        return;
      }
      setState('on');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The token upload needs the network; the answer the user gave does not
      // depend on it, so the button does not wait.
      void registerForPush(userId).catch(() => {});
    } catch {
      setState('idle');
    }
  };

  if (state === 'on') {
    return <Text className="mt-8 text-base text-ink">Varsler er på ✓</Text>;
  }

  if (state === 'denied') {
    // iOS never shows the prompt twice. Settings is the only way back.
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => void Linking.openSettings()}
        className="mt-8 active:opacity-70">
        <Text className="text-center text-sm text-muted">
          Varsler er slått av. Trykk for å slå dem på i Innstillinger.
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: state === 'busy' }}
      disabled={state === 'busy'}
      onPress={() => void enable()}
      className="mt-8 h-12 min-w-48 items-center justify-center rounded-full bg-glass-strong px-6 active:opacity-80">
      {state === 'busy' ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text className="text-base text-ink">Slå på varsler</Text>
      )}
    </Pressable>
  );
}

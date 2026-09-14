import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import {
  isSubscribed,
  isWebPushSupported,
  permissionState,
  registerForWebPush,
} from '@/lib/web-push';

type State = 'idle' | 'busy' | 'on' | 'denied' | 'unsupported';

/**
 * The onboarding button that turns notifications on, in a browser.
 *
 * Browser push is a subscription rather than an Expo token — see
 * notification-settings.web.tsx — so this shares the page, not the plumbing.
 */
export function NotificationOptIn({ userId }: { userId: string }) {
  const [state, setState] = useState<State>(() => {
    if (!isWebPushSupported()) return 'unsupported';
    return permissionState() === 'denied' ? 'denied' : 'idle';
  });

  useEffect(() => {
    if (state !== 'idle') return;
    let active = true;
    void isSubscribed()
      .then((subscribed) => {
        if (active && subscribed) setState('on');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Only the first look; later states come from the button itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = async () => {
    setState('busy');
    try {
      // The prompt must follow a click — browsers refuse one on page load.
      const ok = await registerForWebPush(userId);
      setState(ok ? 'on' : permissionState() === 'denied' ? 'denied' : 'idle');
    } catch {
      setState('idle');
    }
  };

  if (state === 'on') {
    return <Text className="mt-8 text-base text-ink">Varsler er på ✓</Text>;
  }

  if (state === 'unsupported' || state === 'denied') {
    return (
      <Text className="mt-8 text-center text-sm text-muted">
        {state === 'unsupported'
          ? 'Denne nettleseren støtter ikke varsler. Legg EkteTid til på Hjem-skjermen, eller bruk appen.'
          : 'Varsler er blokkert i nettleseren. Du kan tillate dem i nettstedsinnstillingene.'}
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
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

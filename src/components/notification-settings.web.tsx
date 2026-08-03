import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';

import {
  DEFAULT_PREFS,
  PREF_LABELS,
  fetchPrefs,
  savePrefs,
  type Prefs,
} from '@/lib/notifications';
import {
  isSubscribed,
  isWebPushSupported,
  permissionState,
  registerForWebPush,
  unregisterWebPush,
} from '@/lib/web-push';

/**
 * The "Varsler" section, in a browser.
 *
 * Its own component rather than a branch inside the native one, because only
 * the preference rows are shared. Everything around them differs: there is no
 * Expo token, no permission API in common, and no way to schedule the daily
 * reminder — that one is `scheduleNotificationAsync` on the device, and a
 * browser has no equivalent that survives the tab closing, so it is absent
 * here rather than present and broken.
 *
 * The preferences themselves are the same rows in the same table, so turning
 * "Hjerter" off in a browser turns it off on the phone too. That is the
 * intended behaviour: they are the user's preferences, not the device's.
 */
export function NotificationSettings({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const supported = isWebPushSupported();
  const denied = permissionState() === 'denied';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [stored, subscribed] = await Promise.all([fetchPrefs(userId), isSubscribed()]);
        if (cancelled) return;
        setPrefs(stored);
        setEnabled(subscribed);
      } catch {
        // Falls back to the defaults already in state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    (key: keyof Prefs) => {
      const next = { ...prefs, [key]: !prefs[key] };
      setPrefs(next);
      void savePrefs(userId, next).catch(() => setPrefs(prefs));
    },
    [prefs, userId]
  );

  const toggleEnabled = useCallback(
    async (value: boolean) => {
      setBusy(true);
      try {
        if (value) {
          // The permission prompt appears here, on a deliberate action, rather
          // than on page load where browsers increasingly refuse it outright.
          setEnabled(await registerForWebPush(userId));
        } else {
          await unregisterWebPush();
          setEnabled(false);
        }
      } catch {
        setEnabled(false);
      } finally {
        setBusy(false);
      }
    },
    [userId]
  );

  if (!supported) {
    return (
      <>
        <Heading />
        <View className="mt-3 rounded-tile bg-glass px-4 py-3">
          <Text className="text-sm text-muted">
            Nettleseren din støtter ikke varsler. På iPhone må du legge EkteTid til på
            Hjem-skjermen først — eller bruke appen.
          </Text>
        </View>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Heading />
        <View className="mt-3 items-center rounded-tile bg-glass py-8">
          <ActivityIndicator color="#ffffff" />
        </View>
      </>
    );
  }

  return (
    <>
      <Heading />
      <View className="mt-3 overflow-hidden rounded-tile bg-glass">
        <Row
          title="Varsler i nettleseren"
          detail="Få beskjed her, på samme måte som i appen"
          value={enabled}
          disabled={busy || denied}
          onChange={(value) => void toggleEnabled(value)}
        />

        {/* The per-kind switches are meaningless until something is delivered,
            so they only appear once this browser is actually subscribed. */}
        {enabled
          ? PREF_LABELS.map(({ key, title, detail }) => (
              <Row
                key={key}
                title={title}
                detail={detail}
                value={prefs[key]}
                onChange={() => toggle(key)}
              />
            ))
          : null}

        {denied ? (
          <View className="border-t border-glass-border px-4 py-3">
            <Text className="text-sm text-alert">
              Varsler er blokkert for dette nettstedet. Du må slå dem på igjen i
              nettleserinnstillingene.
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

function Heading() {
  return <Text className="mb-1 mt-7 text-sm text-muted">Varsler</Text>;
}

function Row({
  title,
  detail,
  value,
  disabled,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-glass-border px-4 py-3 last:border-b-0">
      <View className="flex-1">
        <Text className="text-base text-ink">{title}</Text>
        <Text className="mt-0.5 text-xs text-muted">{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

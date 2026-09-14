import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';

import {
  DEFAULT_PREFS,
  ensureNotificationPermission,
  PREF_LABELS,
  fetchPrefs,
  isDailyReminderOn,
  savePrefs,
  setDailyReminder,
  type Prefs,
} from '@/lib/notifications';

/**
 * The "Varsler" section of the profile.
 *
 * Preferences are saved as they are toggled rather than behind a save button:
 * there is nothing to review and nothing to get wrong, and a switch that does
 * not take effect until you press something else is a switch people distrust.
 * The write is optimistic, and reverts only if the server refuses.
 */
export function NotificationSettings({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [daily, setDaily] = useState(false);
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState(true);

  useEffect(() => {
    let active = true;

    // Neither the network preference read nor the native scheduled-reminder
    // lookup is allowed to hold the whole settings section behind a spinner.
    // They settle independently, and defaults become interactive quickly if
    // either service is slow or the phone is offline.
    const reveal = setTimeout(() => {
      if (active) setLoading(false);
    }, 700);

    const prefsRequest = fetchPrefs(userId)
      .then((stored) => {
        if (active) setPrefs(stored);
      })
      .catch(() => {});
    const reminderRequest = isDailyReminderOn()
      .then((reminder) => {
        if (active) setDaily(reminder);
      })
      .catch(() => {});

    void Promise.allSettled([prefsRequest, reminderRequest]).then(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      clearTimeout(reveal);
    };
  }, [userId]);

  const toggle = useCallback(
    (key: keyof Prefs) => {
      void Haptics.selectionAsync();
      const next = { ...prefs, [key]: !prefs[key] };
      setPrefs(next);
      void savePrefs(userId, next).catch(() => setPrefs(prefs));
    },
    [prefs, userId]
  );

  const toggleDaily = useCallback(
    async (value: boolean) => {
      void Haptics.selectionAsync();
      setDaily(value);

      // Turning this on is the first thing here that needs the system
      // permission, so this is where it is worth asking for it. A daily local
      // reminder does not need an Expo push token or a network round trip.
      if (value) {
        const allowed = await ensureNotificationPermission();
        setGranted(allowed);
        if (!allowed) {
          setDaily(false);
          return;
        }
      }
      await setDailyReminder(value).catch(() => setDaily(!value));
    },
    []
  );

  if (loading) {
    return (
      <>
        <Heading />
        <View className="mt-3 overflow-hidden rounded-tile bg-glass opacity-60">
          <Row
            title="Daglig påminnelse"
            detail="Laster varslingsvalg…"
            value={false}
            disabled
            onChange={() => {}}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Heading />
      <View className="mt-3 overflow-hidden rounded-tile bg-glass">
        <Row
          title="Daglig påminnelse"
          detail="Et lite dytt klokka 19 om å ta dagens bilde"
          value={daily}
          onChange={(value) => void toggleDaily(value)}
        />

        {PREF_LABELS.map(({ key, title, detail }) => (
          <Row
            key={key}
            title={title}
            detail={detail}
            value={prefs[key]}
            onChange={() => toggle(key)}
          />
        ))}

        {/*
          Only shown once a request has actually been refused. Saying "varsler er
          avslått" to someone who has never been asked is both wrong and alarming.
        */}
        {!granted ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            className="border-t border-glass-border p-3 active:opacity-70">
            <ErrorNotice message="Varsler er slått av. Trykk for å åpne Innstillinger." />
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

/**
 * Owned by this component rather than by the profile screen, so that the
 * heading and the switches it introduces appear and disappear together.
 */
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
      {/* Left as the system switch. The white-on-black override read as
          disabled when it was on, which is the opposite of what a switch is
          for — and iOS users know the green one at a glance. */}
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

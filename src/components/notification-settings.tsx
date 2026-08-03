import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Switch, Text, View } from 'react-native';

import {
  DEFAULT_PREFS,
  PREF_LABELS,
  fetchPrefs,
  isDailyReminderOn,
  registerForPush,
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

  const load = useCallback(async () => {
    try {
      const [stored, reminder] = await Promise.all([fetchPrefs(userId), isDailyReminderOn()]);
      setPrefs(stored);
      setDaily(reminder);
    } catch {
      // Falls back to the defaults already in state. A settings list that
      // refuses to render is worse than one showing what a new account gets.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      // permission, so this is where it is worth asking for it.
      if (value) {
        const allowed = await registerForPush(userId);
        setGranted(allowed);
      }
      await setDailyReminder(value).catch(() => setDaily(!value));
    },
    [userId]
  );

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
            className="border-t border-glass-border px-4 py-3 active:opacity-70">
            <Text className="text-sm text-alert">
              Varsler er slått av for EkteTid. Trykk for å åpne Innstillinger.
            </Text>
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
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
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
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

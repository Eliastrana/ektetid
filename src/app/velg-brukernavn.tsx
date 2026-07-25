import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { setUsername } from '@/lib/auth';

/** Mirrors the username_format check constraint on public.profiles. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export default function ChooseUsernameScreen() {
  const { session, refreshProfile } = useAuth();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = value.trim().toLowerCase();
  const valid = USERNAME_PATTERN.test(normalized);

  async function submit() {
    if (!valid || busy || !session) return;
    setBusy(true);
    setError(null);
    try {
      const claimed = await setUsername(session.user.id, normalized);
      if (!claimed) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setError('Brukernavnet er allerede tatt.');
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshProfile();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Klarte ikke å lagre brukernavnet. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1 justify-between px-6 py-4">
        <View className="mt-20">
          <Text className="text-4xl text-ink">Velg brukernavn</Text>
          <Text className="mt-3 text-base text-muted">
            Det er slik vennene dine finner deg.
          </Text>

          <View className="mt-8 flex-row items-center rounded-tile bg-glass px-4">
            <Text className="text-xl text-muted">@</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              placeholder="brukernavn"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              onSubmitEditing={submit}
              returnKeyType="done"
              className="h-14 flex-1 pl-1 text-xl leading-none text-ink"
            />
          </View>

          <Text className="mt-3 text-xs text-muted">
            3–24 tegn. Små bokstaver, tall og understrek.
          </Text>

          {error ? <Text className="mt-3 text-sm text-alert">{error}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!valid || busy}
          onPress={submit}
          className={`h-14 flex-row items-center justify-center rounded-tile active:opacity-80 ${
            valid ? 'bg-ink' : 'bg-surface-raised'
          }`}>
          {busy ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text className={`text-base ${valid ? 'text-canvas' : 'text-muted'}`}>
              Fortsett
            </Text>
          )}
        </Pressable>
      </Screen>
    </View>
  );
}

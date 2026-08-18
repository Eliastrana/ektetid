import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorNotice } from '@/components/error-notice';
import { MIN_PASSWORD_LENGTH, setPassword } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';

/**
 * Set or replace the account password.
 *
 * No "current password" field: reaching this screen already required a live
 * session, which was earned either through Apple or through a code sent to the
 * account's own inbox. Asking again would prove nothing, and would lock out the
 * people this is most useful to — those who have never had a password at all.
 */
export default function PasswordScreen() {
  const router = useRouter();
  const [password, setValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = password === repeat;
  const valid = longEnough && matches;
  const validationError =
    password.length > 0 && !longEnough
      ? `Passordet må være minst ${MIN_PASSWORD_LENGTH} tegn.`
      : repeat.length > 0 && !matches
        ? 'Passordene er ikke like.'
        : error;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setPassword(password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      // Left on screen for a beat so the confirmation is actually read, rather
      // than the screen vanishing and leaving you unsure it took.
      setTimeout(() => router.back(), 900);
    } catch (caught) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(caught, 'Klarte ikke å lagre passordet.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen className="flex-1" edges={['bottom']}>
          <View className="mt-8 flex-1 px-5">
            <Text className="mb-4 text-sm text-muted">
              Med et passord slipper du å vente på koden på e-post. Du kan
              fortsatt logge inn med kode når som helst.
            </Text>

            <TextInput
              value={password}
              onChangeText={setValue}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              secureTextEntry
              textContentType="newPassword"
              placeholder="Nytt passord"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              className="h-14 rounded-tile bg-glass px-4 text-base leading-none text-ink"
            />
            <TextInput
              value={repeat}
              onChangeText={setRepeat}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="newPassword"
              placeholder="Gjenta passordet"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              className="mt-3 h-14 rounded-tile bg-glass px-4 text-base leading-none text-ink"
            />

            {/*
              Only complains once there is something to complain about. Telling
              someone their password is too short before they have finished
              typing it is noise.
            */}
            {validationError ? (
              <View className="mt-3">
                <ErrorNotice message={validationError} />
              </View>
            ) : (
              <Text className="mt-3 text-sm text-muted">
                {saved ? 'Passordet er lagret.' : `Minst ${MIN_PASSWORD_LENGTH} tegn.`}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={!valid || saving}
              onPress={() => void save()}
              className={`mt-6 h-14 items-center justify-center rounded-tile active:opacity-80 ${
                valid ? 'bg-ink' : 'bg-surface-raised'
              }`}>
              {saving ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text className={`text-base ${valid ? 'text-canvas' : 'text-muted'}`}>
                  Lagre passord
                </Text>
              )}
            </Pressable>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}

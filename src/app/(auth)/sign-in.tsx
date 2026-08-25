import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/screen';
import { ErrorNotice } from '@/components/error-notice';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { errorMessage } from '@/lib/errors';

import {
  SignInCancelled,
  isAppleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithPassword,
  verifyEmailCode,
} from '@/lib/auth';

type Busy = 'apple' | 'email' | null;

/**
 * Which of the three ways in is on screen.
 *
 * 'email' offers Apple and an address; 'code' takes the six digits we mailed;
 * 'password' is for the minority who set one, and is never the default — most
 * people have no password to type.
 */
type Step = 'email' | 'code' | 'password';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('email');

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function run(provider: Busy, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(provider);
    setError(null);
    try {
      await fn();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      if (caught instanceof SignInCancelled) return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(caught, 'Innloggingen feilet.'));
    } finally {
      setBusy(null);
    }
  }

  const emailValid = EMAIL_PATTERN.test(email.trim());

  return (
    <View className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Screen className="flex-1 justify-between px-6 py-4">
          <View className="mt-10">
            <Text className="text-7xl text-ink">EkteTid</Text>
            <Text className="mt-3 text-xl text-muted">Det er tid for å være ekte</Text>
          </View>

          <View className="gap-3">
            {error ? (
              <ErrorNotice message={error} />
            ) : null}

            {step === 'code' ? (
              <>
                <Text className="mb-1 text-center text-sm text-muted">
                  Vi sendte en kode til {email.trim()}
                </Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  autoFocus
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor="#6b6f76"
                  selectionColor="#ffffff"
                  className="h-14 rounded-tile bg-glass text-center text-2xl leading-none text-ink"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={code.trim().length < 6 || busy !== null}
                  onPress={() => run('email', () => verifyEmailCode(email, code))}
                  className={`h-14 items-center justify-center rounded-tile active:opacity-80 ${
                    code.trim().length === 6 ? 'bg-ink' : 'bg-surface-raised'
                  }`}>
                  {busy === 'email' ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <Text
                      className={`text-base ${
                        code.trim().length === 6 ? 'text-canvas' : 'text-muted'
                      }`}>
                      Logg inn
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}>
                  <Text className="py-2 text-center text-sm text-muted">
                    Bruk en annen e-post
                  </Text>
                </Pressable>
              </>
            ) : step === 'password' ? (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  placeholder="din@epost.no"
                  placeholderTextColor="#6b6f76"
                  selectionColor="#ffffff"
                  style={{ paddingHorizontal: 16 }}
                  className="h-14 rounded-tile bg-glass text-base leading-none text-ink"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  textContentType="password"
                  placeholder="Passord"
                  placeholderTextColor="#6b6f76"
                  selectionColor="#ffffff"
                  style={{ paddingHorizontal: 16 }}
                  className="h-14 rounded-tile bg-glass text-base leading-none text-ink"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!emailValid || password.length === 0 || busy !== null}
                  onPress={() => run('email', () => signInWithPassword(email, password))}
                  className={`h-14 items-center justify-center rounded-tile active:opacity-80 ${
                    emailValid && password.length > 0 ? 'bg-ink' : 'bg-surface-raised'
                  }`}>
                  {busy === 'email' ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <Text
                      className={`text-base ${
                        emailValid && password.length > 0 ? 'text-canvas' : 'text-muted'
                      }`}>
                      Logg inn
                    </Text>
                  )}
                </Pressable>
                {/* The way back for anyone who set a password and forgot it:
                    the code still works, and setting a new one lives in
                    Innstillinger once they are in. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setStep('email');
                    setPassword('');
                    setError(null);
                  }}>
                  <Text className="py-2 text-center text-sm text-muted">
                    Få en kode på e-post i stedet
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {appleAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={12}
                    style={{ height: 54 }}
                    onPress={() => run('apple', signInWithApple)}
                  />
                ) : null}

                {/* Only when there is something above to be an alternative to.
                    On web there is no Apple button, and the divider separated
                    nothing from nothing. */}
                {appleAvailable ? (
                  <View className="my-2 flex-row items-center gap-3">
                    <View className="h-px flex-1 bg-glass-border" />
                    <Text className="text-xs text-muted">eller</Text>
                    <View className="h-px flex-1 bg-glass-border" />
                  </View>
                ) : null}

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="din@epost.no"
                  placeholderTextColor="#6b6f76"
                  selectionColor="#ffffff"
                  style={{ paddingHorizontal: 16 }}
                  className="h-14 rounded-tile bg-glass text-base leading-none text-ink"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!emailValid || busy !== null}
                  onPress={() =>
                    run('email', async () => {
                      await sendEmailCode(email);
                      setStep('code');
                    })
                  }
                  className={`h-14 items-center justify-center rounded-tile active:opacity-80 ${
                    emailValid ? 'bg-ink' : 'bg-surface-raised'
                  }`}>
                  {busy === 'email' ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <Text className={`text-base ${emailValid ? 'text-canvas' : 'text-muted'}`}>
                      Send kode
                    </Text>
                  )}
                </Pressable>
                {/* Secondary on purpose. A password is opt-in, so for almost
                    everyone the code above is the only way in that exists. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setStep('password');
                    setError(null);
                  }}>
                  <Text className="py-2 text-center text-sm text-muted">
                    Logg inn med passord
                  </Text>
                </Pressable>
              </>
            )}

            <Text className="mt-4 text-center text-xs text-muted">
              Bildene dine deles bare med vennene du selv godkjenner.
            </Text>

            {/* Guideline 1.2: the user has to be able to read what they are
                agreeing to before they sign in, not after. */}
            <Text className="mt-2 text-center text-xs text-muted">
              Ved å logge inn godtar du{' '}
              <Text className="text-ink underline" onPress={() => void Linking.openURL(TERMS_URL)}>
                vilkårene
              </Text>{' '}
              og{' '}
              <Text className="text-ink underline" onPress={() => void Linking.openURL(PRIVACY_URL)}>
                personvernerklæringen
              </Text>
              .
            </Text>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}

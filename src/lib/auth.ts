import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { unregisterPush } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

/** Thrown when the user backs out of a sign-in sheet. Callers should stay quiet. */
export class SignInCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SignInCancelled';
  }
}

export function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Sign in with Apple.
 *
 * Apple only ever sees the SHA-256 of the nonce, and embeds that hash in the
 * identity token. Supabase re-hashes the raw nonce we pass it and compares, so
 * it must receive the raw value while Apple receives the digest.
 */
export async function signInWithApple(): Promise<void> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      throw new SignInCancelled();
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple returnerte ingen identitetstoken.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple only sends the real name on the very first authorisation, so if it is
  // present it has to be persisted now or it is gone for good.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName && data.user) {
    await supabase
      .from('profiles')
      .update({ display_name: fullName })
      .eq('id', data.user.id)
      .is('display_name', null);
  }
}

/**
 * Sign in with Google through the system browser.
 *
 * Currently unused — the button was removed. Apple and email codes already
 * cover every user on an iOS-only app, and a half-configured provider that
 * errors on tap is worse than one that is not offered. Kept because it becomes
 * worth having the moment there is an Android build, and because the awkward
 * part is this exchange rather than the button.
 *
 * Re-enabling needs a Google Cloud OAuth client (Web application type) with
 * Supabase's callback registered, its id and secret in the Supabase dashboard,
 * and `ektetid://**` on the redirect allow-list.
 *
 * Uses PKCE: Supabase hands back a one-time code on the redirect, which is
 * exchanged for a session here. No client secret ever reaches the device.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Fikk ingen innloggings-URL fra Supabase.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    throw new SignInCancelled();
  }

  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('Fant ingen kode i svaret fra Google.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

/**
 * Email sign-in, step one: send a six-digit code.
 *
 * Requires the Supabase "Magic Link" email template to include {{ .Token }}.
 * The stock template only renders {{ .ConfirmationURL }}, in which case the
 * mail arrives as a link and no code is shown.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Email sign-in, step two: exchange the code for a session. */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  // Before the session goes: deleting the row needs the policy to still see
  // this user as its owner. Left behind, the device would keep receiving
  // notifications meant for whoever just signed out.
  await unregisterPush();

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Claim a username. Returns false if it is already taken, which is a normal
 * outcome rather than an error worth throwing over.
 */
export async function setUsername(userId: string, username: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ username: username.trim().toLowerCase() })
    .eq('id', userId);

  if (!error) return true;
  if (error.code === '23505') return false; // unique_violation
  throw error;
}

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { ProCard } from '@/components/pro-card';
import { signOut } from '@/lib/auth';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { isLocalArchiveEnabled, setLocalArchiveEnabled } from '@/lib/local-archive';
import { deleteAccount } from '@/lib/moderation';
import {
  isLockScreenActivityEnabled,
  setLockScreenActivityEnabled,
} from '@/lib/lock-screen-activity';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [lockScreenEnabled, setLockScreenEnabled] = useState(isLockScreenActivityEnabled);
  const [updatingLockScreen, setUpdatingLockScreen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [localArchiveEnabled, setLocalArchiveEnabledState] = useState(false);
  const [updatingLocalArchive, setUpdatingLocalArchive] = useState(false);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;

    let active = true;
    void isLocalArchiveEnabled(userId)
      .then((archiveEnabled) => {
        if (!active) return;
        setLocalArchiveEnabledState(archiveEnabled);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [session?.user.id]);

  /**
   * App Store guideline 5.1.1(v) requires account deletion to be reachable
   * from inside the app. It is genuinely irreversible — every album, post and
   * photo goes — so it asks twice and names what will be lost.
   */
  function confirmDelete() {
    Alert.alert(
      'Slette kontoen?',
      'Alle albumene, bildene og kommentarene dine blir slettet for godt. Dette kan ikke angres.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Slett kontoen',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Helt sikker?', 'Siste sjanse. Kontoen kan ikke gjenopprettes.', [
              { text: 'Avbryt', style: 'cancel' },
              {
                text: 'Ja, slett alt',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await deleteAccount();
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch {
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    Alert.alert(
                      'Klarte ikke å slette',
                      'Noe gikk galt. Prøv igjen, eller kontakt oss.'
                    );
                  } finally {
                    setDeleting(false);
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['bottom']}>
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingTop: 32, paddingBottom: 36 }}>
          <Text className="mb-2 text-sm text-muted">Konto</Text>
          <View className="overflow-hidden rounded-tile bg-glass">
            <View className="px-4 py-3">
              <Text className="text-xs text-muted">Brukernavn</Text>
              <Text className="text-base text-ink">@{profile?.username}</Text>
            </View>
            <View className="h-px bg-glass-border" />
            <View className="px-4 py-3">
              <Text className="text-xs text-muted">E-post</Text>
              <Text className="text-base text-ink">
                {session?.user.email ?? 'Skjult av Apple'}
              </Text>
            </View>
            <View className="h-px bg-glass-border" />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/passord')}
              className="flex-row items-center px-4 py-3 active:bg-glass-strong">
              <View className="flex-1">
                <Text className="text-xs text-muted">Passord</Text>
                <Text className="text-base text-ink">Velg et passord</Text>
              </View>
              <SymbolView
                name="chevron.right"
                size={14}
                tintColor="#6b6f76"
                fallback={<Text className="text-base text-muted">›</Text>}
              />
            </Pressable>
          </View>

          {session ? (
            <>
              <Text className="mb-2 mt-8 text-sm text-muted">Pro</Text>
              <ProCard userId={session.user.id} onProChange={setIsPro} />

              {isPro && process.env.EXPO_OS !== 'web' ? (
                <View className="mt-3 flex-row items-center rounded-tile bg-glass px-4 py-3">
                  <View className="flex-1 pr-4">
                    <Text className="text-base text-ink">Automatisk EkteTid-arkiv</Text>
                    <Text className="mt-0.5 text-xs text-muted">
                      Egne publiseringer lagres i et EkteTid-album i Bilder.
                    </Text>
                  </View>
                  {updatingLocalArchive ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Switch
                      value={localArchiveEnabled}
                      onValueChange={async (enabled) => {
                        setUpdatingLocalArchive(true);
                        try {
                          await setLocalArchiveEnabled(session.user.id, enabled);
                          setLocalArchiveEnabledState(enabled);
                          await Haptics.selectionAsync();
                        } catch {
                          Alert.alert(
                            'Kunne ikke slå på arkivet',
                            'Gi EkteTid tilgang til Bilder i Innstillinger og prøv igjen.'
                          );
                        } finally {
                          setUpdatingLocalArchive(false);
                        }
                      }}
                    />
                  )}
                </View>
              ) : null}
            </>
          ) : null}

          {process.env.EXPO_OS === 'ios' ? (
            <>
              <Text className="mb-2 mt-8 text-sm text-muted">Låseskjerm</Text>
              <View className="flex-row items-center rounded-tile bg-glass px-4 py-3">
                <View className="flex-1 pr-4">
                  <Text className="text-base text-ink">EkteTid Live Activity</Text>
                  <Text className="mt-0.5 text-xs text-muted">
                    Kameraet ligger klart på låseskjermen og Dynamic Island.
                  </Text>
                </View>
                {updatingLockScreen ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Switch
                    value={lockScreenEnabled}
                    onValueChange={async (enabled) => {
                      setUpdatingLockScreen(true);
                      try {
                        await setLockScreenActivityEnabled(
                          enabled,
                          profile?.display_name ?? profile?.username
                        );
                        setLockScreenEnabled(enabled);
                        await Haptics.selectionAsync();
                      } catch {
                        Alert.alert(
                          'Kunne ikke oppdatere låseskjermen',
                          'Prøv igjen etter at appen er bygget på nytt.'
                        );
                      } finally {
                        setUpdatingLockScreen(false);
                      }
                    }}
                  />
                )}
              </View>
            </>
          ) : null}

          <Text className="mb-2 mt-8 text-sm text-muted">Farlig område</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="h-14 items-center justify-center rounded-tile bg-glass active:bg-glass-strong">
            <Text className="text-base text-ink">Logg ut</Text>
          </Pressable>

          {/* Reachable after sign-in too, not only on the sign-in screen —
              agreeing once should not mean never being able to read it again. */}
          <View className="mt-3 flex-row justify-center gap-5">
            <Text
              className="text-xs text-muted underline"
              onPress={() => void Linking.openURL(TERMS_URL)}>
              Vilkår
            </Text>
            <Text
              className="text-xs text-muted underline"
              onPress={() => void Linking.openURL(PRIVACY_URL)}>
              Personvern
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDelete}
            className="mt-3 h-14 items-center justify-center rounded-tile active:opacity-80">
            {deleting ? (
              <ActivityIndicator color="#ff3b30" />
            ) : (
              <Text className="text-base text-alert">Slett kontoen min</Text>
            )}
          </Pressable>

          <Text className="mt-3 text-center text-xs text-muted">
            Sletting fjerner alle albumene og bildene dine for godt.
          </Text>
        </ScrollView>
      </Screen>
    </View>
  );
}

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { signOut } from '@/lib/auth';
import { deleteAccount } from '@/lib/moderation';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [deleting, setDeleting] = useState(false);

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
      <Screen className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center gap-3 px-5 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tilbake"
            onPress={() => router.back()}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full border border-glass-border bg-glass active:bg-glass-strong">
            <SymbolView
              name="chevron.left"
              size={18}
              tintColor="#ffffff"
              fallback={<Text className="text-lg text-ink">‹</Text>}
            />
          </Pressable>
          <Text className="text-3xl text-ink">Innstillinger</Text>
        </View>

        <View className="mt-8 flex-1 px-5">
          <Text className="mb-2 text-sm text-muted">Konto</Text>
          <View className="overflow-hidden rounded-tile border border-glass-border bg-glass">
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
          </View>

          <Text className="mb-2 mt-8 text-sm text-muted">Farlig område</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="h-14 items-center justify-center rounded-tile border border-glass-border bg-glass active:bg-glass-strong">
            <Text className="text-base text-ink">Logg ut</Text>
          </Pressable>

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
        </View>
      </Screen>
    </View>
  );
}

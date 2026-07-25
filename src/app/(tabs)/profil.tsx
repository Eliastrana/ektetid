import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { signOut } from '@/lib/auth';
import { deleteAccount } from '@/lib/moderation';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useAuth();
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
                    await Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success
                    );
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
      <Screen className="flex-1 justify-between px-5 py-4">
        <View>
          <Text className="text-4xl text-ink">{profile?.display_name ?? 'Profil'}</Text>
          <Text className="mt-1 text-base text-muted">@{profile?.username}</Text>
        </View>

        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/venner')}
            className="h-14 items-center justify-center rounded-tile border border-glass-border bg-glass active:bg-glass-strong">
            <Text className="text-base text-ink">Venner</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="h-14 items-center justify-center rounded-tile active:opacity-80">
            <Text className="text-base text-muted">Logg ut</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDelete}
            className="h-14 items-center justify-center rounded-tile active:opacity-80">
            {deleting ? (
              <ActivityIndicator color="#ff3b30" />
            ) : (
              <Text className="text-base text-alert">Slett kontoen min</Text>
            )}
          </Pressable>
        </View>
      </Screen>
    </View>
  );
}

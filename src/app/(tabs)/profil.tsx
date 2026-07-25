import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { signOut } from '@/lib/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useAuth();

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
        </View>
      </Screen>
    </View>
  );
}

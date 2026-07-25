import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { pickAvatar, removeAvatar, uploadAvatar } from '@/lib/avatar';
import { errorMessage } from '@/lib/errors';

type Props = {
  userId: string;
  avatarUrl: string | null;
  /** Initial shown when there is no picture. */
  initials: string;
  onChanged: () => void | Promise<void>;
};

/** Tap to set a profile picture; long-press to remove it. */
export function AvatarPicker({ userId, avatarUrl, initials, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function choose() {
    if (busy) return;
    const uri = await pickAvatar();
    if (!uri) return;

    setBusy(true);
    try {
      await uploadAvatar(userId, uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onChanged();
    } catch (caught) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Klarte ikke å laste opp', errorMessage(caught, 'Prøv igjen.'));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove() {
    if (!avatarUrl || busy) return;
    Alert.alert('Fjerne profilbildet?', undefined, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Fjern',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await removeAvatar(userId);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await onChanged();
          } catch (caught) {
            Alert.alert('Klarte ikke å fjerne', errorMessage(caught, 'Prøv igjen.'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={avatarUrl ? 'Bytt profilbilde' : 'Legg til profilbilde'}
      accessibilityHint={avatarUrl ? 'Hold inne for å fjerne' : undefined}
      onPress={choose}
      onLongPress={confirmRemove}
      disabled={busy}
      className="active:opacity-80">
      <View className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-glass">
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 72, height: 72 }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text className="text-2xl text-ink">{initials}</Text>
        )}
      </View>

      {!busy ? (
        <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-canvas bg-ink">
          <SymbolView
            name={avatarUrl ? 'pencil' : 'plus'}
            size={11}
            tintColor="#000000"
            fallback={<Text className="text-xs text-canvas">+</Text>}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

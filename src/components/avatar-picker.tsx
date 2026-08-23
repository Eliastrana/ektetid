import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { pickAvatar, removeAvatar, uploadAvatar } from '@/lib/avatar';
import { errorMessage } from '@/lib/errors';

type Props = {
  userId: string;
  avatarUrl: string | null;
  /** Whose picture it is — the placeholder draws its first letter. */
  name: string;
  pro?: boolean;
  onChanged: () => void | Promise<void>;
};

/** Tap to set a profile picture; long-press to remove it. */
export function AvatarPicker({ userId, avatarUrl, name, pro = false, onChanged }: Props) {
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
      {busy ? (
        <View
          className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-glass"
          style={pro ? { borderWidth: 2, borderColor: '#ffffff' } : undefined}>
          <ActivityIndicator color="#ffffff" />
        </View>
      ) : (
        <Avatar
          url={avatarUrl}
          name={name}
          seed={userId}
          size={72}
          ringWidth={pro ? 2 : 0}
        />
      )}

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

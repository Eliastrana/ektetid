import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  checkForUpdate,
  dismissUpdate,
  isUpdateDismissed,
  type AvailableUpdate,
} from '@/lib/app-update';

/**
 * A quiet "there is a newer version" card at the top of the feed.
 *
 * Encouraged, never required: "Ikke nå" hides it until the next release, and
 * nothing in the app is withheld from someone who ignores it.
 */
export function UpdateCard() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  // On focus rather than mount, so coming back to the feed after a while
  // notices a release that went out in the meantime. The lookup itself is
  // cached, so this is cheap.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void checkForUpdate().then(async (found) => {
        const hidden = found ? await isUpdateDismissed(found.version) : true;
        if (active) setUpdate(hidden ? null : found);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  if (!update) return null;

  const open = () => {
    void Haptics.selectionAsync();
    void Linking.openURL(update.storeUrl).catch(() => {
      if (update.webUrl) void Linking.openURL(update.webUrl);
    });
  };

  const later = () => {
    void Haptics.selectionAsync();
    setUpdate(null);
    void dismissUpdate(update.version);
  };

  return (
    <View className="mb-5 rounded-tile bg-glass p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-glass-strong">
          <Icon
            name="sparkles"
            size={18}
            tintColor="#ffffff"
            fallback={<Text className="text-base text-ink">✦</Text>}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base text-ink">Ny versjon av EkteTid</Text>
          <Text className="text-xs text-muted">Versjon {update.version} er klar i App Store</Text>
        </View>
      </View>

      {update.notes ? (
        <Text numberOfLines={4} className="mt-3 text-sm leading-5 text-muted">
          {update.notes}
        </Text>
      ) : null}

      <View className="mt-4 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Oppdater til versjon ${update.version} i App Store`}
          onPress={open}
          className="h-10 items-center justify-center rounded-full bg-ink px-5 active:opacity-80">
          <Text className="text-sm text-canvas">Oppdater</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ikke nå, skjul til neste versjon"
          onPress={later}
          hitSlop={6}
          className="h-10 items-center justify-center rounded-full px-4 active:opacity-70">
          <Text className="text-sm text-muted">Ikke nå</Text>
        </Pressable>
      </View>
    </View>
  );
}

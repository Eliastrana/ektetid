import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ErrorNotice } from '@/components/error-notice';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { useAlbumAlerts } from '@/lib/album-alerts';
import { ensureNotificationPermission, registerForPush } from '@/lib/notifications';

export type AlertAlbum = { id: string; title: string; owner: string | null };

/**
 * What holding an album card opens: alerts for that one album.
 *
 * Saved the moment the switch moves, like the rest of the notification
 * settings — a switch that waits for a "Lagre" is a switch people distrust.
 */
export function AlbumAlertSheet({
  userId,
  album,
  onClose,
}: {
  userId: string | undefined;
  album: AlertAlbum | null;
  onClose: () => void;
}) {
  const { ids, setEnabled } = useAlbumAlerts(userId);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  // Keeps the title on screen while the sheet slides away; clearing `album`
  // is what starts the close, and an empty sheet dropping out looks broken.
  const [shown, setShown] = useState<AlertAlbum | null>(album);

  useEffect(() => {
    if (!album) return;
    setShown(album);
    setError(null);
    setDenied(false);
  }, [album]);

  const enabled = shown ? ids.has(shown.id) : false;

  const toggle = async (value: boolean) => {
    if (!shown || !userId) return;
    void Haptics.selectionAsync();
    setError(null);

    try {
      await setEnabled(shown.id, value);
    } catch {
      setError('Klarte ikke å lagre varselet. Prøv igjen.');
      return;
    }

    // The first time someone asks for an alert is the moment that earns the
    // system prompt. The web registers its own push subscription elsewhere.
    if (value && process.env.EXPO_OS !== 'web') {
      const allowed = await ensureNotificationPermission().catch(() => false);
      setDenied(!allowed);
      if (allowed) void registerForPush(userId).catch(() => {});
    }
  };

  return (
    <BottomSheet visible={!!album} onClose={onClose}>
      <Screen className="px-5 pb-2" edges={['bottom']}>
        <View className="flex-row items-center gap-3 pb-1 pt-3">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-glass">
            <Icon
              name={enabled ? 'bell.fill' : 'bell'}
              size={19}
              tintColor="#ffffff"
              fallback={<Text className="text-base text-ink">!</Text>}
            />
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-xl text-ink">
              {shown?.title || 'Album'}
            </Text>
            {shown?.owner ? (
              <Text numberOfLines={1} className="text-sm text-muted">
                {shown.owner}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="mt-4 flex-row items-center gap-3 rounded-tile bg-glass px-4 py-3">
          <View className="flex-1">
            <Text className="text-base text-ink">Varsle meg om nye bilder</Text>
            <Text className="mt-0.5 text-xs leading-4 text-muted">
              Du får et varsel hver gang noen legger ut i dette albumet, også om «Nye øyeblikk» er
              slått av.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Varsle meg om nye bilder i dette albumet"
            value={enabled}
            disabled={!userId || !shown}
            onValueChange={(value) => void toggle(value)}
          />
        </View>

        {denied ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            className="mt-3 active:opacity-70">
            <ErrorNotice message="Varsler er slått av for EkteTid. Trykk for å åpne Innstillinger." />
          </Pressable>
        ) : null}

        {error ? (
          <View className="mt-3">
            <ErrorNotice message={error} />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          className="mt-5 h-12 items-center justify-center rounded-xl bg-ink active:opacity-80">
          <Text className="text-base text-canvas">Ferdig</Text>
        </Pressable>
      </Screen>
    </BottomSheet>
  );
}

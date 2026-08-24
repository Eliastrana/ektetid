import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Icon } from '@/components/icon';
import { fetchProProgress, type ProProgress } from '@/lib/pro';

/**
 * The Pro card without a store.
 *
 * Buying is iOS-only in practice: expo-iap has no web implementation at all,
 * and on Android Play Billing requires the app to have been installed from
 * Play — which a sideloaded APK never was, so the purchase cannot complete no
 * matter how it is configured. Offering a button that cannot work is worse than
 * offering none.
 *
 * What survives is everything that does not involve a till: the feature list,
 * the activity route to Pro, and the unlocked state. Twenty posts across three
 * albums grants Pro on every platform, so this is a real path here rather than
 * a consolation.
 */
export function ProCard({
  userId,
  onProChange,
}: {
  userId: string;
  onProChange?: (isPro: boolean) => void;
}) {
  const [progress, setProgress] = useState<ProProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchProProgress(userId);
    setProgress(next);
    onProChange?.(next.isPro);
  }, [onProChange, userId]);

  useEffect(() => {
    void refresh().catch(() => setError('Klarte ikke å hente Pro-status.'));
  }, [refresh]);

  const postsLeft = Math.max(0, 20 - (progress?.postCount ?? 0));
  const albumsLeft = Math.max(0, 3 - (progress?.albumCount ?? 0));

  return (
    <View className="overflow-hidden rounded-tile border border-ink bg-glass p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-9 items-center justify-center rounded-full border border-ink px-3">
          <Text className="text-[11px] font-semibold tracking-widest text-ink">PRO</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg text-ink">EkteTid Pro</Text>
          <Text className="text-xs text-ink">Låses opp med aktivitet</Text>
        </View>
      </View>

      <View className="mt-4 gap-2">
        <ProFeature icon="memories" label="Minneblikk og oppsummeringer" />
        <ProFeature icon="photo.on.rectangle.angled" label="Cover, farge og layout på album" />
        <ProFeature icon="eye" label="Se hvem som har sett innleggene dine" />
      </View>

      {progress?.isPro ? (
        <View className="mt-4 rounded-xl bg-surface-raised p-3">
          <Text className="text-sm text-ink">Pro er låst opp ✓</Text>
          <Text className="mt-1 text-xs text-muted">
            {progress.purchased ? 'Kjøpet ditt er permanent.' : 'Låst opp med 20 innlegg i minst 3 album.'}
          </Text>
        </View>
      ) : (
        <>
          <Text className="mt-4 text-sm leading-5 text-muted">
            Legg ut 20 innlegg i minst 3 album, så låses Pro opp av seg selv.
          </Text>
          <Text className="mt-3 text-xs text-muted">
            {postsLeft} innlegg og {albumsLeft} album gjenstår.
          </Text>
        </>
      )}

      {error ? (
        <View className="mt-3">
          <ErrorNotice message={error} />
        </View>
      ) : null}
    </View>
  );
}

type ProFeatureIcon = 'memories' | 'photo.on.rectangle.angled' | 'eye';

function ProFeature({ icon, label }: { icon: ProFeatureIcon; label: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon
        name={icon}
        size={13}
        tintColor="#ffffff"
        fallback={<Text className="text-xs text-ink">✓</Text>}
      />
      <Text className="text-sm text-muted">{label}</Text>
    </View>
  );
}

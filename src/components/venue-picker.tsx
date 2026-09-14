import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import {
  DEFAULT_RADIUS,
  searchVenues,
  type Venue,
} from '@/../modules/venue-search';
import { BottomSheet } from '@/components/bottom-sheet';
import { NativePostButton } from '@/components/native-post-button';
import { Screen } from '@/components/screen';
import { errorMessage } from '@/lib/errors';
import type { Coordinates } from '@/lib/geo';
import { formatDistance, venueCategoryName } from '@/lib/venue';

/**
 * The wider sweep, for when the right place is not in the immediate list.
 *
 * A kilometre is far enough to reach the next street over without turning the
 * list into a directory of the city.
 */
const WIDE_RADIUS = 1000;

/**
 * Nearby places to eat, nearest first.
 *
 * Opened from the composer with the photograph's own coordinates, so the list
 * answers "where was this taken" rather than "where am I now" — which differ
 * as soon as someone posts a picture from earlier in the day.
 */
export function VenuePicker({
  visible,
  coordinates,
  onClose,
  onPick,
}: {
  visible: boolean;
  coordinates: Coordinates;
  onClose: () => void;
  onPick: (venue: Venue) => void;
}) {
  const [rows, setRows] = useState<Venue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);

  const load = useCallback(
    (metres: number) => {
      setBusy(true);
      setError(null);
      void searchVenues(coordinates.latitude, coordinates.longitude, metres)
        .then(setRows)
        .catch((caught) => setError(errorMessage(caught, 'Fant ingen steder i nærheten.')))
        .finally(() => setBusy(false));
    },
    [coordinates.latitude, coordinates.longitude]
  );

  // Searched on open rather than on mount: the sheet is rendered by the
  // composer whether or not it is showing, and MapKit should not be asked
  // anything until someone actually looks.
  useEffect(() => {
    if (!visible) return;
    setRadius(DEFAULT_RADIUS);
    load(DEFAULT_RADIUS);
  }, [load, visible]);

  const widen = () => {
    void Haptics.selectionAsync();
    setRadius(WIDE_RADIUS);
    load(WIDE_RADIUS);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} className="h-[64vh]">
      <Screen className="flex-1 px-5" edges={['bottom']}>
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-xl text-ink">Stedet du er på</Text>
          <NativePostButton
            label="Lukk"
            systemImage="xmark"
            appearance="glass"
            onPress={onClose}
          />
        </View>

        {error ? <Text className="mb-2 text-sm text-alert">{error}</Text> : null}

        <FlatList
          className="flex-1"
          data={rows}
          keyExtractor={(venue) => `${venue.name}-${venue.latitude}-${venue.longitude}`}
          contentContainerStyle={{ paddingBottom: 16, gap: 8 }}
          ListEmptyComponent={
            busy ? (
              <View className="py-10">
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : (
              <Text className="py-10 text-center text-sm text-muted">
                Ingen spisesteder innenfor {radius} meter.
              </Text>
            )
          }
          ListFooterComponent={
            // Offered whether or not the list is empty: the nearest place is
            // not always the right one, and the alternative is giving up.
            radius === DEFAULT_RADIUS && !busy ? (
              <Pressable
                accessibilityRole="button"
                onPress={widen}
                className="mt-3 h-12 items-center justify-center rounded-tile bg-glass active:opacity-70">
                <Text className="text-base text-ink">Søk i et større område</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const category = venueCategoryName(item.category);
            const distance = formatDistance(item.distance);
            const detail = [category, distance, item.address]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Velg ${item.name}`}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onPick(item);
                }}
                className="rounded-tile bg-glass px-4 py-3 active:opacity-70">
                <Text numberOfLines={1} className="text-base text-ink">
                  {item.name}
                </Text>
                {detail ? (
                  <Text numberOfLines={1} className="mt-0.5 text-xs text-muted">
                    {detail}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      </Screen>
    </BottomSheet>
  );
}

import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isVenueSearchAvailable, type Venue } from '@/../modules/venue-search';
import { Icon } from '@/components/icon';
import { VenuePicker } from '@/components/venue-picker';
import type { Coordinates } from '@/lib/geo';
import { venueCategoryName } from '@/lib/venue';

/**
 * The attach-a-venue row for the composer.
 *
 * Renders nothing at all in two cases, both deliberate. Without coordinates
 * there is nowhere to search from — a photo from the library with no GPS gives
 * MapKit no question to answer. And off Apple platforms the search does not
 * exist: the suggestions come from Apple's own place data, and rather than
 * substitute a different provider with different names for the same restaurant,
 * the field is simply absent.
 */
export function VenueField({
  venue,
  coordinates,
  onChange,
}: {
  venue: Venue | null;
  coordinates: Coordinates | null;
  onChange: (venue: Venue | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (!isVenueSearchAvailable || !coordinates) return null;

  const category = venue ? venueCategoryName(venue.category) : null;

  return (
    <>
      <View className="rounded-tile bg-glass p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-base text-ink">Spisested</Text>
            <Text className="mt-0.5 text-xs text-muted">
              Stedet vises på innlegget, og kan åpnes i Kart
            </Text>
          </View>

          {venue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fjern stedet"
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(null);
              }}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-glass-strong">
              <Icon
                name="xmark"
                size={14}
                tintColor="#b0b4ba"
                fallback={<Text className="text-muted">✕</Text>}
              />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={venue ? `Bytt sted. Nå: ${venue.name}` : 'Velg spisested'}
          onPress={() => setPicking(true)}
          className="mt-3 h-11 flex-row items-center justify-center gap-2 rounded-xl bg-surface-raised px-3 active:opacity-70">
          <Icon
            name="fork.knife"
            size={15}
            tintColor="#ffffff"
            fallback={<Text className="text-ink">◍</Text>}
          />
          <Text numberOfLines={1} className="text-base text-ink">
            {venue ? venue.name : 'Velg spisested'}
          </Text>
          {venue && category ? (
            <Text className="text-xs text-muted">{category}</Text>
          ) : null}
        </Pressable>
      </View>

      <VenuePicker
        visible={picking}
        coordinates={coordinates}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          onChange(picked);
          setPicking(false);
        }}
      />
    </>
  );
}

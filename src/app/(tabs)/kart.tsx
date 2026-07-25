import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { AppleMaps } from 'expo-maps';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { fetchLocatedPosts, regionFor, type LocatedPost, type MapFilter } from '@/lib/map';

const FILTERS: { value: MapFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'mine', label: 'Mine' },
];

export default function MapScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;
  const [filter, setFilter] = useState<MapFilter>('all');
  const [posts, setPosts] = useState<LocatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LocatedPost | null>(null);

  const load = useCallback(async () => {
    try {
      setPosts(await fetchLocatedPosts(filter, selfId));
    } catch {
      // Leave whatever is on screen; the map is not worth an error state of
      // its own when the feed will already have surfaced a connection problem.
    } finally {
      setLoading(false);
    }
  }, [filter, selfId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const region = useMemo(() => regionFor(posts), [posts]);

  const markers = useMemo(
    () =>
      posts.map((post) => ({
        id: post.id,
        coordinates: { latitude: post.latitude, longitude: post.longitude },
        title: post.title ?? post.location ?? 'Øyeblikk',
        tintColor: '#ffffff',
      })),
    [posts]
  );

  // expo-maps has no map on the simulator and no Apple Maps on Android.
  if (Platform.OS !== 'ios') {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-8">
        <Text className="text-center text-base text-muted">
          Kartet er foreløpig bare tilgjengelig på iPhone.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {region ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={{
            coordinates: { latitude: region.latitude, longitude: region.longitude },
            zoom: zoomFor(region.latitudeDelta),
          }}
          markers={markers}
          uiSettings={{ compassEnabled: false, scaleBarEnabled: false }}
          properties={{ isMyLocationEnabled: true }}
          onMarkerClick={(marker) => {
            const match = posts.find((post) => post.id === marker.id);
            setSelected(match ?? null);
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text className="text-base text-ink">
                {filter === 'mine' ? 'Ingen av dine øyeblikk her' : 'Ingen øyeblikk på kartet'}
              </Text>
              <Text className="text-center text-sm text-muted">
                Bilder tatt med stedstjenester på dukker opp her.
              </Text>
            </>
          )}
        </View>
      )}

      <Screen className="absolute inset-0" edges={['top', 'bottom']} pointerEvents="box-none">
        <View className="flex-row items-start justify-between px-5 pt-2" pointerEvents="box-none">
          <View pointerEvents="none">
            <Text className="text-3xl text-ink">Kart</Text>
            {posts.length > 0 ? (
              <Text className="text-sm text-muted">{posts.length} øyeblikk</Text>
            ) : null}
          </View>

          <View className="flex-row items-center gap-1 rounded-full bg-overlay p-1">
            {FILTERS.map((option) => {
              const active = option.value === filter;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    if (active) return;
                    void Haptics.selectionAsync();
                    // Clear the card: the selected pin may not survive the
                    // filter change, and a card for a hidden pin is confusing.
                    setSelected(null);
                    setFilter(option.value);
                  }}
                  className={`h-9 items-center justify-center rounded-full px-4 ${
                    active ? 'bg-ink' : ''
                  }`}>
                  <Text className={`text-sm ${active ? 'text-canvas' : 'text-ink opacity-80'}`}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="flex-1" pointerEvents="none" />

        {selected ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/album/${selected.albumId}`)}
            className="mx-5 mb-28 flex-row items-center gap-3 rounded-tile bg-surface p-3 active:opacity-80">
            {selected.imageUrl ? (
              <Image
                source={{ uri: selected.imageUrl }}
                placeholder={selected.blurhash ? { blurhash: selected.blurhash } : undefined}
                style={{ width: 56, height: 74, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : null}
            <View className="flex-1">
              <Text numberOfLines={1} className="text-base text-ink">
                {selected.title ?? 'Uten tittel'}
              </Text>
              {selected.location ? (
                <Text numberOfLines={1} className="text-sm text-muted">
                  {selected.location}
                </Text>
              ) : null}
              <Text className="mt-0.5 text-xs text-muted">Trykk for å åpne albumet</Text>
            </View>
          </Pressable>
        ) : null}
      </Screen>
    </View>
  );
}

/**
 * Convert a latitude span to a zoom level.
 *
 * Apple Maps takes a zoom level rather than a region, and the two are related
 * logarithmically: each level halves the visible span. 360 degrees is zoom 0.
 */
function zoomFor(latitudeDelta: number): number {
  const zoom = Math.log2(360 / Math.max(latitudeDelta, 0.001));
  return Math.min(Math.max(zoom, 1), 18);
}

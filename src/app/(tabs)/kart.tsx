import { Image } from 'expo-image';
import { AppleMaps } from 'expo-maps';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, withTiming } from 'react-native-reanimated';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { fetchLocatedPosts, regionFor, type LocatedPost, type MapFilter } from '@/lib/map';
import { PinFactory } from '@/components/pin-factory';
import type { ImageRef } from 'expo-image';

const FILTERS: { value: MapFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'mine', label: 'Mine' },
];

/**
 * The preview card rising into place under the pin that was tapped.
 *
 * Written out rather than using FadeInDown so the curve is explicit: a plain
 * timing ease-out, no spring. The card carries a photo and two lines of text,
 * and overshoot on a block that size is distracting rather than lively.
 */
function cardEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 28 }, { scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }),
      transform: [
        { translateY: withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }) },
        { scale: withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }) },
      ],
    },
  };
}

/** Quicker on the way out — a dismissal that lingers reads as unresponsive. */
function cardExit() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 140, easing: Easing.in(Easing.cubic) }),
      transform: [
        { translateY: withTiming(20, { duration: 160, easing: Easing.in(Easing.cubic) }) },
        { scale: withTiming(0.97, { duration: 160, easing: Easing.in(Easing.cubic) }) },
      ],
    },
  };
}

export default function MapScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;
  const [filter, setFilter] = useState<MapFilter>('all');
  const [posts, setPosts] = useState<LocatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LocatedPost | null>(null);
  const [icons, setIcons] = useState<Map<string, ImageRef>>(new Map());

  const load = useCallback(async () => {
    try {
      // Pins are placed immediately with a fallback glyph; PinFactory renders
      // and captures the photo versions in the background and swaps them in.
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


  /**
   * Annotations rather than markers, because only annotations take a custom
   * icon — a marker is limited to an SF Symbol or a monogram.
   *
   * Posts whose thumbnail has not loaded, or that fall past the photo cap,
   * still get an annotation; they simply show the camera glyph instead.
   */
  const annotations = useMemo(
    () =>
      posts.map((post) => {
        const icon = icons.get(post.id);
        return {
          id: post.id,
          coordinates: { latitude: post.latitude, longitude: post.longitude },
          title: post.title ?? post.location ?? 'Øyeblikk',
          backgroundColor: '#000000',
          tintColor: '#ffffff',
          ...(icon ? { icon } : { systemImage: 'camera.fill' }),
        };
      }),
    [icons, posts]
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
      <PinFactory posts={posts} onReady={setIcons} />

      {region ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={{
            coordinates: { latitude: region.latitude, longitude: region.longitude },
            zoom: zoomFor(region),
          }}
          annotations={annotations}
          uiSettings={{ compassEnabled: false, scaleBarEnabled: false }}
          properties={{ isMyLocationEnabled: true }}
          onMarkerClick={(marker) => {
            const match = posts.find((post) => post.id === marker.id);
            setSelected(match ?? null);
          }}
          onAnnotationClick={(annotation) => {
            const match = posts.find((post) => post.id === annotation.id);
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
        {/*
          Stacked, not side by side. Beside the title the filter sat over the
          top-right corner of the map, which is where Apple puts the locate
          button — so the control the user needed was underneath ours.
        */}
        <View className="items-start gap-3 px-5 pt-2" pointerEvents="box-none">
          <View pointerEvents="none">
            <Text className="text-3xl text-ink">Kart</Text>
            {posts.length > 0 ? (
              <Text className="text-sm text-muted">{posts.length} øyeblikk</Text>
            ) : null}
          </View>

          <Segmented
            options={FILTERS}
            value={filter}
            onChange={(next) => {
              // Clear the card: the selected pin may not survive the filter
              // change, and a card for a hidden pin is confusing.
              setSelected(null);
              setFilter(next);
            }}
          />
        </View>

        <View className="flex-1" pointerEvents="none" />

        {selected ? (
          <Animated.View
            // Keyed on the post so tapping a second pin replays the entry
            // rather than silently swapping the contents of a card that is
            // already sitting there.
            key={selected.id}
            entering={cardEnter}
            exiting={cardExit}
            className="mx-5 mb-16">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/album/${selected.albumId}`)}
              className="flex-row items-center gap-3 rounded-tile bg-surface p-3 active:opacity-80">
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
          </Animated.View>
        ) : null}
      </Screen>
    </View>
  );
}

/**
 * Points spanned by the whole world at zoom 0.
 *
 * Not the textbook 256. Apple's zoom levels do not line up with the Web
 * Mercator tile convention, so this is measured rather than assumed: pinning
 * the camera to zoom 6 over Iceland showed roughly 14 degrees of longitude
 * across a 393pt screen, which puts the world at about 160pt at zoom 0.
 */
const WORLD_SIZE = 160;

/** Title and filter at the top, tab bar at the bottom, in points. */
const CHROME_HEIGHT = 190;

/**
 * Vertical Mercator position of a latitude, as a fraction of the world from
 * the top.
 *
 * Latitude is not linear on a map: the projection stretches ground distance
 * increasingly towards the poles, so ten degrees near Iceland occupies far
 * more screen than ten degrees near the equator. Comparing raw degrees would
 * over-zoom on high-latitude spans, which is exactly where this app's photos
 * are.
 */
function mercatorY(latitude: number): number {
  const clamped = Math.min(Math.max(latitude, -85.05), 85.05);
  const radians = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

/**
 * The zoom level at which a region fits on screen.
 *
 * Apple Maps takes a zoom level, not a region, so the fit has to be solved
 * rather than handed over. Each level doubles the size of the world in points,
 * so the largest zoom that keeps the span inside the viewport is a logarithm.
 *
 * Both axes are solved separately and the tighter one wins — fitting only one
 * pushes the other off screen, which is what happened with photos in Iceland
 * and California: a modest latitude span next to a third of the planet in
 * longitude. The usable height excludes the chrome, since a pin behind the
 * header is as invisible as one past the edge.
 */
function zoomFor(region: { latitudeDelta: number; longitudeDelta: number; latitude: number }): number {
  const { width, height } = Dimensions.get('window');
  const usableHeight = Math.max(height - CHROME_HEIGHT, 120);

  const longitudeFraction = Math.max(region.longitudeDelta, 0.001) / 360;
  const north = region.latitude + region.latitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const latitudeFraction = Math.max(Math.abs(mercatorY(north) - mercatorY(south)), 0.000001);

  const horizontal = Math.log2(width / (WORLD_SIZE * longitudeFraction));
  const vertical = Math.log2(usableHeight / (WORLD_SIZE * latitudeFraction));

  return Math.min(Math.max(Math.min(horizontal, vertical), 1), 17);
}

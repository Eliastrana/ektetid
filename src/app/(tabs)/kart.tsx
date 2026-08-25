import { Image } from 'expo-image';
import { AppleMaps } from 'expo-maps';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, withTiming } from 'react-native-reanimated';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import {
  clusterPosts,
  expandSmallClusters,
  fetchLocatedPosts,
  hydrateLocatedPostImages,
  postsInView,
  regionFor,
  type LocatedPost,
  type MapFilter,
  type MapRegion,
} from '@/lib/map';
import { countIconId, PinFactory } from '@/components/pin-factory';
import type { ImageRef } from 'expo-image';

const FILTERS: { value: MapFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'mine', label: 'Mine' },
];

/** Keep the previous map ready while a fresh query revalidates on focus. */
const mapCache = new Map<string, LocatedPost[]>();

function mapCacheKey(filter: MapFilter, selfId?: string): string {
  return `${selfId ?? 'anonymous'}:${filter}`;
}

/** Preserve already-signed thumbnail URLs across a background refresh. */
function mergeCachedImages(fresh: LocatedPost[], cached: LocatedPost[] | undefined): LocatedPost[] {
  if (!cached?.length) return fresh;

  const urlsByPath = new Map<string, string>();
  for (const post of cached) {
    if (post.imageUrl) urlsByPath.set(post.imagePath, post.imageUrl);
  }

  return fresh.map((post) => ({
    ...post,
    imageUrl: urlsByPath.get(post.imagePath) ?? null,
  }));
}

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

/**
 * Span below which zooming no longer separates a cluster. `regionFor` floors
 * its own result at MIN_DELTA, so anything at or under that is as tight as the
 * camera will go.
 */
const MIN_CLUSTER_SPAN = 0.02;

export default function MapScreen() {
  const router = useRouter();
  const viewport = useWindowDimensions();
  const { session } = useAuth();
  const selfId = session?.user.id;
  const [filter, setFilter] = useState<MapFilter>('all');
  const [posts, setPosts] = useState<LocatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [icons, setIcons] = useState<Map<string, ImageRef>>(new Map());
  /** Where the camera actually is, once the user has moved it. */
  const [camera, setCamera] = useState<MapRegion | null>(null);
  /**
   * Where the app wants the camera. Kept apart from `camera`: driving the
   * position prop from the observed position feeds moves back into the map
   * and fights the gesture.
   */
  const [target, setTarget] = useState<MapRegion | null>(null);
  const loadToken = useRef(0);
  const cameraSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Thumbnail paths already asked for, so a failed signing is not retried forever. */
  const attemptedPaths = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const token = ++loadToken.current;
    attemptedPaths.current = new Set();
    const cacheKey = mapCacheKey(filter, selfId);
    const cached = mapCache.get(cacheKey);

    if (cached) {
      setPosts(cached);
      setLoading(false);
    } else {
      setPosts([]);
      setLoading(true);
    }

    try {
      // Pins are placed immediately with a fallback glyph; PinFactory renders
      // and captures the photo versions in the background and swaps them in.
      const located = await fetchLocatedPosts(filter, selfId);
      if (token !== loadToken.current) return;
      const immediate = mergeCachedImages(located, cached);
      mapCache.set(cacheKey, immediate);
      setPosts(immediate);
      setLoading(false);
      // Coordinates and fallback pins are interactive now. Photo icons replace
      // them progressively once the signed thumbnail URLs arrive.
      const opening = regionFor(immediate);
      const firstWanted = opening
        ? expandSmallClusters(clusterPosts(postsInView(immediate, opening), opening))
            .filter((cluster) => cluster.posts.length === 1)
            .map((cluster) => cluster.posts[0])
        : [];
      void hydrateLocatedPostImages(immediate, firstWanted)
        .then((hydrated) => {
          if (token !== loadToken.current) return;
          mapCache.set(cacheKey, hydrated);
          setPosts(hydrated);
        })
        .catch(() => {});
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
      return () => {
        loadToken.current += 1;
      };
    }, [load])
  );

  const region = useMemo(() => regionFor(posts), [posts]);

  /**
   * What the camera is looking at: its live position once moved, otherwise the
   * opening fit. Clustering keys off this, so bubbles regroup as it changes.
   */
  const view = camera ?? region;

  /**
   * Grid clusters for the current span. Only posts near the camera take part,
   * so a country's worth of pins off screen costs nothing.
   */
  const clusters = useMemo(
    () =>
      view ? expandSmallClusters(clusterPosts(postsInView(posts, view), view)) : [],
    [posts, view]
  );

  /** Cells holding one post: these get a photo. */
  const singles = useMemo(
    () => clusters.filter((cluster) => cluster.posts.length === 1).map((c) => c.posts[0]),
    [clusters]
  );

  /** Cells holding several: these get a count. */
  const groups = useMemo(
    () => clusters.filter((cluster) => cluster.posts.length > 1),
    [clusters]
  );

  /**
   * The distinct sizes on screen. Every cluster of four is the same drawing, so
   * the factory captures one and all four-post bubbles share it.
   */
  const counts = useMemo(
    () => [...new Set(groups.map((cluster) => cluster.posts.length))],
    [groups]
  );

  // Sign thumbnails for what is on screen now. Panning somewhere new fetches
  // that place's photos rather than leaving them as fallback glyphs forever.
  //
  // Paths are remembered whether or not they resolved. A post whose signing
  // fails keeps a null imageUrl, so asking "is anything still unsigned?" would
  // stay true forever — and since each pass hands back a fresh array, the
  // effect would re-run on its own output and retry that path without end.
  useEffect(() => {
    const pending = singles.filter(
      (post) => !post.imageUrl && !attemptedPaths.current.has(post.imagePath)
    );
    if (pending.length === 0) return;

    for (const post of pending) attemptedPaths.current.add(post.imagePath);

    const token = loadToken.current;
    void hydrateLocatedPostImages(posts, pending)
      .then((hydrated) => {
        if (token !== loadToken.current) return;
        mapCache.set(mapCacheKey(filter, selfId), hydrated);
        setPosts(hydrated);
      })
      .catch(() => {});
  }, [filter, posts, selfId, singles]);

  /**
   * Camera moves arrive continuously while panning. Clustering every frame
   * would rebuild the annotation list mid-gesture, so the region is taken once
   * the movement settles.
   */
  const onCameraMove = useCallback((event: {
    coordinates?: { latitude?: number; longitude?: number };
    latitudeDelta?: number;
    longitudeDelta?: number;
  }) => {
    const { latitude, longitude } = event.coordinates ?? {};
    const { latitudeDelta, longitudeDelta } = event;
    if (
      latitude == null ||
      longitude == null ||
      latitudeDelta == null ||
      longitudeDelta == null
    ) {
      return;
    }

    if (cameraSettle.current) clearTimeout(cameraSettle.current);
    cameraSettle.current = setTimeout(() => {
      cameraSettle.current = null;
      setCamera({ latitude, longitude, latitudeDelta, longitudeDelta });
    }, 220);
  }, []);

  useEffect(
    () => () => {
      if (cameraSettle.current) clearTimeout(cameraSettle.current);
    },
    []
  );

  /**
   * Dive into a bubble: tighten the camera onto its members so the grid splits
   * them on the next pass.
   *
   * Posts stacked on one spot never separate however far the camera goes, so
   * once the span is small enough that zooming has stopped helping, the tap
   * opens the newest of them instead of leaving a bubble that does nothing.
   */
  const openCluster = useCallback(
    (id: string) => {
      const cluster = groups.find((candidate) => candidate.id === id);
      if (!cluster) return;

      const next = regionFor(cluster.posts);
      if (!next) return;

      const tight = next.latitudeDelta <= MIN_CLUSTER_SPAN;
      if (tight) {
        setSelectedId(cluster.posts[0].id);
        return;
      }
      setTarget(next);
    },
    [groups]
  );
  const selected = useMemo(
    () => (selectedId ? (posts.find((post) => post.id === selectedId) ?? null) : null),
    [posts, selectedId]
  );

  /**
   * Photo-backed annotations. Expo Maps annotations are the Apple Maps API
   * that accepts a decoded custom ImageRef.
   */
  const annotations = useMemo(
    () => [
      // A cell holding several posts is drawn as its count. Annotations take
      // text and a background directly, so a bubble needs no captured image —
      // which is also why zooming out stays cheap however dense the map gets.
      ...groups.flatMap((cluster) => {
        const icon = icons.get(countIconId(cluster.posts.length));
        if (!icon) return [];

        return [
          {
            id: `cluster:${cluster.id}`,
            coordinates: { latitude: cluster.latitude, longitude: cluster.longitude },
            title: `${cluster.posts.length} øyeblikk`,
            icon,
          },
        ];
      }),
      ...singles.flatMap((post) => {
        const icon = icons.get(post.id);
        if (!icon) return [];

        return [
          {
            id: post.id,
            coordinates: { latitude: post.latitude, longitude: post.longitude },
            title: post.title ?? post.location ?? 'Øyeblikk',
            icon,
          },
        ];
      }),
    ],
    [groups, icons, singles]
  );

  /**
   * Expo Maps gives system-image styling to native markers, while annotations
   * are the custom-image API. Keeping the two paths separate avoids the thin
   * black annotation artifacts that appeared before a photo icon was ready.
   */
  const markers = useMemo(
    () => [
      ...groups.flatMap((cluster) => {
        if (icons.has(countIconId(cluster.posts.length))) return [];

        return [
          {
            id: `cluster:${cluster.id}`,
            coordinates: { latitude: cluster.latitude, longitude: cluster.longitude },
            title: `${cluster.posts.length} øyeblikk`,
            systemImage: 'photo.on.rectangle.angled',
            tintColor: '#111111',
          },
        ];
      }),
      ...singles.flatMap((post) => {
        if (icons.has(post.id)) return [];

        return [
          {
            id: post.id,
            coordinates: { latitude: post.latitude, longitude: post.longitude },
            title: post.title ?? post.location ?? 'Øyeblikk',
            systemImage: 'camera.fill',
            tintColor: '#111111',
          },
        ];
      }),
    ],
    [groups, icons, singles]
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
      <PinFactory posts={singles} counts={counts} onReady={setIcons} />

      {region ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={{
            coordinates: {
              latitude: (target ?? region).latitude,
              longitude: (target ?? region).longitude,
            },
            zoom: zoomFor(target ?? region, viewport),
          }}
          annotations={annotations}
          markers={markers}
          onCameraMove={onCameraMove}
          uiSettings={{ compassEnabled: false, scaleBarEnabled: false }}
          properties={{ isMyLocationEnabled: true }}
          onMarkerClick={(marker) => {
            // Clusters appear here too while their numbered pin is still being
            // captured, and must zoom rather than select a post that is not one.
            const id = marker.id ?? null;
            if (id?.startsWith('cluster:')) {
              openCluster(id.slice('cluster:'.length));
              return;
            }
            setSelectedId(id);
          }}
          onAnnotationClick={(annotation) => {
            const id = annotation.id ?? null;
            if (id?.startsWith('cluster:')) {
              openCluster(id.slice('cluster:'.length));
              return;
            }
            setSelectedId(id);
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
              setSelectedId(null);
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
              onPress={() =>
                router.push({
                  pathname: '/album/[id]',
                  params: {
                    id: selected.albumId,
                    // The album opens on the pin that was tapped. Without this
                    // it started at the album's first post, so choosing a place
                    // on the map showed a different one.
                    post: selected.id,
                    ...(selected.imageUrl ? { cover: selected.imageUrl } : {}),
                    ...(selected.blurhash ? { cb: selected.blurhash } : {}),
                  },
                })
              }
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
function zoomFor(
  region: { latitudeDelta: number; longitudeDelta: number; latitude: number },
  viewport: { width: number; height: number }
): number {
  const { width, height } = viewport;
  const usableHeight = Math.max(height - CHROME_HEIGHT, 120);

  const longitudeFraction = Math.max(region.longitudeDelta, 0.001) / 360;
  const north = region.latitude + region.latitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const latitudeFraction = Math.max(Math.abs(mercatorY(north) - mercatorY(south)), 0.000001);

  const horizontal = Math.log2(width / (WORLD_SIZE * longitudeFraction));
  const vertical = Math.log2(usableHeight / (WORLD_SIZE * latitudeFraction));

  return Math.min(Math.max(Math.min(horizontal, vertical), 1), 17);
}

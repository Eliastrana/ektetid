import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from '@/components/auth-provider';
import { CommentSheet } from '@/components/comment-sheet';
import { ReportSheet } from '@/components/report-sheet';
import { PostTile } from '@/components/post-tile';
import { Scrim } from '@/components/scrim';
import { Screen } from '@/components/screen';
import { StoryProgress } from '@/components/story-progress';
import { fetchAlbum, markAlbumRead, type AlbumDetail } from '@/lib/album';
import { decodeOrigin } from '@/lib/origin';
import type { ReportTarget } from '@/lib/moderation';
import { fetchLikes, toggleLike, type LikeState } from '@/lib/social';

/** Idle time before the chrome fades away, matching the original's 5s. */
const CHROME_TIMEOUT_MS = 5000;

/** Fraction of screen width a drag must cover to commit to the next post. */
const COMMIT_RATIO = 0.28;

/** Velocity that commits regardless of distance. */
const COMMIT_VELOCITY = 550;

/** Downward drag that commits to dismissing. */
const DISMISS_DISTANCE = 110;

/** How long the album takes to grow out of, or shrink back into, its card. */
const GENIE_MS = 300;

/** Kept from the original: nudging back past the first post gets an eye-roll. */
const BOUNCE_EMOJI = ['😬👉️', '😩👉️', '🙄👉', '😵👉'];

export default function AlbumScreen() {
  const params = useLocalSearchParams<{
    id: string;
    ox?: string;
    oy?: string;
    ow?: string;
    oh?: string;
  }>();
  const { id } = params;
  const router = useRouter();
  const { session } = useAuth();
  const { width } = Dimensions.get('window');

  /*
   * Grow out of the card that was tapped.
   *
   * transformOrigin is set to the card's centre and the whole screen scales up
   * from the card's proportion of the screen, so the album appears to be the
   * card enlarging rather than a new screen sliding in. Without an origin —
   * opened from a deep link, say — it falls back to a plain fade.
   */
  // Memoised on the primitives, not on `params`: useLocalSearchParams returns a
  // fresh object every render, so depending on it produced a new `origin` each
  // time and restarted the entry animation on every re-render.
  const { ox, oy, ow, oh } = params;
  const origin = useMemo(() => decodeOrigin({ ox, oy, ow, oh }), [ox, oy, ow, oh]);
  const genie = useSharedValue(origin ? 0 : 1);
  /**
   * How far through a dismiss drag we are, 0 to 1.
   *
   * Kept separate from `genie` so the drag can shrink and dim the album live —
   * the close reads as already happening under your finger, rather than
   * nothing until you let go.
   */
  const dragProgress = useSharedValue(0);

  const genieStyle = useAnimatedStyle(() => {
    const dragScale = 1 - 0.18 * dragProgress.value;
    const dragFade = 1 - 0.4 * dragProgress.value;
    if (!origin) {
      return { opacity: genie.value * dragFade, transform: [{ scale: dragScale }] };
    }
    const startScale = origin.width / width;
    const openScale = startScale + (1 - startScale) * genie.value;
    return {
      opacity: (0.4 + 0.6 * genie.value) * dragFade,
      transform: [{ scale: openScale * dragScale }],
    };
  });

  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [bounce, setBounce] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likes, setLikes] = useState<LikeState>({ count: 0, likedByMe: false });
  const [showComments, setShowComments] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const chrome = useSharedValue(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const posts = useMemo(() => album?.posts ?? [], [album]);
  const current = posts[index];

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    if (!id) return;
    let active = true;

    // The request starts immediately, but the state lands after the opening
    // animation. Applying it mid-flight mounts the full-screen image, the
    // progress bar and the tile all at once, and that render is long enough to
    // drop frames in the middle of the transition.
    void fetchAlbum(id)
      .then((detail) => {
        if (!active) return;
        InteractionManager.runAfterInteractions(() => {
          if (!active) return;
          setAlbum(detail);
          // Resume where the user left off, as the original did via localStorage.
          setIndex(
            Math.min(Math.max(detail.lastSeenPosition, 0), Math.max(detail.posts.length - 1, 0))
          );
        });
      })
      .catch(() => {
        if (active) setError('Klarte ikke å åpne albumet.');
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!origin) return;
    genie.value = withTiming(1, { duration: GENIE_MS, easing: Easing.out(Easing.cubic) });
  }, [genie, origin]);

  // Preload the neighbours so advancing feels instant.
  useEffect(() => {
    const urls = [posts[index + 1]?.imageUrl, posts[index + 2]?.imageUrl].filter(
      (url): url is string => !!url
    );
    if (urls.length) void Image.prefetch(urls);
  }, [index, posts]);

  // Persist read position as it advances.
  useEffect(() => {
    if (!album || !session || posts.length === 0) return;
    void markAlbumRead(session.user.id, album.id, index);
  }, [album, index, posts.length, session]);

  // Load the like state for whichever post is showing.
  useEffect(() => {
    const postId = posts[index]?.id;
    if (!postId || !session) return;
    let active = true;
    setLikes({ count: 0, likedByMe: false });
    void fetchLikes(postId, session.user.id)
      .then((state) => active && setLikes(state))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [index, posts, session]);

  const onToggleLike = useCallback(async () => {
    const postId = posts[index]?.id;
    if (!postId || !session) return;

    // Optimistic: the heart should respond instantly, not after a round-trip.
    const previous = likes;
    setLikes({
      count: previous.count + (previous.likedByMe ? -1 : 1),
      likedByMe: !previous.likedByMe,
    });
    void Haptics.impactAsync(
      previous.likedByMe ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );

    try {
      await toggleLike(postId, session.user.id, previous.likedByMe);
    } catch {
      setLikes(previous);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [index, likes, posts, session]);

  // ----------------------------------------------------------------- chrome

  const revealChrome = useCallback(() => {
    chrome.value = withTiming(1, { duration: 150 });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      chrome.value = withTiming(0, { duration: 400 });
    }, CHROME_TIMEOUT_MS);
  }, [chrome]);

  useEffect(() => {
    revealChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [index, revealChrome]);

  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  // -------------------------------------------------------------- navigation

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;

      if (next < 0) {
        setBounce(BOUNCE_EMOJI[Math.floor(Math.random() * BOUNCE_EMOJI.length)]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => setBounce(null), 900);
        return;
      }
      if (next >= posts.length) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setExpanded(false);
      setIndex(next);
      revealChrome();
    },
    [index, posts.length, revealChrome]
  );

  const settle = useCallback(
    (delta: number) => {
      translateX.value = withSpring(0, { damping: 22, stiffness: 220 });
      if (delta !== 0) go(delta);
    },
    [go, translateX]
  );

  const dismiss = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    if (!origin) {
      router.back();
      return;
    }

    const exit = { duration: GENIE_MS - 40, easing: Easing.in(Easing.cubic) } as const;

    // Unwind the drag over the same interval as the shrink. Left alone, the
    // drag's own scale and offset would still be applied at the end, so the
    // album would land smaller than the card and below it.
    dragProgress.value = withTiming(0, exit);
    translateY.value = withTiming(0, exit);

    // Shrink back into the card first, then pop — popping first would cut the
    // animation off mid-flight.
    genie.value = withTiming(0, exit, (finished) => {
      if (finished) runOnJS(router.back)();
    });
  }, [dragProgress, genie, origin, router, translateY]);

  const springBackY = useCallback(() => {
    translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
    dragProgress.value = withSpring(0, { damping: 22, stiffness: 220 });
  }, [dragProgress, translateY]);

  // --------------------------------------------------------------- gestures

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onUpdate((event) => {
          if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
            const down = Math.max(event.translationY, 0);
            translateY.value = down;
            // Shrink and dim from the very first pixel, so the album is
            // visibly on its way out while the finger is still down.
            dragProgress.value = Math.min(down / DISMISS_DISTANCE, 1);
          } else {
            translateX.value = event.translationX;
          }
        })
        .onEnd((event) => {
          // A quick flick counts even if it did not travel far — waiting for
          // the full distance makes a deliberate throw feel unresponsive.
          const flung = event.velocityY > 900 && translateY.value > 30;
          if (translateY.value > DISMISS_DISTANCE || flung) {
            runOnJS(dismiss)();
            return;
          }
          runOnJS(springBackY)();

          const far = Math.abs(event.translationX) > width * COMMIT_RATIO;
          const fast = Math.abs(event.velocityX) > COMMIT_VELOCITY;
          const delta = far || fast ? (event.translationX < 0 ? 1 : -1) : 0;
          runOnJS(settle)(delta);
        }),
    [dismiss, settle, springBackY, translateX, translateY, width]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((event) => {
        runOnJS(revealChrome)();
        runOnJS(go)(event.x < width / 2 ? -1 : 1);
      }),
    [go, revealChrome, width]
  );

  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const photoStyle = useAnimatedStyle(() => ({
    // Damped so the photo hints at the drag without fully leaving the screen.
    transform: [{ translateX: translateX.value * 0.4 }, { translateY: translateY.value }],
  }));

  // ------------------------------------------------------------------ render

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text className="text-center text-base text-muted">{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="text-base text-ink">Tilbake</Text>
        </Pressable>
      </View>
    );
  }

  if (!album) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text className="text-base text-ink">{album.title}</Text>
        <Text className="text-sm text-muted">Dette albumet er tomt.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="mt-2 text-base text-ink">Tilbake</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Animated.View
      className="flex-1 bg-canvas"
      style={[
        genieStyle,
        // Anchor the scale at the card's centre so the album appears to come
        // out of that spot rather than the middle of the screen.
        origin
          ? {
              transformOrigin: [
                origin.x + origin.width / 2,
                origin.y + origin.height / 2,
                0,
              ],
            }
          : null,
      ]}>
      <GestureDetector gesture={gesture}>
        <Animated.View className="flex-1" style={photoStyle}>
          {current?.imageUrl ? (
            <Image
              source={{ uri: current.imageUrl }}
              placeholder={current.blurhash ? { blurhash: current.blurhash } : undefined}
              recyclingKey={current.id}
              transition={180}
              contentFit="cover"
              style={{ flex: 1 }}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#ffffff" />
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      <Scrim height={0.45} />

      <Screen className="absolute inset-0" pointerEvents="box-none">
        <Animated.View style={chromeStyle} pointerEvents="box-none" className="px-4 pt-2">
          <StoryProgress count={posts.length} index={index} />
          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lukk album"
              onPress={dismiss}
              className="h-11 w-11 items-center justify-center rounded-full bg-overlay">
              <SymbolView
                name="xmark"
                size={17}
                tintColor="#ffffff"
                fallback={<Text className="text-lg text-ink">✕</Text>}
              />
            </Pressable>
            <View className="ml-3 flex-1">
              <Text numberOfLines={1} className="text-right text-base text-ink">
                {album.title}
              </Text>
              {album.description ? (
                <Text numberOfLines={1} className="text-right text-xs text-ink opacity-70">
                  {album.description}
                </Text>
              ) : null}
            </View>

            {album.canEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rediger album"
                onPress={() => router.push(`/rediger-album/${album.id}`)}
                hitSlop={8}
                className="ml-2 h-11 w-11 items-center justify-center rounded-full bg-overlay active:bg-overlay-strong">
                <SymbolView
                  name="slider.horizontal.3"
                  size={17}
                  tintColor="#ffffff"
                  fallback={<Text className="text-lg text-ink">⋯</Text>}
                />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        <View className="flex-1" pointerEvents="none" />

        {bounce ? (
          <View className="absolute left-6 top-1/2" pointerEvents="none">
            <Text className="text-6xl">{bounce}</Text>
          </View>
        ) : null}

        <View className="gap-3 px-4 pb-4" pointerEvents="box-none">
          <Animated.View
            style={chromeStyle}
            pointerEvents="box-none"
            className="flex-row justify-end gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={likes.likedByMe ? 'Fjern hjerte' : 'Gi hjerte'}
              onPress={onToggleLike}
              className="h-12 flex-row items-center gap-2 rounded-full px-2 active:opacity-60">
              <SymbolView
                name={likes.likedByMe ? 'heart.fill' : 'heart'}
                size={24}
                tintColor={likes.likedByMe ? '#ff3b30' : '#ffffff'}
                fallback={<Text className="text-xl">{likes.likedByMe ? '❤️' : '🤍'}</Text>}
              />
              {likes.count > 0 ? (
                <Text className="text-base text-ink">{likes.count}</Text>
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kommentarer"
              onPress={() => {
                void Haptics.selectionAsync();
                setShowComments(true);
              }}
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-60">
              <SymbolView
                name="bubble.left.fill"
                size={22}
                tintColor="#ffffff"
                fallback={<Text className="text-xl">💬</Text>}
              />
            </Pressable>

            {/* Reporting your own post is meaningless, so it is hidden there. */}
            {current && session && current.author_id !== session.user.id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rapporter innlegg"
                onPress={() => {
                  void Haptics.selectionAsync();
                  setReportTarget({
                    reportedUserId: current.author_id,
                    postId: current.id,
                  });
                }}
                className="h-12 w-12 items-center justify-center rounded-full active:opacity-60">
                <SymbolView
                  name="ellipsis"
                  size={22}
                  tintColor="#ffffff"
                  fallback={<Text className="text-xl text-ink">⋯</Text>}
                />
              </Pressable>
            ) : null}
          </Animated.View>

          {current ? (
            <PostTile
              post={current}
              showAuthor={album.isShared}
              expanded={expanded}
              onToggle={() => {
                void Haptics.selectionAsync();
                setExpanded((value) => !value);
                revealChrome();
              }}
            />
          ) : null}
        </View>
      </Screen>

      {session ? (
        <ReportSheet
          selfId={session.user.id}
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onDone={() => {
            setReportTarget(null);
            // A block revokes access to the whole album, so leaving is the
            // only sensible next state.
            router.back();
          }}
        />
      ) : null}

      {current && session ? (
        <CommentSheet
          postId={current.id}
          selfId={session.user.id}
          visible={showComments}
          onClose={() => setShowComments(false)}
        />
      ) : null}
    </Animated.View>
  );
}

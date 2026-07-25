import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from '@/components/auth-provider';
import { CommentSheet } from '@/components/comment-sheet';
import { PostTile } from '@/components/post-tile';
import { Screen } from '@/components/screen';
import { StoryProgress } from '@/components/story-progress';
import { fetchAlbum, markAlbumRead, type AlbumDetail } from '@/lib/album';
import { fetchLikes, toggleLike, type LikeState } from '@/lib/social';

/** Idle time before the chrome fades away, matching the original's 5s. */
const CHROME_TIMEOUT_MS = 5000;

/** Fraction of screen width a drag must cover to commit to the next post. */
const COMMIT_RATIO = 0.28;

/** Velocity that commits regardless of distance. */
const COMMIT_VELOCITY = 550;

/** Downward drag that dismisses the album. */
const DISMISS_DISTANCE = 140;

/** Kept from the original: nudging back past the first post gets an eye-roll. */
const BOUNCE_EMOJI = ['😬👉️', '😩👉️', '🙄👉', '😵👉'];

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { width } = Dimensions.get('window');

  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [bounce, setBounce] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likes, setLikes] = useState<LikeState>({ count: 0, likedByMe: false });
  const [showComments, setShowComments] = useState(false);

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
    void fetchAlbum(id)
      .then((detail) => {
        if (!active) return;
        setAlbum(detail);
        // Resume where the user left off, as the original did via localStorage.
        setIndex(
          Math.min(Math.max(detail.lastSeenPosition, 0), Math.max(detail.posts.length - 1, 0))
        );
      })
      .catch(() => {
        if (active) setError('Klarte ikke å åpne albumet.');
      });
    return () => {
      active = false;
    };
  }, [id]);

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
    router.back();
  }, [router]);

  const springBackY = useCallback(() => {
    translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
  }, [translateY]);

  // --------------------------------------------------------------- gestures

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onUpdate((event) => {
          if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
            translateY.value = Math.max(event.translationY, 0);
          } else {
            translateX.value = event.translationX;
          }
        })
        .onEnd((event) => {
          if (translateY.value > DISMISS_DISTANCE) {
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
    <View className="flex-1 bg-canvas">
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

      <Screen className="absolute inset-0" pointerEvents="box-none">
        <Animated.View style={chromeStyle} pointerEvents="box-none" className="px-4 pt-2">
          <StoryProgress count={posts.length} index={index} />
          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lukk album"
              onPress={dismiss}
              className="h-11 w-11 items-center justify-center rounded-full border border-glass-border bg-glass">
              <Text className="text-lg text-ink">✕</Text>
            </Pressable>
            <Text numberOfLines={1} className="ml-3 flex-1 text-right text-base text-ink">
              {album.title}
            </Text>
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
              className="h-14 flex-row items-center gap-2 rounded-full border border-glass-border bg-glass px-4 active:bg-glass-strong">
              <Text className="text-xl">{likes.likedByMe ? '❤️' : '🤍'}</Text>
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
              className="h-14 w-14 items-center justify-center rounded-full border border-glass-border bg-glass active:bg-glass-strong">
              <Text className="text-xl">💬</Text>
            </Pressable>
          </Animated.View>

          {current ? (
            <PostTile
              post={current}
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

      {current && session ? (
        <CommentSheet
          postId={current.id}
          selfId={session.user.id}
          visible={showComments}
          onClose={() => setShowComments(false)}
        />
      ) : null}
    </View>
  );
}

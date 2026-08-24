import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
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

import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth-provider';
import { CommentSheet } from '@/components/comment-sheet';
import { NativePostButton } from '@/components/native-post-button';
import { PeopleSheet } from '@/components/people-sheet';
import { ReportSheet } from '@/components/report-sheet';
import { imageSpecs, PostTile } from '@/components/post-tile';
import { PostVideo } from '@/components/post-video';
import { Scrim } from '@/components/scrim';
import { Screen } from '@/components/screen';
import { PostGridSheet } from '@/components/post-grid-sheet';
import { StoryProgress } from '@/components/story-progress';
import { fetchAlbum, markAlbumRead, type AlbumDetail } from '@/lib/album';
import { fetchNextAlbum, type NextAlbum } from '@/lib/feed';
import { decodeOrigin } from '@/lib/origin';
import type { ReportTarget } from '@/lib/moderation';
import {
  fetchLikes,
  hasPro,
  recordPostView,
  toggleLike,
  type LikeState,
} from '@/lib/social';

/** Idle time before the chrome fades away, matching the original's 5s. */
const CHROME_TIMEOUT_MS = 5000;

/** Fraction of screen width a drag must cover to commit to the next post. */
const COMMIT_RATIO = 0.28;

/** Velocity that commits regardless of distance. */
const COMMIT_VELOCITY = 550;

/** Downward drag that commits to dismissing. */
const DISMISS_DISTANCE = 82;

/** How long the album takes to grow out of, or shrink back into, its card. */
const GENIE_MS = 300;

/**
 * Drag distance that closes the album completely, in points.
 *
 * Held all the way down, the album ends up exactly the size and position of
 * the card it came from — the gesture runs the whole close, and releasing
 * only commits what is already on screen.
 */
const DRAG_FULL = 280;

/**
 * Shapes the drag so the close leads the finger.
 *
 * Below 1 the album gives up size quickly at the start and more slowly near
 * the end. Mapped linearly the first few pixels of a drag do almost nothing
 * visible, which is what made the close feel late.
 */
const DRAG_CURVE = 0.7;

/** How much of the finger's travel the album follows, as a fraction. */
const DRAG_FOLLOW = 0.4;

/** The card's corner radius — `--radius-tile` in global.css. */
const CARD_RADIUS = 12;

/** Kept from the original: nudging back past the first post gets an eye-roll. */
const BOUNCE_EMOJI = ['😬👉️', '😩👉️', '🙄👉', '😵👉'];

export default function AlbumScreen() {
  const params = useLocalSearchParams<{
    id: string;
    ox?: string;
    oy?: string;
    ow?: string;
    oh?: string;
    /** The card's cover photo, so the opening animation has something to show. */
    cover?: string;
    /** Its blurhash, for the case where the cover is not cached after all. */
    cb?: string;
    /** Open a particular post when coming from the vertical stream. */
    post?: string;
  }>();
  const { id } = params;
  const router = useRouter();
  const { session } = useAuth();
  const { width, height } = Dimensions.get('window');

  /*
   * Grow out of the card that was tapped, so the album reads as that card
   * enlarging rather than as a new screen arriving. Without an origin — opened
   * from a deep link, say — it falls back to a plain fade.
   */
  // Memoised on the primitives, not on `params`: useLocalSearchParams returns a
  // fresh object every render, so depending on it produced a new `origin` each
  // time and restarted the entry animation on every re-render.
  const { ox, oy, ow, oh } = params;
  const origin = useMemo(() => decodeOrigin({ ox, oy, ow, oh }), [ox, oy, ow, oh]);
  const genie = useSharedValue(origin ? 0 : 1);
  // Declared here rather than with the other state below: genieStyle reads
  // translateY, so it has to exist before that hook runs.
  /** Drives the burst that confirms a double-tap heart. */
  const burst = useSharedValue(0);
  /**
   * Show the whole frame instead of filling the screen.
   *
   * Photos are stored at their original aspect and displayed edge to edge, so
   * a portrait screen crops the sides off a landscape shot. Pinching out
   * reveals what the crop hid.
   */
  const [uncropped, setUncropped] = useState(false);
  /** Video sound, off until asked for. Reset whenever the post changes. */
  const [muted, setMuted] = useState(true);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const zoomScale = useSharedValue(1);
  const zoomStartScale = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  const zoomStartX = useSharedValue(0);
  const zoomStartY = useSharedValue(0);
  const chrome = useSharedValue(1);


  /*
   * Interpolate the album's rectangle between the card and the full screen.
   *
   * Both axes are scaled independently, and the whole thing is translated so
   * that at rest it sits exactly on top of the card. A single uniform scale
   * anchored at the card's centre — the obvious version — is wrong: the card
   * is 3:4 and the screen is far taller, so matching the width left the height
   * badly off, and the album started as a rectangle that was never the card.
   * That mismatch is what made the transition look approximate.
   *
   * Opacity reaches 1 within the first third rather than ramping across the
   * whole animation. It is there to cover the moment the overlay chrome
   * appears, not to cross-fade the screen — a window being un-minimised does
   * not fade, and dragging the fade out the full duration was most of why this
   * felt hazy instead of crisp.
   *
   * A dismiss drag feeds the same `genie`, so the album shrinks towards its
   * card under the finger. It used to slide the photo down at full finger
   * distance while separately dimming the screen, and only run the shrink on
   * release — two different animations for one gesture, which is why the drag
   * read as a translucent panel moving away rather than as the album closing.
   */
  const genieStyle = useAnimatedStyle(() => {
    if (!origin) {
      return {
        opacity: genie.value,
        transform: [{ translateY: translateY.value * DRAG_FOLLOW }],
      };
    }

    const t = genie.value;
    const scaleX = origin.width / width + (1 - origin.width / width) * t;
    const scaleY = origin.height / height + (1 - origin.height / height) * t;

    // Distance from the screen's centre to the card's, closing to zero as the
    // album opens. Listed before the scales so it is measured in unscaled
    // points, and the scaling then happens about the card's centre.
    const offsetX = (origin.x + origin.width / 2 - width / 2) * (1 - t);
    const offsetY = (origin.y + origin.height / 2 - height / 2) * (1 - t);

    return {
      opacity: Math.min(1, t * 3),
      /*
       * Match the card's corners as the album closes into them.
       *
       * Divided by the scale because the radius is drawn before the transform
       * is applied: at a third of full size an untouched 12pt corner renders
       * as 4pt, and the album would arrive at the card visibly squarer than
       * the card itself. The corners go elliptical, since the two axes scale
       * differently, but only while in flight.
       */
      borderRadius: (CARD_RADIUS * (1 - t)) / scaleX,
      transform: [
        { translateX: offsetX },
        /*
         * The finger's slide, fading out as the album reaches the card.
         *
         * Held to the end it would otherwise land the album a fixed distance
         * below its target — the offset above closes to zero, but this one
         * does not. Weighting it by `t` blends the two: the touch leads while
         * the album is still large, the card wins as it gets small.
         */
        { translateY: offsetY + translateY.value * DRAG_FOLLOW * t },
        { scaleX },
        { scaleY },
      ],
    };
  });

  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [bounce, setBounce] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likes, setLikes] = useState<LikeState>({ count: 0, likedByMe: false });
  const [showComments, setShowComments] = useState(false);
  const [peopleMode, setPeopleMode] = useState<'likes' | 'views' | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [nextAlbum, setNextAlbum] = useState<NextAlbum | null>(null);
  const [showGrid, setShowGrid] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const posts = useMemo(() => album?.posts ?? [], [album]);
  const current = posts[index];
  const currentSpecs = imageSpecs(current?.exif);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void hasPro(session.user.id)
      .then((value) => active && setIsPro(value))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session]);

  // Resolved while the reader is still on the first posts, so arriving at the
  // end never waits on a request.
  useEffect(() => {
    if (!album?.id) return;
    let active = true;
    void fetchNextAlbum(album.id)
      .then((value) => active && setNextAlbum(value))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [album?.id]);

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    if (!id) return;
    let active = true;
    let mountTimer: ReturnType<typeof setTimeout> | null = null;
    const openingStartedAt = Date.now();

    // The request starts immediately, but the state lands after the opening
    // animation. Applying it mid-flight mounts the full-screen image, the
    // progress bar and the tile all at once, and that render is long enough to
    // drop frames in the middle of the transition.
    void fetchAlbum(id)
      .then((detail) => {
        if (!active) return;
        const openingTimeLeft = origin
          ? Math.max(0, GENIE_MS - (Date.now() - openingStartedAt))
          : 0;
        mountTimer = setTimeout(() => {
          if (!active) return;
          setAlbum(detail);
          // Resume where the user left off, as the original did via localStorage.
          const requested = params.post
            ? detail.posts.findIndex((post) => post.id === params.post)
            : -1;
          setIndex(
            requested >= 0
              ? requested
              : Math.min(
                  Math.max(detail.lastSeenPosition, 0),
                  Math.max(detail.posts.length - 1, 0)
                )
          );
        }, openingTimeLeft);
      })
      .catch(() => {
        if (active) setError('Klarte ikke å åpne albumet.');
      });
    return () => {
      active = false;
      if (mountTimer) clearTimeout(mountTimer);
    };
  }, [id, origin, params.post]);

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

  // One upsert per displayed post. The database ignores the author's own
  // views and coalesces repeat visits, so this is safe across swipes and reopens.
  useEffect(() => {
    const postId = posts[index]?.id;
    if (!postId || !session) return;
    void recordPostView(postId).catch(() => {});
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

  /**
   * Hand over to the album that follows this one.
   *
   * `replace` rather than `push`: reading forward through albums would
   * otherwise stack every one visited, and the close button would walk back
   * through them one at a time instead of returning to the feed.
   */
  const openNextAlbum = useCallback(
    (target: NextAlbum) => {
      router.replace({
        pathname: '/album/[id]',
        params: {
          id: target.id,
          ...(target.coverUrl ? { cover: target.coverUrl } : {}),
          ...(target.coverBlurhash ? { cb: target.coverBlurhash } : {}),
        },
      });
    },
    [router]
  );

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
        // The end of the last album is still a wall; the end of any other is a
        // doorway. Sliding fully off to the left says the album is finished,
        // where the per-post spring would have said it merely resisted.
        if (nextAlbum) {
          const target = nextAlbum;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          translateX.value = withTiming(
            -width,
            { duration: 260, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) runOnJS(openNextAlbum)(target);
            }
          );
          return;
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setExpanded(false);
      zoomScale.value = withTiming(1, { duration: 160 });
      zoomX.value = withTiming(0, { duration: 160 });
      zoomY.value = withTiming(0, { duration: 160 });
      // Each post starts on its own terms: silent, and framed as shot.
      setMuted(true);
      setUncropped(false);
      setIndex(next);
      revealChrome();
    },
    [index, nextAlbum, openNextAlbum, posts.length, revealChrome, translateX, width, zoomScale, zoomX, zoomY]
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

    /*
     * inOut rather than in: a cubic ease-in creeps for its first third, and on
     * a dismiss that lag reads as the tap not registering.
     *
     * The duration covers however much of the close is left. A drag has
     * already shrunk the album most of the way, so spending the full time on
     * the remainder crawls — the gesture would finish fast under the finger
     * and then visibly slow down the moment it was released. Floored so a
     * drag taken right to the threshold still animates rather than blinking.
     */
    // Already dragged onto the card: there is nothing left to play.
    if (genie.value <= 0.02) {
      router.back();
      return;
    }

    const remaining = Math.max(genie.value, 0.35);
    const exit = {
      duration: (GENIE_MS - 20) * remaining,
      easing: Easing.inOut(Easing.cubic),
    } as const;

    // Unwind the finger's offset over the same interval as the shrink. Left
    // alone it would still be applied at the end, landing the album below the
    // card rather than on it.
    translateY.value = withTiming(0, exit);

    // Shrink back into the card first, then pop — popping first would cut the
    // animation off mid-flight.
    genie.value = withTiming(0, exit, (finished) => {
      if (finished) runOnJS(router.back)();
    });
  }, [genie, origin, router, translateY]);

  /** Cancelled drag: re-open, matching the curve the button uses. */
  const likeByDoubleTap = useCallback(() => {
    revealChrome();
    burst.value = 0;
    burst.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });

    if (likes.likedByMe) {
      // Already liked: confirm the gesture was seen, but change nothing.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    void onToggleLike();
  }, [burst, likes.likedByMe, onToggleLike, revealChrome]);

  const setUncroppedWithFeedback = useCallback((next: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    setUncropped(next);
  }, []);

  const burstStyle = useAnimatedStyle(() => {
    const t = burst.value;
    if (t === 0 || t === 1) return { opacity: 0, transform: [{ scale: 0 }] };
    return {
      // Grows quickly, holds, then fades — the shape of a stamp rather than a
      // fade in and out, which would read as something loading.
      opacity: t < 0.15 ? t / 0.15 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1,
      transform: [{ scale: 0.6 + Math.min(t / 0.3, 1) * 0.55 }],
    };
  });

  const springBackY = useCallback(() => {
    const back = { duration: 220, easing: Easing.out(Easing.cubic) } as const;
    translateY.value = withTiming(0, back);
    genie.value = withTiming(1, back);
  }, [genie, translateY]);

  // --------------------------------------------------------------- gestures

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        // Four points is enough to distinguish a drag without making the
        // album feel glued down for the first part of the movement.
        .activeOffsetX([-4, 4])
        .activeOffsetY([-4, 4])
        .onStart(() => {
          zoomStartX.value = zoomX.value;
          zoomStartY.value = zoomY.value;
        })
        .onUpdate((event) => {
          if (zoomScale.value > 1.01) {
            const maxX = (width * (zoomScale.value - 1)) / 2;
            const maxY = (height * (zoomScale.value - 1)) / 2;
            zoomX.value = Math.max(-maxX, Math.min(maxX, zoomStartX.value + event.translationX));
            zoomY.value = Math.max(-maxY, Math.min(maxY, zoomStartY.value + event.translationY));
            return;
          }
          if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
            const down = Math.max(event.translationY, 0);
            translateY.value = down;
            // Drive the close itself, from the very first pixel, so the album
            // is visibly shrinking back towards its card while the finger is
            // still down rather than waiting for the release. Held all the way
            // down this reaches the card exactly.
            genie.value = 1 - Math.pow(Math.min(down / DRAG_FULL, 1), DRAG_CURVE);
          } else {
            translateX.value = event.translationX;
          }
        })
        .onEnd((event) => {
          if (zoomScale.value > 1.01) return;
          // A quick flick counts even if it did not travel far — waiting for
          // the full distance makes a deliberate throw feel unresponsive.
          const flung = event.velocityY > 650 && translateY.value > 12;
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
    [
      dismiss,
      genie,
      height,
      settle,
      springBackY,
      translateX,
      translateY,
      width,
      zoomScale,
      zoomStartX,
      zoomStartY,
      zoomX,
      zoomY,
    ]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          zoomStartScale.value = zoomScale.value;
        })
        .onUpdate((event) => {
          zoomScale.value = Math.max(1, Math.min(4, zoomStartScale.value * event.scale));
        })
        .onEnd(() => {
          if (zoomScale.value < 1.08) {
            zoomScale.value = withSpring(1, { damping: 20, stiffness: 220 });
            zoomX.value = withSpring(0, { damping: 20, stiffness: 220 });
            zoomY.value = withSpring(0, { damping: 20, stiffness: 220 });
          }
        }),
    [zoomScale, zoomStartScale, zoomX, zoomY]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        // Waits for a possible second tap before advancing. Without this the
        // first tap of a double-tap would already have changed the photo, and
        // the heart would land on the wrong one.
        .numberOfTaps(1)
        .onEnd((event) => {
          runOnJS(revealChrome)();
          runOnJS(go)(event.x < width / 2 ? -1 : 1);
        }),
    [go, revealChrome, width]
  );

  /**
   * Double-tap to like, the way every photo app has taught people to.
   *
   * Only ever adds a like — never removes one. Undoing by accident is much
   * worse than failing to undo, and the heart button is right there for that.
   */
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(300)
        .onEnd(() => {
          runOnJS(likeByDoubleTap)();
        }),
    [likeByDoubleTap]
  );


  // Double-tap has to be offered before the single tap, or the single always
  // claims the first touch. Pinch runs alongside, since it cannot be confused
  // with either.
  const gesture = useMemo(
    // Pan gets first refusal as soon as movement begins. Giving double-tap
    // priority made the close gesture wait for the tap recognizer to fail.
    () => Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, doubleTap, tap)),
    [doubleTap, pan, pinch, tap]
  );

  const photoStyle = useAnimatedStyle(() => ({
    // Horizontal only. A downward drag now moves the whole album via genieStyle,
    // and sliding the photo inside it as well made the two come apart.
    transform: [
      { translateX: translateX.value * 0.4 + zoomX.value },
      { translateY: zoomY.value },
      { scale: zoomScale.value },
    ],
  }));

  // ------------------------------------------------------------------ render

  /*
   * Every state renders inside the animated shell, never instead of it.
   *
   * These used to be early returns above the transition. Because the album is
   * deliberately not applied until the opening animation has finished, that
   * meant the whole open played on the loading branch — a plain, untransformed
   * black screen — and the real album appeared afterwards at full size. The
   * animation was running the entire time on a tree that was not on screen.
   */
  const shell = (children: React.ReactNode) => (
    <Animated.View
      // overflow-hidden so the animated corner radius actually clips the photo
      // filling the shell. The comment and report sheets are Modals, so they
      // are portalled out and stay unclipped.
      className="flex-1 overflow-hidden bg-canvas"
      // No transformOrigin: the translate in genieStyle puts the album over the
      // card itself, so scaling about the default centre is already scaling
      // about the card's centre.
      style={genieStyle}>
      {children}
    </Animated.View>
  );

  if (error) {
    return shell(
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-center text-base text-muted">{error}</Text>
        <NativePostButton
          label="Tilbake"
          displayLabel="Tilbake"
          appearance="glass"
          size={96}
          onPress={dismiss}
        />
      </View>
    );
  }

  if (!album) {
    /*
     * The card's own cover, carried through the route.
     *
     * The album is deliberately not applied until the opening animation has
     * finished, so without this the shell grows as an empty black rectangle
     * and the photo only appears once it has stopped — two stages where there
     * should be one. The image was on screen a moment ago as the card, so it
     * is already in expo-image's cache and renders on the first frame.
     *
     * No spinner: it would show for exactly the length of the animation and
     * then leave, which reads as a stutter rather than as loading.
     */
    return shell(
      params.cover ? (
        <Image
          source={{ uri: params.cover }}
          placeholder={params.cb ? { blurhash: params.cb } : undefined}
          contentFit="cover"
          // No fade — it would run against the growing shell and muddy it.
          transition={0}
          style={{ flex: 1 }}
        />
      ) : (
        <View className="flex-1" />
      )
    );
  }

  if (posts.length === 0) {
    return shell(
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-base text-ink">{album.title}</Text>
        <Text className="text-sm text-muted">Dette albumet er tomt.</Text>
        <NativePostButton
          label="Tilbake"
          displayLabel="Tilbake"
          appearance="glass"
          size={96}
          onPress={dismiss}
        />
      </View>
    );
  }

  return shell(
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View className="flex-1" style={photoStyle}>
          {current?.videoUrl ? (
            /* Keyed on the post so moving to the next clip builds a new player
               rather than reusing one still pointed at the previous file. */
            <PostVideo
              key={current.id}
              uri={current.videoUrl}
              active
              muted={muted}
              onUnmute={() => setMuted(false)}
              uncropped={uncropped}
            />
          ) : current?.imageUrl ? (
            <Image
              source={{ uri: current.imageUrl }}
              placeholder={current.blurhash ? { blurhash: current.blurhash } : undefined}
              recyclingKey={current.id}
              transition={180}
              // contain shows the whole frame, letterboxed against the canvas;
              // cover fills the screen and crops whatever does not fit.
              contentFit={uncropped ? 'contain' : 'cover'}
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
          <StoryProgress
            count={posts.length}
            index={index}
            onPress={() => {
              void Haptics.selectionAsync();
              setShowGrid(true);
            }}
          />
          <View className="mt-3 flex-row items-center gap-3">
            <NativePostButton
              label="Lukk album"
              systemImage="xmark"
              appearance="glass"
              onPress={dismiss}
            />
            <View className="flex-1 items-center">
              <Text numberOfLines={1} className="text-center text-base text-ink">
                {album.title}
              </Text>
              {album.description ? (
                <Text numberOfLines={1} className="text-center text-xs text-ink opacity-70">
                  {album.description}
                </Text>
              ) : null}
            </View>

            <NativePostButton
              label={uncropped ? 'Fyll skjermen' : 'Vis hele bildet'}
              systemImage={
                uncropped
                  ? 'arrow.down.forward.and.arrow.up.backward'
                  : 'arrow.up.backward.and.arrow.down.forward'
              }
              appearance="glass"
              onPress={() => setUncroppedWithFeedback(!uncropped)}
            />

            {album.canEdit ? (
              <NativePostButton
                label="Rediger album"
                systemImage="slider.horizontal.3"
                appearance="glass"
                onPress={() => router.push(`/rediger-album/${album.id}`)}
              />
            ) : null}
          </View>

          {/* Matches the gap above it: the sound button is the same glass circle
              as the row's controls, and at mt-2 the two rows read as touching. */}
          <View className="mt-3 flex-row items-center gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              {expanded && currentSpecs.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="flex-1"
                  contentContainerStyle={{ gap: 7 }}>
                  {currentSpecs.map((spec) => (
                    <View key={spec} className="justify-center rounded-full bg-overlay px-3 py-2">
                      <Text className="text-xs text-ink opacity-85">{spec}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <View className="flex-row items-center gap-1">
              {current?.videoUrl ? (
                <NativePostButton
                  label={muted ? 'Slå på lyd' : 'Slå av lyd'}
                  systemImage={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'}
                  appearance="glass"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMuted((value) => !value);
                  }}
                />
              ) : null}
            </View>
          </View>
        </Animated.View>

        <View className="flex-1" pointerEvents="none" />

        {/*
          The heart a double-tap leaves behind.

          Sits above the photo but below the chrome, and takes no touches, so
          it cannot swallow the next tap while it is fading.
        */}
        <Animated.View
          style={burstStyle}
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center">
          <Icon
            name="heart.fill"
            size={120}
            tintColor="#ffffff"
            fallback={<Text className="text-8xl">❤️</Text>}
          />
        </Animated.View>

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
            <View className="flex-row items-center">
              {likes.count > 0 ? (
                <NativePostButton
                  label={`Se hvem som ga ${likes.count} hjerter`}
                  displayLabel={String(likes.count)}
                  size={48}
                  contentAlignment="trailing"
                  onPress={() => setPeopleMode('likes')}
                />
              ) : null}

              {/* The heart is always the group's rightmost 48pt control. The
                  optional count therefore grows leftward without moving it. */}
              <NativePostButton
                label={likes.likedByMe ? 'Fjern hjerte' : 'Gi hjerte'}
                systemImage={likes.likedByMe ? 'heart.fill' : 'heart'}
                tintColor={likes.likedByMe ? '#ff3b30' : '#ffffff'}
                size={48}
                onPress={onToggleLike}
              />
            </View>

            {current && session && current.author_id === session.user.id && isPro ? (
              <NativePostButton
                label="Se hvem som har sett innlegget"
                systemImage="eye.fill"
                size={48}
                onPress={() => setPeopleMode('views')}
              />
            ) : null}

            <NativePostButton
              label="Kommentarer"
              systemImage="bubble.left.fill"
              size={48}
              onPress={() => {
                void Haptics.selectionAsync();
                setShowComments(true);
              }}
            />

            {current && session && current.author_id === session.user.id ? (
              <NativePostButton
                label="Rediger innlegg"
                systemImage="pencil"
                size={48}
                onPress={() => router.push(`/rediger-innlegg/${current.id}` as never)}
              />
            ) : null}

            {/* Reporting your own post is meaningless, so it is hidden there. */}
            {current && session && current.author_id !== session.user.id ? (
              <NativePostButton
                label="Rapporter innlegg"
                systemImage="ellipsis"
                size={48}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setReportTarget({
                    reportedUserId: current.author_id,
                    postId: current.id,
                  });
                }}
              />
            ) : null}
          </Animated.View>

          {current ? (
            <PostTile
              key={current.id}
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

      {posts.length > 0 ? (
        <PostGridSheet
          posts={posts}
          index={index}
          visible={showGrid}
          onClose={() => setShowGrid(false)}
          onSelect={(position) => {
            setShowGrid(false);
            if (position === index) return;
            setExpanded(false);
            // Each post starts on its own terms, exactly as when tapping
            // through: silent, and framed as shot.
            setMuted(true);
            setUncropped(false);
            setIndex(position);
            revealChrome();
          }}
        />
      ) : null}

      {current && peopleMode ? (
        <PeopleSheet
          postId={current.id}
          initialMode={peopleMode}
          canSeeViews={!!session && current.author_id === session.user.id && isPro}
          visible
          onClose={() => setPeopleMode(null)}
        />
      ) : null}
    </>
  );
}

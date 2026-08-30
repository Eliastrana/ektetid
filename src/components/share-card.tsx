import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { Dice } from '@/components/dice';
import { formatNorwegianDate } from '@/components/post-tile';

/**
 * The card's laid-out size, and the size it is written at.
 *
 * 4:5 because that is the tallest a picture can be before Instagram, Messages
 * and every other place this ends up start cropping it. Laid out small and
 * captured large: `captureRef` resamples to the target, so the text is set at
 * ordinary point sizes and comes out at three times the resolution rather than
 * being hand-tuned for a 1080px canvas.
 */
const CARD_WIDTH = 360;
const CARD_HEIGHT = 450;
const EXPORT_SCALE = 3;

/**
 * How long to wait for the images before giving up and capturing anyway.
 *
 * The photo is on screen when the button is pressed, so it is already in
 * expo-image's cache and this rarely matters. It exists for the selfie, which
 * may not be — and a share that silently never happens is worse than one
 * missing an inset.
 */
const IMAGE_TIMEOUT_MS = 2500;

/** The selfie inset, matching the proportion the album view gives it. */
const SELFIE_WIDTH = 74;
const SELFIE_HEIGHT = 99;

/**
 * Everything the card draws, and nothing else.
 *
 * Spelled out rather than taking a post row, because the two screens that share
 * from here hold posts in different shapes — the album viewer has the full row,
 * the album editor a narrower admin one. Naming the seven fields it actually
 * uses lets either map into it, and stops the card from depending on a table.
 */
export type ShareTarget = {
  albumTitle: string;
  imageUrl: string | null;
  selfieUrl: string | null;
  title: string | null;
  takenAt: string;
  location: string | null;
  rating: number | null;
  /** Already resolved to a name; the card does not choose between fields. */
  author: string | null;
};

/**
 * Renders one post as a picture worth sending, then opens the share sheet.
 *
 * Mounted only while a share is in flight, and unmounted by `onDone` whatever
 * the outcome. The card is a composition rather than the photo alone: sharing a
 * bare JPEG says nothing about where it came from, and a screenshot of the app
 * would carry the chrome, the status bar and whatever sheet happened to be open.
 *
 * Laid out far off screen but genuinely laid out — anything hidden with
 * `opacity` or `display` captures as blank, which is the one thing about
 * view-shot that has to be learned rather than read.
 */
export function ShareCard({
  target,
  onDone,
}: {
  target: ShareTarget;
  /** Called exactly once, with a message only when the share failed. */
  onDone: (error?: string) => void;
}) {
  const host = useRef<View>(null);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const finished = useRef(false);

  /**
   * Whether a capture has begun, as opposed to having ended.
   *
   * Both of the paths below call `capture`, and one of them is a timer that
   * cannot know the other already ran. `finished` was the only guard and it is
   * set in `settle`, which waits on `shareAsync` — a promise that does not
   * resolve until the share sheet is dismissed. So for as long as the sheet was
   * open the guard read false, the timeout fired, and a second sheet opened
   * behind the first. Set before the first await, so nothing can interleave.
   */
  const started = useRef(false);

  const wanted = 1 + (target.selfieUrl ? 1 : 0);
  const [loaded, setLoaded] = useState(0);

  const settle = useCallback(
    (error?: string) => {
      if (finished.current) return;
      finished.current = true;
      onDone(error);
    },
    [onDone]
  );

  const capture = useCallback(async () => {
    if (started.current || finished.current || !host.current) return;
    started.current = true;
    try {
      // Asked before the work rather than after it: composing and encoding a
      // 1080px card only to discover there is nowhere to send it wastes the
      // time and reports the wrong reason.
      if (!(await Sharing.isAvailableAsync())) {
        settle('Deling er ikke tilgjengelig her.');
        return;
      }

      const uri = await captureRef(host, {
        format: 'jpg',
        quality: 0.95,
        width: CARD_WIDTH * EXPORT_SCALE,
        height: CARD_HEIGHT * EXPORT_SCALE,
        result: 'tmpfile',
      });

      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        // Names the file the recipient receives, and the format iOS offers it
        // in — without this the share sheet treats it as an unknown blob.
        UTI: 'public.jpeg',
        dialogTitle: target.title || target.albumTitle,
      });
      settle();
    } catch {
      settle('Klarte ikke å lage bildet.');
    }
  }, [settle, target.albumTitle, target.title]);

  /*
   * One paint frame after the last image reports, then capture.
   *
   * onLoad says the bitmap has decoded, not that it has been drawn. Offscreen,
   * expo-image's onDisplay is not guaranteed to fire at all, so this is the
   * same compromise the map's pin factory settled on: onLoad plus a frame.
   */
  useEffect(() => {
    if (loaded < wanted) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      void capture();
    });
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [capture, loaded, wanted]);

  // The safety net, for an image that never reports either way. Harmless once
  // the real path has run: `started` makes this a no-op.
  useEffect(() => {
    const timer = setTimeout(() => void capture(), IMAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [capture]);

  const arrived = () => setLoaded((value) => value + 1);

  return (
    <View
      style={{
        position: 'absolute',
        left: -9999,
        top: -9999,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      pointerEvents="none">
      {/* collapsable={false} keeps the view in the native hierarchy, which is
          what there is to capture. */}
      <View
        ref={host}
        collapsable={false}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: '#000000' }}>
        {target.imageUrl ? (
          <Image
            source={{ uri: target.imageUrl }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            // No fade: a transition would still be running at capture time and
            // write the card at whatever opacity it had reached.
            transition={0}
            onLoad={arrived}
            onError={arrived}
          />
        ) : null}

        {/*
          A scrim under the words rather than over the whole photo.
          Transparent for the top half, so the picture is the picture, and
          opaque enough at the foot that a caption stays readable over a bright
          sky. Drawn as SVG because a stack of translucent views banded
          visibly at this size.
        */}
        <Svg
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          style={{ position: 'absolute', inset: 0 }}>
          <Defs>
            <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.45" stopColor="#000000" stopOpacity="0" />
              <Stop offset="0.78" stopColor="#000000" stopOpacity="0.55" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0.88" />
            </LinearGradient>
          </Defs>
          <Rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="url(#scrim)" />
        </Svg>

        {target.rating ? (
          <View style={{ position: 'absolute', left: 18, top: 18 }}>
            <Dice face={target.rating} size={30} color="#ffffff" />
          </View>
        ) : null}

        {target.selfieUrl ? (
          <Image
            source={{ uri: target.selfieUrl }}
            style={{
              position: 'absolute',
              right: 18,
              top: 18,
              width: SELFIE_WIDTH,
              height: SELFIE_HEIGHT,
              borderRadius: 10,
            }}
            contentFit="cover"
            transition={0}
            onLoad={arrived}
            onError={arrived}
          />
        ) : null}

        <View style={{ position: 'absolute', bottom: 18, left: 18, right: 18, gap: 3 }}>
          {target.title ? (
            <Text
              numberOfLines={2}
              style={{ color: '#ffffff', fontSize: 26, letterSpacing: -0.6 }}>
              {target.title}
            </Text>
          ) : null}

          <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 12, opacity: 0.8 }}>
            {[formatNorwegianDate(target.takenAt), target.location].filter(Boolean).join(' · ')}
          </Text>

          {/*
            The mark, and the only place the app names itself. Sitting on the
            same baseline as the author so the card reads as one line of
            credit rather than as a photograph with an advert under it.
          */}
          <View
            style={{
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <Text style={{ color: '#ffffff', fontSize: 12, opacity: 0.6 }}>
              {target.author ?? ''}
            </Text>
            {/*
              Two siblings rather than a nested Text.
              
              Nested, the dot's colour depends on how the platform merges an
              inherited text style with an overriding one, and it came out white.
              Side by side there is nothing to inherit from. Larger than the
              credit beside it too: at 13pt a full stop is about two points
              across, which is a speck whatever colour it is.
            */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: '#ffffff', fontSize: 16, letterSpacing: 0.2 }}>
                EkteTid
              </Text>
              <Text style={{ color: '#ff3b30', fontSize: 16, fontWeight: '700' }}>.</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

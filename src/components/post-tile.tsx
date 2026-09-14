import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Animated, {
  type SharedValue,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { SFSymbol } from 'sf-symbols-typescript';

import type { AlbumPost } from '@/lib/album';
import { Dice } from '@/components/dice';
import { GlassPill } from '@/components/glass-pill';
import { Icon } from '@/components/icon';
import { NativePostButton } from '@/components/native-post-button';
import { linkLabel } from '@/lib/link';
import { storageImageSource } from '@/lib/images';
import { fromPostVenue, venueMapsUrl } from '@/lib/venue';

type Props = {
  post: AlbumPost;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Attribute the photo. Only meaningful in a shared album — in a personal one
   * every post is the owner's, so the name would be noise on every frame.
   */
  showAuthor?: boolean;
  /**
   * Drop the dice while something else needs the band above the tile.
   *
   * The rating floats there, which is the same strip the album's controls
   * occupy — with the actions open the two overlapped, and a translucent glass
   * button with pips showing through it is worse than no pips at all.
   */
  hideRating?: boolean;
  /**
   * Whether the selfie is currently the full-screen photo.
   *
   * Owned by the album, which draws that photo; this only decides which of the
   * two images belongs in the inset.
   */
  swapped?: boolean;
  /**
   * Trade the inset for the photo behind it. Absent where swapping makes no
   * sense — a clip cannot become an inset, and the vertical stream draws its
   * own photo without asking this component.
   */
  onSwap?: () => void;
};

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

const SELFIE_COLLAPSED = { width: 60, height: 80 };

/**
 * The album screen's own `gap-3` between the chrome and this tile, in points.
 *
 * The rating floats above the tile on the left while the chrome column floats
 * above it on the right, so the two are read as one band whether or not they
 * were built that way. Sitting 8pt above the tile against the chrome's 12 put
 * their bottom edges 4pt out of line with each other.
 */
const CHROME_GAP = 12;

/**
 * The swap control's size, and how it is arrived at.
 *
 * Much smaller than the album's chrome on purpose: those sit on the photograph
 * and are the screen's controls, while this one sits inside a 132pt inset and
 * is about the inset alone. At chrome size it took a third of the selfie's
 * width.
 *
 * Two levers, because the obvious one runs out. The glyph box sets the disc —
 * SwiftUI draws the glass around the label — but the control's own padding is
 * roughly 25pt of it, so no box brings the disc under about thirty, and a
 * smaller box only crowds a full-size glyph against the edge. Scaling takes the
 * finished control down as one piece, glyph included.
 *
 * The frame is the scaled result rather than the unscaled one, since
 * scaleEffect does not change the room a view occupies: at 38 the disc would
 * float in the middle of a box half again its size.
 */
const SWAP_GLYPH_BOX = 12;
const SWAP_SCALE = 0.72;
const SWAP_SIZE = 27;
const SELFIE_EXPANDED = { width: 132, height: 176 };
const DESCRIPTION_PREVIEW_LINES = 4;

/**
 * Both dimensions shrink by the same factor, so the selfie can be scaled
 * rather than resized. 60/132 and 80/176 are both 0.4545.
 */
const SELFIE_MIN_SCALE = SELFIE_COLLAPSED.width / SELFIE_EXPANDED.width;

/*
 * One animated value drives everything, and nothing here is a layout
 * animation.
 *
 * Two things used to make this stutter. The selfie's *width* was animated, and
 * since the text sits in a flex-1 column beside it, every frame changed the
 * text's available width and re-wrapped the title and description — text
 * re-layout sixty times a second, with words jumping between lines. And the
 * description and the hint were mounted and unmounted behind FadeIn/FadeOut,
 * which are layout animations, so React Native was animating the same reflow
 * the timing was already animating.
 *
 * Now the selfie's column is a fixed width and only its height animates, so
 * the text column never changes width and never re-wraps. The photo itself is
 * scaled, which costs nothing — it is a transform, not a layout. The
 * description and hint stay mounted and animate their own measured height from
 * the same progress value, so every moving part is driven by one clock.
 */
const DURATION = 260;
const EASING = Easing.out(Easing.cubic);

export function formatNorwegianDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function numericExifValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const fraction = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    if (fraction) {
      const denominator = Number(fraction[2]);
      return denominator > 0 ? Number(fraction[1]) / denominator : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rational = value as Record<string, unknown>;
    const numerator = Number(rational.numerator ?? rational.Numerator);
    const denominator = Number(rational.denominator ?? rational.Denominator);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return numerator / denominator;
    }
  }
  return null;
}

/** Display exposure the way a camera does: 1/50 rather than 0.02 seconds. */
function formatShutterSpeed(data: Record<string, unknown>): string | null {
  let seconds = numericExifValue(data.ExposureTime ?? data.exposureTime);

  // ShutterSpeedValue is EXIF's APEX Tv value, not seconds. Tv = log2(1/t).
  if (!seconds) {
    const apex = numericExifValue(data.ShutterSpeedValue ?? data.shutterSpeedValue);
    if (apex !== null) seconds = 2 ** -apex;
  }
  if (!seconds || seconds <= 0) return null;

  if (seconds < 1) return `1/${Math.max(1, Math.round(1 / seconds))}`;
  const rounded = Number(seconds.toFixed(1));
  return `${rounded} s`;
}

/**
 * Aperture the way a lens is labelled: ƒ/1.8, not ƒ/1.7999999523162842, and
 * ƒ/2 rather than ƒ/2.0. EXIF stores FNumber as a rational often decoded to a
 * float, so the raw value carries binary noise that reads as broken precision.
 */
function formatAperture(data: Record<string, unknown>): string | null {
  const value = numericExifValue(data.FNumber ?? data.fNumber);
  if (value === null || value <= 0) return null;
  return `ƒ/${Number(value.toFixed(1))}`;
}

export function imageSpecs(exif: unknown): string[] {
  if (!exif || typeof exif !== 'object' || Array.isArray(exif)) return [];
  const data = exif as Record<string, unknown>;
  const text = (key: string) => {
    const value = data[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  };

  const model = text('Model') ?? text('model');
  const width = text('PixelXDimension') ?? text('ImageWidth');
  const height = text('PixelYDimension') ?? text('ImageHeight');
  const iso = text('ISOSpeedRatings') ?? text('PhotographicSensitivity');
  const aperture = formatAperture(data);
  const shutterSpeed = formatShutterSpeed(data);

  return [
    model,
    width && height ? `${width} × ${height}` : null,
    iso ? `ISO ${iso}` : null,
    aperture,
    shutterSpeed,
  ].filter((value): value is string => !!value);
}

/**
 * Title, date, place and description, reading directly off the photo.
 *
 * Text is always white here — the scrim guarantees a dark backdrop, so the
 * per-post luminance is not needed to choose a colour.
 */
export function PostTile({
  post,
  expanded,
  onToggle,
  showAuthor = false,
  hideRating = false,
  swapped = false,
  onSwap,
}: Props) {
  const specs = imageSpecs(post.exif);
  const hasDetail = !!post.selfieUrl || specs.length > 0;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionTruncated, setDescriptionTruncated] = useState(false);
  const progress = useSharedValue(expanded ? 1 : 0);



  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [expanded, progress]);

  const selfieBoxStyle = useAnimatedStyle(() => ({
    height:
      SELFIE_COLLAPSED.height +
      (SELFIE_EXPANDED.height - SELFIE_COLLAPSED.height) * progress.value,
  }));

  const selfieImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: SELFIE_MIN_SCALE + (1 - SELFIE_MIN_SCALE) * progress.value }],
  }));




  return (
    <View className="relative">
      {post.rating && !hideRating ? (
        <View
          pointerEvents="none"
          className="absolute left-0 items-start justify-center"
          style={{
            top: -(SELFIE_COLLAPSED.width + CHROME_GAP),
            width: SELFIE_COLLAPSED.width,
            height: SELFIE_COLLAPSED.width,
          }}>
          <Dice face={post.rating} size={SELFIE_COLLAPSED.width} color="#ffffff" />
        </View>
      ) : null}

      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <Pressable
            accessibilityRole={hasDetail ? 'button' : undefined}
            accessibilityLabel={hasDetail ? 'Innleggsdetaljer' : undefined}
            accessibilityHint={
              hasDetail ? (expanded ? 'Skjul detaljer' : 'Vis detaljer') : undefined
            }
            onPress={onToggle}
            disabled={!hasDetail}>
            {post.title ? (
              <Text
                className="text-3xl text-ink"
                numberOfLines={expanded ? undefined : 2}
                style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8 }}>
                {post.title}
              </Text>
            ) : null}

            {showAuthor && post.author ? (
              <View className="mt-1 flex-row items-center gap-1.5">
                {post.author.avatar_url ? (
                  <Image
                    source={{ uri: post.author.avatar_url }}
                    style={{ width: 18, height: 18, borderRadius: 9 }}
                  />
                ) : null}
                <Text className="text-sm text-ink opacity-90">
                  {post.author.display_name ?? post.author.username}
                </Text>
              </View>
            ) : null}

            <View className="mt-1 flex-row items-center gap-2">
              <Text className="text-sm text-ink opacity-75">
                {formatNorwegianDate(post.taken_at)}
              </Text>
              {post.location ? (
                <Text numberOfLines={1} className="flex-1 text-sm text-ink opacity-75">
                  · {post.location}
                </Text>
              ) : null}
            </View>
          </Pressable>

          {/*
            Outside the Pressable above, not inside it.

            That one toggles the tile's detail on tap, and a button nested in it
            would fire both — opening Maps and collapsing the tile from one
            press.
          */}
          <PostActions post={post} />

          {post.description ? (
            <View className="pt-3">
              {/* Measure the unconstrained copy so "Les mer" only appears
                  when the rendered text genuinely exceeds four lines. */}
              <Text
                accessible={false}
                pointerEvents="none"
                className="text-base text-ink"
                style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
                onTextLayout={(event) => {
                  const next = event.nativeEvent.lines.length > DESCRIPTION_PREVIEW_LINES;
                  if (next !== descriptionTruncated) setDescriptionTruncated(next);
                }}>
                {post.description}
              </Text>

              <Text
                selectable
                numberOfLines={descriptionExpanded ? undefined : DESCRIPTION_PREVIEW_LINES}
                ellipsizeMode="tail"
                className="text-base text-ink opacity-95">
                {post.description}
              </Text>

              {descriptionTruncated ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    descriptionExpanded ? 'Vis mindre av beskrivelsen' : 'Les hele beskrivelsen'
                  }
                  onPress={() => setDescriptionExpanded((value) => !value)}
                  hitSlop={8}
                  className="self-start py-1 active:opacity-60">
                  <Text className="text-sm font-semibold text-ink opacity-80">
                    {descriptionExpanded ? 'Vis mindre' : 'Les mer'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/*
            The camera's own numbers, under the words rather than over the
            photograph.
            
            They lived in the album's chrome, which put them among the controls
            — a row of readings competing with the buttons for the same line,
            and for attention they do not want. Here they are the last thing on
            the tile, after the title, the caption and the buttons, which is the
            order someone reads in and the order these matter in.

            Wrapped rather than scrolled sideways: there are only ever a few,
            and a Collapsible has to measure its content's height, which a
            horizontal scroller does not honestly report.
          */}
          {specs.length > 0 ? (
            <Collapsible progress={progress}>
              <View className="flex-row flex-wrap items-center gap-2 pt-3">
                {specs.map((spec) => (
                  <GlassPill key={spec}>{spec}</GlassPill>
                ))}
              </View>
            </Collapsible>
          ) : null}

          {hasDetail ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Skjul innleggsdetaljer' : 'Vis innleggsdetaljer'}
              onPress={onToggle}>
              <Collapsible progress={progress} invert>
                <View className="pt-1">
                  <Text className="text-xs text-ink opacity-50">Vis bildedetaljer</Text>
                </View>
              </Collapsible>
            </Pressable>
          ) : null}
        </View>

        {post.selfieUrl ? (
          /*
           * Fixed width, so the text column beside it keeps the same width at
           * every point in the animation. Only the height moves, and that
           * changes the row's height without touching how the text wraps.
           *
           * The wrapper exists so the swap control can sit over the inset
           * without being inside the Pressable that collapses it. Nested
           * Pressables are fine — React Native hands the touch to the
           * innermost — but a SwiftUI host is not a React Native responder,
           * and which of the two wins is not something to find out on a
           * device. As a sibling the question does not arise.
           */
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Gjør selfien mindre' : 'Utvid selfien'}
              onPress={onToggle}>
              <Animated.View
                style={[
                  selfieBoxStyle,
                  { width: SELFIE_EXPANDED.width, overflow: 'hidden' },
                ]}>
                <Animated.View
                  style={[
                    selfieImageStyle,
                    {
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: SELFIE_EXPANDED.width,
                      height: SELFIE_EXPANDED.height,
                      borderRadius: 12,
                      overflow: 'hidden',
                      // Anchored to the corner it is pinned to, so shrinking pulls
                      // it into the bottom right rather than towards its centre.
                      transformOrigin: ['100%', '100%', 0],
                    },
                  ]}>
                  <Image
                    // Whichever one the album is not showing full screen.
                    source={
                      swapped && post.imageUrl
                        ? storageImageSource(post.image_path, post.imageUrl)
                        : storageImageSource(post.selfie_path!, post.selfieUrl)
                    }
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    transition={150}
                    style={{ width: '100%', height: '100%' }}
                  />
                </Animated.View>
              </Animated.View>
            </Pressable>

            {/*
              Offered only while the selfie is open.

              Collapsed it is a thumbnail the size of a stamp, and a control on
              top of it would cover most of the face it is meant to show.
              Expanded there is room, and expanding is also when someone is
              looking closely enough to want the other way round.

              The same native glass circle as the album's controls, but smaller:
              this one belongs to the inset it sits on, not to the screen.
            */}
            {expanded && onSwap ? (
              <View style={{ position: 'absolute', left: 6, top: 6 }}>
                <NativePostButton
                  label={swapped ? 'Vis bildet i stort igjen' : 'Bytt selfien og bildet'}
                  systemImage="arrow.triangle.2.circlepath"
                  appearance="glass"
                  size={SWAP_SIZE}
                  glyphBox={SWAP_GLYPH_BOX}
                  scale={SWAP_SCALE}
                  onPress={onSwap}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The venue and the link, when a post has them.
 *
 * Both are buttons, and look like it. An author who attaches either wants it
 * followed, so neither is context to be noticed — they are the things on the
 * tile asking to be pressed. Nothing renders when a post has neither, which is
 * most of them.
 *
 * They go to different places on purpose. A venue is a point on a map, so it
 * hands off to Maps, which knows what to do with it; a link is a web page, so
 * it opens in the in-app browser and the reader stays in the album.
 */
function PostActions({ post }: { post: AlbumPost }) {
  const venue = fromPostVenue(post);
  const link = post.link;

  if (!venue && !link) return null;

  return (
    <View className="gap-2 pt-2">
      {venue ? (
        <PostAction
          icon="fork.knife"
          glyph="◍"
          label={venue.name}
          spoken={`Åpne ${venue.name} i Kart`}
          onPress={() => void Linking.openURL(venueMapsUrl(venue))}
        />
      ) : null}

      {link ? (
        <PostAction
          icon="link"
          glyph="🔗"
          label={linkLabel(link)}
          spoken={`Åpne lenken ${linkLabel(link)}`}
          onPress={() => void openBrowserAsync(link)}
        />
      ) : null}
    </View>
  );
}

/**
 * One of those buttons.
 *
 * Its own component so the two cannot drift apart: they sit directly above one
 * another on the same tile, where a point of padding between them would be the
 * most visible thing on the photograph.
 *
 * The same glass the album chrome and the music indicator are made of, with a
 * flat fill where that material does not exist — the fallback is conditional
 * because applied over real glass it is a grey film on top of the blur.
 */
function PostAction({
  icon,
  glyph,
  label,
  spoken,
  onPress,
}: {
  icon: SFSymbol;
  /** Stand-in where the symbol has no mapping, so the button is never blank. */
  glyph: string;
  label: string;
  spoken: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spoken}
      onPress={onPress}
      className="self-start active:opacity-70">
      <GlassView
        glassEffectStyle="regular"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderRadius: 999,
          backgroundColor: isLiquidGlassAvailable() ? undefined : 'rgba(255,255,255,0.13)',
        }}>
        <Icon
          name={icon}
          size={14}
          tintColor="#ffffff"
          fallback={<Text className="text-sm text-ink">{glyph}</Text>}
        />
        <Text numberOfLines={1} className="max-w-[210px] text-sm font-semibold text-ink">
          {label}
        </Text>
      </GlassView>
    </Pressable>
  );
}

/**
 * A block that opens and closes with the tile, from zero to its own height.
 *
 * The content is rendered twice: once invisibly and unconstrained purely to be
 * measured, and once inside the animated clip. That looks wasteful, and the
 * obvious version — measure the visible copy — is what broke the description.
 * A child reports a smaller height once its parent is clipped, that value gets
 * written back as the new target, and the two ratchet each other down: the
 * measurements came in at 31, then 17, then 10 points, until the text had no
 * room left to appear in. Guarding against zero does not help, because none of
 * those readings is zero. The measuring copy is never given a height, so it
 * always reports the real one.
 */
function Collapsible({
  progress,
  invert = false,
  children,
}: {
  progress: SharedValue<number>;
  /** Open as the tile closes, for the "Trykk for mer" hint. */
  invert?: boolean;
  children: React.ReactNode;
}) {
  const [height, setHeight] = useState(0);

  const style = useAnimatedStyle(() => {
    const t = invert ? 1 - progress.value : progress.value;
    return { height: height * t, opacity: t };
  });

  return (
    <View>
      <View
        // Out of flow, so it contributes nothing to the layout it is measuring.
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
        pointerEvents="none"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          // Half a point of tolerance: text metrics land on fractions, and
          // rewriting state for 31.6667 vs 31.6666 would loop forever.
          if (next > 0 && Math.abs(next - height) > 0.5) setHeight(next);
        }}>
        {children}
      </View>

      <Animated.View style={[style, { overflow: 'hidden' }]}>{children}</Animated.View>
    </View>
  );
}

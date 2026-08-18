import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  type SharedValue,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { AlbumPost } from '@/lib/album';

type Props = {
  post: AlbumPost;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Attribute the photo. Only meaningful in a shared album — in a personal one
   * every post is the owner's, so the name would be noise on every frame.
   */
  showAuthor?: boolean;
};

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

const SELFIE_COLLAPSED = { width: 60, height: 80 };
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

function formatNorwegianDate(iso: string): string {
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
  const aperture = text('FNumber');
  const shutterSpeed = formatShutterSpeed(data);

  return [
    model,
    width && height ? `${width} × ${height}` : null,
    iso ? `ISO ${iso}` : null,
    aperture ? `ƒ/${aperture}` : null,
    shutterSpeed,
  ].filter((value): value is string => !!value);
}

/**
 * Title, date, place and description, reading directly off the photo.
 *
 * Text is always white here — the scrim guarantees a dark backdrop, so the
 * per-post luminance is not needed to choose a colour.
 */
export function PostTile({ post, expanded, onToggle, showAuthor = false }: Props) {
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
      {post.rating ? (
        <View
          pointerEvents="none"
          className="absolute left-0 items-start justify-center"
          style={{
            top: -(SELFIE_COLLAPSED.width + 8),
            width: SELFIE_COLLAPSED.width,
            height: SELFIE_COLLAPSED.width,
          }}>
          <SymbolView
            name={`die.face.${post.rating}.fill` as 'die.face.1.fill'}
            size={SELFIE_COLLAPSED.width}
            tintColor="#ffffff"
            fallback={<Text className="text-5xl text-ink">⚄</Text>}
          />
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
           */
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
                  source={{ uri: post.selfieUrl }}
                  contentFit="cover"
                  transition={150}
                  style={{ width: '100%', height: '100%' }}
                />
              </Animated.View>
            </Animated.View>
          </Pressable>
        ) : null}
      </View>
    </View>
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

import { Image } from 'expo-image';

type Props = {
  /** How far up the container the dim reaches, as a fraction of its height. */
  height?: number;
  /** Opacity at the very bottom. */
  strength?: number;
};

/**
 * A bottom-up dim for text sitting directly on a photo.
 *
 * Replaces the frosted panels the web app used. Glass takes its colour from
 * whatever is behind it, so over photography it was legible on some images and
 * not on others. Darkening the photo itself is predictable, and it keeps the
 * picture visible rather than covering a slab of it.
 *
 * The ramp is a 387-byte image stretched vertically, not stacked views and not
 * expo-linear-gradient. Stacked views band — flat steps are visible, and with
 * easing the largest step lands right at the bottom edge as a dark line. A
 * native gradient module would mean a native rebuild for what is only a black
 * ramp. A bitmap interpolates smoothly and needs neither.
 *
 * The alpha is squared rather than linear so the top of the gradient fades to
 * nothing gradually; a straight ramp shows a visible edge where it begins.
 */
export function Scrim({ height = 0.55, strength = 0.85 }: Props) {
  return (
    <Image
      source={require('@/assets/images/scrim.png')}
      pointerEvents="none"
      contentFit="fill"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `${height * 100}%`,
        opacity: strength,
      }}
    />
  );
}

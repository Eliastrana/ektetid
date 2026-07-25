import { View } from 'react-native';

type Props = {
  /** How far up the container the dim reaches, as a fraction of its height. */
  height?: number;
  /** Opacity at the very bottom. */
  strength?: number;
};

/** Number of bands. Enough that the steps are not visible on a dark ramp. */
const BANDS = 14;

/**
 * A bottom-up dim for text sitting directly on a photo.
 *
 * Replaces the frosted panels the web app used. Glass takes its colour from
 * whatever is behind it, so over photography it was legible on some images and
 * not on others. Darkening the photo itself is predictable, and it keeps the
 * picture visible rather than covering a slab of it.
 *
 * Built from stacked views rather than expo-linear-gradient deliberately: a
 * native gradient module would mean a native rebuild for what is ultimately a
 * black ramp, and it would be one more thing to keep in step with the SDK.
 *
 * Opacity is eased quadratically, not linear. A straight ramp leaves a visible
 * edge where the dim begins; squaring pushes most of the darkening to the
 * bottom so the top of the gradient disappears into the image.
 */
export function Scrim({ height = 0.55, strength = 0.85 }: Props) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `${height * 100}%`,
        flexDirection: 'column',
      }}>
      {Array.from({ length: BANDS }, (_, i) => {
        const t = (i + 1) / BANDS;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: `rgba(0,0,0,${(t * t * strength).toFixed(3)})`,
            }}
          />
        );
      })}
    </View>
  );
}

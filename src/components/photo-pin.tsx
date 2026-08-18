import { Image } from 'expo-image';
import { View } from 'react-native';

/** Diameter of the circular photo, in points. */
export const PIN_DIAMETER = 52;

/** Height of the pointed tail below the circle. */
export const PIN_TAIL = 10;

/**
 * The captured canvas, deliberately square.
 *
 * Apple Maps normalises an annotation icon to a square box, so a taller-than-
 * wide image gets stretched horizontally and squashed vertically — which turned
 * the circle into a visible ellipse. Padding the canvas out to a square means
 * the icon is scaled uniformly and the circle stays a circle.
 */
export const PIN_SIZE = PIN_DIAMETER + PIN_TAIL;

export const PIN_WIDTH = PIN_SIZE;
export const PIN_HEIGHT = PIN_SIZE;

/**
 * The pin as it will be captured: a circular photo, a white ring, and a tail
 * pointing at the coordinate.
 *
 * Apple Maps replaces its own pin with whatever icon it is given, so the pin
 * has to be drawn here and handed over as a finished image. The tail matters
 * more than it looks — without it the pin has no obvious point of contact with
 * the map, and a floating circle reads as hovering somewhere near the place
 * rather than marking it.
 *
 * Rendered offscreen and captured, never shown to the user directly.
 */
export function PhotoPin({
  uri,
  onLoaded,
  onError,
}: {
  uri: string;
  onLoaded?: () => void;
  onError?: () => void;
}) {
  return (
    <View style={{ width: PIN_WIDTH, height: PIN_HEIGHT, alignItems: 'center' }}>
      {/*
        A rotated square rather than a triangle: React Native has no polygon
        primitive, and a border-trick triangle cannot be given the same white
        fill as the ring.

        Drawn before the circle so it sits behind it. Painted after, its upper
        half covered the bottom of the photo — a white wedge cutting into the
        image, which stopped the pin reading as a full circle at all.
      */}
      <View
        style={{
          position: 'absolute',
          top: PIN_DIAMETER - 10,
          width: 14,
          height: 14,
          backgroundColor: '#ffffff',
          transform: [{ rotate: '45deg' }],
          borderRadius: 2,
        }}
      />

      <View
        style={{
          width: PIN_DIAMETER,
          height: PIN_DIAMETER,
          borderRadius: PIN_DIAMETER / 2,
          borderWidth: 3,
          borderColor: '#ffffff',
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}>
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          cachePolicy="memory-disk"
          allowDownscaling
          enforceEarlyResizing
          priority="high"
          contentFit="cover"
          // onLoad only fires after a successful decode. PinFactory allows one
          // render frame before capture so the offscreen host has painted it.
          onLoad={onLoaded}
          onError={onError}
          // No fade — a transition mid-capture bakes a half-faded photo in.
          transition={0}
        />
      </View>
    </View>
  );
}

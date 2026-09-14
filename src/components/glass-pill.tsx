import { Text, View } from 'react-native';

export type GlassPillProps = {
  /** The short string the pill exists to show — a shutter speed, an f-number. */
  children: string;
};

/**
 * A small capsule of text, in the same material as the chrome's buttons.
 *
 * This is the fallback: a flat translucent fill, which is what the buttons
 * themselves fall back to off Apple platforms and on iOS before 26. The two
 * still agree with each other, which is the point — the pills are meant to
 * belong to the row of controls beside them, whatever that row is made of.
 */
export function GlassPill({ children }: GlassPillProps) {
  return (
    <View className="justify-center rounded-full bg-overlay px-3 py-2">
      <Text className="text-xs text-ink opacity-85">{children}</Text>
    </View>
  );
}

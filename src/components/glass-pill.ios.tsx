import { Host } from '@expo/ui';
import { Text as SwiftText } from '@expo/ui/swift-ui';
import { font, foregroundStyle, glassEffect, padding } from '@expo/ui/swift-ui/modifiers';
import { Platform, Text, View } from 'react-native';

import type { GlassPillProps } from '@/components/glass-pill';

/**
 * The first iOS with Liquid Glass, and so with anything for this to ask for.
 *
 * Checked in JavaScript rather than left to the native modifier's own
 * availability guard, because that guard falls through to drawing nothing:
 * below 26 the pill would lose its background entirely rather than degrade.
 */
const GLASS_FROM = 26;

const supportsGlass = Number.parseInt(String(Platform.Version), 10) >= GLASS_FROM;

/**
 * A small capsule of text, in the same material as the chrome's buttons.
 *
 * The buttons get theirs from `.buttonStyle(.glass)`, which is not available to
 * something that is not a button — so this reaches for the same material
 * directly. The result is the identical surface, without pretending a shutter
 * speed is something you can press.
 *
 * Below iOS 26 this falls back to the flat fill the shared implementation uses,
 * which is also what the buttons themselves fall back to there. The two are
 * meant to match each other; matching a material neither of them has would be
 * worse than both being flat.
 */
export function GlassPill({ children }: GlassPillProps) {
  if (!supportsGlass) {
    return (
      <View className="justify-center rounded-full bg-overlay px-3 py-2">
        <Text className="text-xs text-ink opacity-85">{children}</Text>
      </View>
    );
  }

  return (
    <Host matchContents>
      <SwiftText
        modifiers={[
          font({ size: 12 }),
          foregroundStyle('#ffffff'),
          // Padding first, then the glass: the material is drawn around
          // whatever it is applied to, so the order is what puts the text
          // inside a capsule rather than a capsule tight around the glyphs.
          padding({ horizontal: 12, vertical: 7 }),
          glassEffect({ shape: 'capsule' }),
        ]}>
        {children}
      </SwiftText>
    </Host>
  );
}

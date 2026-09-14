import { Pressable, Text } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Icon } from '@/components/icon';

export type NativePostButtonProps = {
  label: string;
  onPress: () => void;
  systemImage?: SFSymbol;
  displayLabel?: string;
  disabled?: boolean;
  appearance?: 'filled' | 'glass' | 'plain';
  tintColor?: string;
  foregroundColor?: string;
  size?: number;
  /**
   * Accepted for parity with the iOS build, and deliberately unused.
   *
   * There the glass disc is sized from the label, so boxing the glyph is the
   * only way to widen it. Here the circle is `size` outright and already the
   * right size — applying the correction as well would apply it twice.
   */
  glyphBox?: number;
  /**
   * Accepted for parity, and unused.
   *
   * On iOS this scales a control whose disc SwiftUI decides. Here the circle is
   * `size` outright, so the caller has already said how big it should be and
   * scaling it again would apply the same reduction twice.
   */
  scale?: number;
  /** Put the value under the glyph instead of beside it, as on iOS. */
  stackValue?: boolean;
  contentAlignment?: 'center' | 'leading' | 'trailing';
  contentInset?: number;
};

/** Cross-platform fallback for platforms without SwiftUI. */
export function NativePostButton({
  label,
  onPress,
  systemImage,
  displayLabel,
  disabled = false,
  appearance = 'plain',
  tintColor = '#ffffff',
  foregroundColor,
  size = 44,
  stackValue = false,
  contentAlignment = 'center',
  contentInset = 0,
}: NativePostButtonProps) {
  // Matches the iOS build: an icon with a value beside it becomes a capsule
  // showing both, rather than the icon alone.
  const withValue = !!systemImage && !!displayLabel;
  const stacked = withValue && stackValue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`items-center justify-center rounded-full active:opacity-60 ${
        appearance === 'glass' ? 'bg-overlay' : appearance === 'filled' ? 'bg-ink' : ''
      } ${disabled ? 'opacity-40' : ''}`}
      style={{
        width: stacked ? size : withValue ? undefined : size,
        minWidth: withValue && !stacked ? size : undefined,
        paddingHorizontal: withValue && !stacked ? 14 : 0,
        paddingVertical: stacked ? 7 : 0,
        flexDirection: stacked ? 'column' : 'row',
        gap: stacked ? 1 : withValue ? 6 : 0,
        // Upright, the content decides the height; a fixed one would either
        // crop the number or leave a gap under the glyph.
        height: stacked ? undefined : size,
        alignItems:
          contentAlignment === 'leading'
            ? 'flex-start'
            : contentAlignment === 'trailing'
              ? 'flex-end'
              : 'center',
        paddingLeft: contentAlignment === 'leading' ? contentInset : 0,
        paddingRight: contentAlignment === 'trailing' ? contentInset : 0,
      }}>
      {systemImage ? (
        <Icon name={systemImage} size={20} tintColor={foregroundColor ?? tintColor} />
      ) : null}
      {!systemImage || withValue ? (
        <Text
          style={{
            color: foregroundColor ?? tintColor,
            fontSize: stacked ? 13 : 16,
            fontWeight: '600',
          }}>
          {displayLabel ?? label}
        </Text>
      ) : null}
    </Pressable>
  );
}

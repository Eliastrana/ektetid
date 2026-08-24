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
  contentAlignment = 'center',
  contentInset = 0,
}: NativePostButtonProps) {
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
        width: size,
        height: size,
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
      ) : (
        <Text style={{ color: foregroundColor ?? tintColor, fontSize: 16, fontWeight: '600' }}>
          {displayLabel ?? label}
        </Text>
      )}
    </Pressable>
  );
}

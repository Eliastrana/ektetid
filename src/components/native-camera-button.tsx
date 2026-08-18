import { SymbolView } from 'expo-symbols';
import { Pressable, Text } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

export type NativeCameraButtonProps = {
  label: string;
  systemImage: SFSymbol;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
};

/** Cross-platform fallback for platforms without SwiftUI. */
export function NativeCameraButton({
  label,
  systemImage,
  onPress,
  disabled = false,
  active = false,
}: NativeCameraButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      className={`h-14 w-14 items-center justify-center rounded-full bg-overlay active:bg-overlay-strong ${
        disabled ? 'opacity-40' : ''
      }`}>
      <SymbolView
        name={systemImage}
        size={26}
        tintColor={active ? '#ffd60a' : '#ffffff'}
        fallback={<Text className="text-2xl text-ink">●</Text>}
      />
    </Pressable>
  );
}

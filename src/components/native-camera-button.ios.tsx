import { Button, Host } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  labelStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

export type NativeCameraButtonProps = {
  label: string;
  systemImage: SFSymbol;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
};

/** A real SwiftUI camera action, including native glass and press feedback. */
export function NativeCameraButton({
  label,
  systemImage,
  onPress,
  disabled = false,
  active = false,
}: NativeCameraButtonProps) {
  return (
    <Host matchContents>
      <Button
        label={label}
        systemImage={systemImage}
        onPress={onPress}
        modifiers={[
          buttonStyle('glass'),
          controlSize('large'),
          buttonBorderShape('circle'),
          labelStyle('iconOnly'),
          tint(active ? '#ffd60a' : '#ffffff'),
          disabledModifier(disabled),
        ]}
      />
    </Host>
  );
}

import { Host } from '@expo/ui';
import { Button } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  imageScale,
  labelStyle,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

export type NativePostButtonProps = {
  label: string;
  onPress: () => void;
  systemImage?: SFSymbol;
  /** Short visible text when the accessibility label is more descriptive. */
  displayLabel?: string;
  disabled?: boolean;
  appearance?: 'filled' | 'glass' | 'plain';
  tintColor?: string;
  foregroundColor?: string;
  size?: number;
  contentAlignment?: 'center' | 'leading' | 'trailing';
  contentInset?: number;
};

/** A real SwiftUI control for the chrome around a full-screen post. */
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
  const edgePadding =
    contentAlignment === 'leading'
      ? padding({ leading: contentInset })
      : contentAlignment === 'trailing'
        ? padding({ trailing: contentInset })
        : null;

  return (
    <Host matchContents>
      <Button
        label={displayLabel ?? label}
        systemImage={systemImage}
        onPress={onPress}
        modifiers={[
          buttonStyle(
            appearance === 'filled'
              ? 'borderedProminent'
              : appearance === 'glass'
                ? 'glass'
                : 'plain'
          ),
          controlSize('large'),
          buttonBorderShape('circle'),
          labelStyle(systemImage ? 'iconOnly' : 'titleOnly'),
          imageScale('large'),
          font({ size: systemImage ? 18 : 16, weight: 'semibold' }),
          ...(edgePadding ? [edgePadding] : []),
          frame({ width: size, height: size, alignment: contentAlignment }),
          tint(tintColor),
          ...(foregroundColor ? [foregroundStyle(foregroundColor)] : []),
          accessibilityLabel(label),
          disabledModifier(disabled),
        ]}
      />
    </Host>
  );
}

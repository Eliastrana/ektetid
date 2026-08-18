import { Button, Host } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  frame,
  imageScale,
  labelStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';

export type NativeShutterButtonProps = {
  mode: 'picture' | 'video';
  recording: boolean;
  busy: boolean;
  onPress: () => void;
};

/** Native SwiftUI shutter with the camera app's direct press feedback. */
export function NativeShutterButton({
  mode,
  recording,
  busy,
  onPress,
}: NativeShutterButtonProps) {
  const label = recording ? 'Stopp video' : mode === 'video' ? 'Start video' : 'Ta bilde';
  const systemImage = busy && !recording ? 'hourglass' : recording ? 'stop.fill' : 'circle.fill';
  const color = recording || mode === 'video' ? '#ff3b30' : '#ffffff';

  return (
    <Host matchContents>
      <Button
        label={label}
        systemImage={systemImage}
        onPress={onPress}
        modifiers={[
          buttonStyle('plain'),
          controlSize('extraLarge'),
          labelStyle('iconOnly'),
          imageScale('large'),
          font({ size: recording ? 38 : 64, weight: 'regular' }),
          frame({ width: 80, height: 80 }),
          tint(color),
          accessibilityLabel(label),
          disabledModifier(busy && !recording),
        ]}
      />
    </Host>
  );
}

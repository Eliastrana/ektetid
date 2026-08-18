import { Pressable, View } from 'react-native';

export type NativeShutterButtonProps = {
  mode: 'picture' | 'video';
  recording: boolean;
  busy: boolean;
  onPress: () => void;
};

export function NativeShutterButton({
  mode,
  recording,
  busy,
  onPress,
}: NativeShutterButtonProps) {
  const label = recording ? 'Stopp video' : mode === 'video' ? 'Start video' : 'Ta bilde';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy && !recording}
      onPress={onPress}
      className="h-20 w-20 items-center justify-center active:opacity-60">
      <View
        className={recording ? 'h-9 w-9 rounded-lg bg-alert' : 'h-16 w-16 rounded-full'}
        style={!recording ? { backgroundColor: mode === 'video' ? '#ff3b30' : '#ffffff' } : undefined}
      />
    </Pressable>
  );
}

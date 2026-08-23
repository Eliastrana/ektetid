import { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Past this far down, releasing dismisses rather than settles back. */
const DISMISS_DISTANCE = 110;

/** A flick dismisses from anywhere, however short the drag was. */
const DISMISS_VELOCITY = 800;

/** Matches the sheets' other motion: timed easing, nothing overshoots. */
const DURATION = 220;
const EASING = Easing.out(Easing.cubic);

/**
 * The shared shell for a sheet that rises from the bottom.
 *
 * Three ways out, because a sheet that closes only one way traps whoever
 * reaches for a different one: the grip at the top drags down, the space above
 * dismisses on tap, and whatever close control the sheet carries still works.
 *
 * The drag lives on the lip alone rather than the whole surface. A pan across
 * the body would compete with the lists and pagers these sheets contain, and
 * losing a vertical scroll to an accidental dismiss is worse than having to
 * reach for the grip.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  className = '',
  backdrop = 'bg-black/50',
  avoidKeyboard = false,
  keyboardVerticalOffset = 0,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height and any other sizing for the sheet surface. */
  className?: string;
  backdrop?: string;
  /** Lift the sheet clear of the keyboard, for sheets that take input. */
  avoidKeyboard?: boolean;
  /** Correction for insets the sheet already reserves inside itself. */
  keyboardVerticalOffset?: number;
}) {
  const offset = useSharedValue(0);

  // A sheet dismissed by dragging is still translated when it reopens, which
  // would leave it sitting low on screen.
  useEffect(() => {
    if (visible) offset.value = 0;
  }, [offset, visible]);

  const drag = Gesture.Pan()
    .onUpdate((event) => {
      // Downward only: dragging up would lift the sheet off the bottom edge
      // and expose the backdrop beneath it.
      offset.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
        return;
      }
      offset.value = withTiming(0, { duration: DURATION, easing: EASING });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  const surface = (
    <Animated.View style={sheetStyle} className={`rounded-t-3xl bg-surface ${className}`}>
      <GestureDetector gesture={drag}>
        {/*
          The bar itself is small, so the touch target is the padded row around
          it rather than the bar — a 4pt handle is accurate to look at and
          nearly impossible to catch.
        */}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Dra ned for å lukke"
          className="items-center pb-1 pt-3">
          <View className="h-1 w-10 rounded-full bg-muted opacity-40" />
        </View>
      </GestureDetector>

      {children}
    </Animated.View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className={`flex-1 justify-end ${backdrop}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lukk"
          className="flex-1"
          onPress={onClose}
        />

        {avoidKeyboard ? (
          <KeyboardAvoidingView
            behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={keyboardVerticalOffset}>
            {surface}
          </KeyboardAvoidingView>
        ) : (
          surface
        )}
      </View>
    </Modal>
  );
}

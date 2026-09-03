import { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const AnimatedKeyboardAvoidingView = Animated.createAnimatedComponent(KeyboardAvoidingView);

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
  surfaceStyle,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height and any other sizing for the sheet surface. */
  className?: string;
  /**
   * Sizing that has to be computed rather than named in a class.
   *
   * For a sheet whose height depends on the keyboard: `behavior: 'padding'`
   * lifts the surface by the keyboard's height, so a surface taller than the
   * space left over is pushed off the top of the screen. A sheet in that
   * position measures the room it has and passes a height here.
   */
  surfaceStyle?: StyleProp<ViewStyle>;
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
    if (visible) offset.set(0);
  }, [offset, visible]);

  const drag = Gesture.Pan()
    .onUpdate((event) => {
      // Downward only: dragging up would lift the sheet off the bottom edge
      // and expose the backdrop beneath it.
      offset.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
        return;
      }
      offset.set(withTiming(0, { duration: DURATION, easing: EASING }));
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
  }));

  const sheetContents = (
    <>
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
    </>
  );

  const surfaceClassName = `rounded-t-3xl bg-canvas ${className}`;

  const surface = avoidKeyboard ? (
    // bg-canvas, the same ground as the screens that get presented as panels —
    // the settings and album editors. `surface` lifted a sheet a shade off black
    // so its edge showed against dark content, but two panel colours in one app
    // reads as an inconsistency rather than as a hierarchy, and these rise over
    // a dimmed photograph, which is the edge.
    <AnimatedKeyboardAvoidingView
      // Animate the keyboard padding with the sheet. Keeping this wrapper
      // stationary left a square black panel behind the rounded surface while
      // Kommentarer was dragged down.
      style={sheetStyle}
      className="rounded-t-3xl bg-canvas"
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}>
      <View className={surfaceClassName} style={surfaceStyle}>
        {sheetContents}
      </View>
    </AnimatedKeyboardAvoidingView>
  ) : (
    <Animated.View style={[sheetStyle, surfaceStyle]} className={surfaceClassName}>
      {sheetContents}
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

        {surface}
      </View>
    </Modal>
  );
}

import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { NativePostButton } from '@/components/native-post-button';
import { usePressPop } from '@/lib/use-press-pop';

export type ClusterAction = {
  key: string;
  /** Spoken label. Always set, even where an icon seems self-evident. */
  label: string;
  systemImage?: SFSymbol;
  /** Text in place of an icon, for the like count. */
  displayLabel?: string;
  tintColor?: string;
  /**
   * Whether the cluster stays open after this action runs.
   *
   * The default is to close, because most of these open something else and the
   * close is the acknowledgement. The heart is the exception: it acts in place,
   * people give and take one back, and closing the row after every tap makes
   * them reopen it to see what they did. Such an action gets its own animation
   * instead — see `pop` in ClusterItem.
   */
  keepsOpen?: boolean;
  onPress: () => void;
};

/**
 * The chrome's own control size — the same default the close, settings, sound
 * and fit buttons use, so the trigger reads as one of them rather than a
 * slightly different button parked next to them.
 */
const SIZE = 44;

/**
 * The space between two controls, exported because it is not only the cluster's.
 *
 * The heart and the comment button are stacked above the trigger by the album
 * screen, and a column spaced differently from the row it opens into reads as
 * two unrelated groups of buttons. One number, used by both.
 */
export const CLUSTER_GAP = 12;

const GAP = CLUSTER_GAP;

/**
 * The square every glyph in this row sits in.
 *
 * With `.buttonStyle(.glass)` the disc is drawn around the label, and nothing
 * applied to the button can change that — not a larger frame, not
 * `.controlSize(.extraLarge)`. So an unboxed row is a row of different-sized
 * buttons: `ellipsis` is wide and a few points tall and came out around 36pt,
 * while `square.and.arrow.up` carries an arrow above its square and came out
 * larger than the compact glyphs beside it.
 *
 * 20pt is what `imageScale(.large)` at font 18 measures for a glyph that fills
 * its square — the figure the chrome buttons arrive at on their own rather than
 * one picked to look right. Boxed to it, every glyph keeps its own drawn size
 * and every disc comes out the same.
 *
 * The buttons still take SIZE for their frame. Two attempts at giving the
 * trigger a frame of its own — 56, then none at all — both moved it off the
 * margin the rest sit on; matching them is the only thing that aligns them.
 */
const GLYPH_BOX = 20;

/** Matches the album's other motion: timed easing, nothing overshoots. */
const DURATION = 260;
const EASING = Easing.out(Easing.cubic);

/** How much later each further-out item starts, as a fraction of the whole. */
const STAGGER = 0.08;

/** Long enough to read as the count changing, short enough not to be a wait. */
const RESIZE = 180;

/**
 * The chrome's controls, collapsed behind one button until asked for.
 *
 * Five circles permanently over someone's photograph is five circles of their
 * photograph they cannot see. Collapsed, the chrome costs one; expanded, the
 * controls slide out from behind the trigger, nearest first, so the movement
 * reads as one object opening rather than five arriving.
 *
 * Liking does not depend on this: a double tap on the photo still toggles the
 * heart, which is the gesture most people use anyway. The heart inside the
 * cluster is the discoverable version of it, not the only one.
 */
export function ActionCluster({
  actions,
  resetKey,
  onOpenChange,
}: {
  actions: ClusterAction[];
  /**
   * Identifies what the cluster is acting on — the post id.
   *
   * Given rather than derived. This used to be a hash of the action list, which
   * looked equivalent and was not: giving the first heart to a photo adds the
   * "see who liked this" action, so the list changed and the cluster shut
   * itself the moment it was used.
   */
  resetKey?: string;
  /** Lets the caller hold surrounding chrome visible while this is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: DURATION, easing: EASING });
    onOpenChange?.(open);
  }, [onOpenChange, open, progress]);

  // A photo change should not leave the previous post's controls hanging open.
  useEffect(() => {
    setOpen(false);
  }, [resetKey]);

  const toggle = useCallback(() => {
    void Haptics.selectionAsync();
    setOpen((value) => !value);
  }, []);

  const run = useCallback((action: ClusterAction) => {
    action.onPress();
    if (!action.keepsOpen) setOpen(false);
  }, []);

  return (
    <View className="flex-row items-center justify-end">
      {actions.map((action, index) => (
        <ClusterItem
          key={action.key}
          action={action}
          index={index}
          count={actions.length}
          progress={progress}
          open={open}
          onPress={run}
        />
      ))}

      {/*
        Half a gap on the left, which is the trigger's share of one.

        Every item carries GAP/2 on each side of itself, so two of them sit a
        full GAP apart. The trigger has no slot and so contributed nothing,
        leaving it half a gap from the item beside it while the items were a
        whole one from each other — most visible against the last action, since
        that is the only pair with the trigger in it.
      */}
      <View style={{ paddingLeft: GAP / 2 }}>
        <NativePostButton
          label={open ? 'Skjul handlinger' : 'Vis handlinger'}
          systemImage={open ? 'xmark' : 'ellipsis'}
          appearance="glass"
          size={SIZE}
          glyphBox={GLYPH_BOX}
          onPress={toggle}
        />
      </View>
    </View>
  );
}

/**
 * One item, sliding out from behind the trigger.
 *
 * The wrapper's width animates while the button inside keeps its full size and
 * stays pinned to the wrapper's right edge. Because the row is right-aligned,
 * zero-width slots stack every button at the trigger's left edge — so growing
 * the slots walks each one out to its place, and no clipping is involved.
 *
 * Nothing is clipped on purpose: the press animation scales the control, and a
 * box sized to hold it at rest would cut the edges off exactly when it is being
 * looked at.
 *
 * Its own component because each item needs its own animated style, and hooks
 * cannot be called in a loop.
 */
function ClusterItem({
  action,
  index,
  count,
  progress,
  open,
  onPress,
}: {
  action: ClusterAction;
  index: number;
  count: number;
  progress: SharedValue<number>;
  /** Gates touches, since an unclipped item is still tappable at opacity 0. */
  open: boolean;
  onPress: (action: ClusterAction) => void;
}) {
  /**
   * The control's own width, measured rather than assumed.
   *
   * Most items are circles, but the heart carries its like count and is a
   * capsule — wider than one circle and of a width that changes with the
   * number. A fixed slot cropped it, so each item reports its size and the slot
   * opens to exactly that.
   */
  const natural = useSharedValue(SIZE);

  /**
   * Whether this item has ever been measured.
   *
   * The first measurement is the truth and must not animate — there is nothing
   * to animate from. Every one after it is a change worth showing: giving a
   * heart turns the circle into a capsule carrying "1", and snapping between
   * the two widths mid-press looked like a glitch rather than a response.
   */
  const measured = useRef(false);

  /** 0 → 1 once, so an item that mounts into an already-open cluster slides. */
  const appear = useSharedValue(0);

  /** The swell on press, for an action that leaves the cluster open. */
  const { style: popStyle, pop } = usePressPop();

  useEffect(() => {
    appear.value = withTiming(1, { duration: DURATION, easing: EASING });
  }, [appear]);

  const style = useAnimatedStyle(() => {
    // Counted from the trigger outwards, so the nearest control leaves first
    // and the furthest arrives last.
    const order = count - 1 - index;
    const start = Math.min(0.4, order * STAGGER);
    const t = interpolate(
      progress.value,
      [start, start + 0.6],
      [0, 1],
      Extrapolation.CLAMP
    );

    // Multiplied, not chosen between: while the cluster opens, `t` governs and
    // `appear` is long since 1. For an item added to an open cluster it is the
    // other way round, and the same expression slides it out.
    const reveal = t * appear.value;

    return {
      width: (natural.value + GAP) * reveal,
      opacity: reveal,
    };
  });

  const press = () => {
    if (action.keepsOpen) pop();
    onPress(action);
  };

  return (
    <Animated.View
      // Closed, the buttons are stacked invisibly over the trigger's left edge.
      // Without this they would still take the taps meant for the trigger,
      // because a view at opacity 0 is transparent, not absent.
      pointerEvents={open ? 'auto' : 'none'}
      style={[style, { height: SIZE, justifyContent: 'center' }]}>
      {/* Pinned to the wrapper's right edge and absolutely positioned, so it
          keeps its natural width whatever the wrapper is currently doing, and
          overflows its slot freely while opening or being pressed. */}
      <Animated.View
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (measured.current) {
            natural.value = withTiming(width, { duration: RESIZE, easing: EASING });
          } else {
            natural.value = width;
            measured.current = true;
          }
        }}
        style={[popStyle, { position: 'absolute', right: GAP / 2 }]}>
        <NativePostButton
          label={action.label}
          systemImage={action.systemImage}
          displayLabel={action.displayLabel}
          tintColor={action.tintColor}
          appearance="glass"
          glyphBox={GLYPH_BOX}
          onPress={press}
        />
      </Animated.View>
    </Animated.View>
  );
}

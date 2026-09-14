import { Host } from '@expo/ui';
import { Button, Image, Text as SwiftText, VStack } from '@expo/ui/swift-ui';
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
  scaleEffect,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

export type NativePostButtonProps = {
  label: string;
  onPress: () => void;
  systemImage?: SFSymbol;
  /** Short visible text when the accessibility label is more descriptive. */
  displayLabel?: string;
  /**
   * Put the value under the glyph instead of beside it.
   *
   * Turns the control into an upright capsule. Worth it for a value that
   * changes — a heart and its count read as one object stacked, where side by
   * side the button grows sideways and stops matching the circles it is aligned
   * with every time the number gains a digit.
   */
  stackValue?: boolean;
  disabled?: boolean;
  appearance?: 'filled' | 'glass' | 'plain';
  tintColor?: string;
  foregroundColor?: string;
  size?: number;
  /**
   * Forces the glyph into a square box of this many points.
   *
   * With `.buttonStyle(.glass)` the disc is drawn around the label's own
   * bounding box; `size` below only reserves space *outside* the control, so a
   * bigger frame leaves air rather than a bigger button, and the control size
   * barely moves a glass disc either. The box is the thing that decides.
   *
   * That is fine for a glyph that fills its square — the arrows, the sliders —
   * but `ellipsis` is wide and a few points tall, so its disc came out around
   * 36pt where those drew about 45 at identical settings. Given a square box
   * the size of a full-height glyph, the dots stay their natural size and the
   * disc matches the buttons beside it.
   */
  glyphBox?: number;
  /**
   * Shrink the whole control, glyph and glass together.
   *
   * The lever below the glyph box's floor. A glass disc is drawn around the
   * label plus the control's own padding, and that padding is roughly 25pt at
   * this control size — so no box, however small, brings the disc under about
   * thirty, and a smaller box only crowds a full-size glyph against the edge.
   * Scaling takes the finished control down as one piece, which is what "the
   * same button, smaller" actually means.
   *
   * `scaleEffect` does not change the space the control occupies, so `size`
   * should be set to the scaled result: the disc then fills its frame instead
   * of floating inside a larger one.
   */
  scale?: number;
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
  glyphBox,
  scale,
  stackValue = false,
  contentAlignment = 'center',
  contentInset = 0,
}: NativePostButtonProps) {
  // An icon with a value beside it needs the label shown as well as the glyph,
  // and a capsule to sit in rather than a circle sized for one thing. Nothing
  // asks for this now — the heart did until its count moved underneath it — but
  // it is what `displayLabel` alongside a `systemImage` means.
  const withValue = !!systemImage && !!displayLabel;

  const edgePadding =
    contentAlignment === 'leading'
      ? padding({ leading: contentInset })
      : contentAlignment === 'trailing'
        ? padding({ trailing: contentInset })
        : null;

  /**
   * A boxed glyph as a custom label, rather than the `systemImage` shorthand.
   *
   * `Button` takes children in place of its label, which is the only way to get
   * a modifier onto the glyph itself — everything in `modifiers` below applies
   * to the button, outside the glass, where it cannot change how the glass is
   * sized.
   */
  const glyphColor = foregroundColor ?? tintColor;

  /**
   * How a glyph is drawn, wherever it is drawn.
   *
   * The same two modifiers the shorthand label gets below. A custom label does
   * not inherit them — they are applied to the button, and the button is not
   * what draws the child — so without repeating them here a boxed glyph came
   * out at SwiftUI's default body size: noticeably smaller and lighter than the
   * identical icon on a button that had no box.
   */
  const glyphDrawing = [font({ size: 18, weight: 'semibold' }), imageScale('large')];

  /**
   * The glyph over its value, as one label.
   *
   * A VStack rather than SwiftUI's own Label, which only ever lays the two out
   * in a line. Both take the same colour: the count is the heart's own number,
   * so a white numeral under a red heart would read as belonging to something
   * else.
   */
  const stackedLabel =
    stackValue && systemImage && displayLabel ? (
      <VStack spacing={1} alignment="center">
        <Image
          systemName={systemImage}
          color={glyphColor}
          modifiers={[
            ...glyphDrawing,
            frame({ width: glyphBox ?? 20, height: glyphBox ?? 20 }),
          ]}
        />
        <SwiftText
          modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(glyphColor)]}>
          {displayLabel}
        </SwiftText>
      </VStack>
    ) : null;

  const boxedGlyph =
    !stackedLabel && glyphBox && systemImage && !withValue ? (
      <Image
        systemName={systemImage}
        color={glyphColor}
        // Sized last: the drawing modifiers decide how big the symbol is, this
        // decides how big it reports itself as — which is what the glass is
        // then drawn around.
        modifiers={[...glyphDrawing, frame({ width: glyphBox, height: glyphBox })]}
      />
    ) : null;

  /** Whichever custom label is in play; either one replaces `label`. */
  const child = stackedLabel ?? boxedGlyph;

  return (
    <Host matchContents>
      <Button
        label={child ? undefined : (displayLabel ?? label)}
        systemImage={child ? undefined : systemImage}
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
          buttonBorderShape(withValue || stackedLabel ? 'capsule' : 'circle'),
          ...(child
            ? []
            : [
                labelStyle(
                  withValue ? 'titleAndIcon' : systemImage ? 'iconOnly' : 'titleOnly'
                ),
                imageScale('large'),
                font({ size: systemImage ? 18 : 16, weight: 'semibold' }),
              ]),
          ...(edgePadding ? [edgePadding] : []),
          /*
           * The frame every glass circle shares, boxed glyph or not.
           *
           * It is what makes a column of these line up, and it only works
           * because they all get the same one. Dropping it for a boxed glyph
           * looked right — the box decides the disc, so why frame it — but
           * without a frame the host reports SwiftUI's intrinsic button size,
           * which carries its own hit-target padding and centres the disc
           * inside it. That put the trigger about 7pt in from the margin the
           * others were flush to. A 56 here did the same thing for the same
           * reason, only further.
           *
           * Height only when there is a value: a fixed width would either crop
           * "12" or leave a gap around "1".
           */
          // A stacked label sizes the capsule itself, in both directions; the
          // width still has to be pinned so the column it sits in stays aligned.
          stackedLabel
            ? frame({ width: size })
            : withValue
              ? frame({ height: size })
              : frame({ width: size, height: size, alignment: contentAlignment }),
          // After the frame, so it scales the laid-out control rather than
          // being scaled by it.
          ...(scale !== undefined ? [scaleEffect(scale)] : []),
          tint(tintColor),
          ...(foregroundColor ? [foregroundStyle(foregroundColor)] : []),
          accessibilityLabel(label),
          disabledModifier(disabled),
        ]}>
        {child ?? undefined}
      </Button>
    </Host>
  );
}

import Animated from 'react-native-reanimated';

import { NativePostButton } from '@/components/native-post-button';
import { usePressPop } from '@/lib/use-press-pop';

/** The heart, and the count it stands for, in one tint. */
const LIKED = '#ff3b30';
const UNLIKED = '#ffffff';

/**
 * The heart, with its count inside it and underneath it.
 *
 * One control rather than a button with a caption: the count is the heart's own
 * number, so it takes the heart's colour and sits on the heart's glass. Stacked
 * rather than side by side, because a capsule that grows sideways stops matching
 * the circles it is aligned with the moment the number gains a digit — upright,
 * only the height moves, and the chrome is anchored to the bottom of the screen
 * so the glyph rises rather than the column shifting.
 *
 * Its own component for the swell on press. Every other chrome button opens
 * something, and the thing opening is the acknowledgement; this one acts in
 * place, so it has to say so itself.
 */
export function LikeButton({
  liked,
  count,
  onPress,
}: {
  liked: boolean;
  count: number;
  onPress: () => void | Promise<void>;
}) {
  const { style, pop } = usePressPop();
  const tint = liked ? LIKED : UNLIKED;

  return (
    <Animated.View style={style}>
      <NativePostButton
        /*
         * The count belongs in the label as well as on screen.
         *
         * `displayLabel` is what gets drawn; this is what gets spoken, and the
         * two are different sentences. Without the number here the one thing
         * the button reports would be missing the one thing it displays.
         */
        label={
          count > 0
            ? `${liked ? 'Fjern hjerte' : 'Gi hjerte'}, ${count} hjerter`
            : liked
              ? 'Fjern hjerte'
              : 'Gi hjerte'
        }
        systemImage={liked ? 'heart.fill' : 'heart'}
        // Dropped at zero, so an unliked photo is a circle rather than a
        // capsule reading "0".
        displayLabel={count > 0 ? String(count) : undefined}
        stackValue
        // Both halves of the stacked label are drawn in this colour, so the
        // numeral turns red with the heart rather than staying white under it
        // and reading as something else's number.
        //
        // Deliberately not also passed as `foregroundColor`: that would put a
        // `foregroundStyle` on the button itself, and on a glass style that can
        // tint the material as well as its contents. The glass should stay the
        // same glass as every button beside it — only the heart goes red.
        tintColor={tint}
        appearance="glass"
        onPress={() => {
          pop();
          void onPress();
        }}
      />
    </Animated.View>
  );
}

import { Icon } from '@/components/icon';

/**
 * A die showing its face.
 *
 * This is the iOS path: SF Symbols has a glyph per face, so nothing needs
 * drawing and it matches the surrounding chrome by construction.
 *
 * Android and the web resolve dice.android.tsx / dice.web.tsx instead, which
 * draw the pips. Material Symbols has only one generic `casino` die, so every
 * rating rendered as the same five pips there.
 */
export function Dice({ face, size, color }: { face: number; size: number; color: string }) {
  const clamped = Math.min(6, Math.max(1, Math.round(face)));

  return (
    <Icon
      name={`die.face.${clamped}.fill` as 'die.face.1.fill'}
      size={size}
      tintColor={color}
    />
  );
}

import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

/** Pip positions per face, on a 3×3 grid in a 100×100 box. */
const SPOTS = [30, 50, 70] as const;

const FACES: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/**
 * A die drawn as a filled rounded square with its pips punched out.
 *
 * Stands in for SF Symbols' die.face.N.fill, which exists only on Apple
 * platforms. Material Symbols offers a single generic `casino` die, so mapping
 * the six faces to it made every rating render as the same five pips — the
 * rating was there but unreadable.
 *
 * The pips are a mask rather than a second fill, so they are transparent and
 * read correctly over a photo, the way the filled SF glyph does. Drawing this
 * by hand also keeps the proportions close to the iOS version instead of
 * swapping in a differently-weighted icon set.
 */
export function Dice({ face, size, color }: { face: number; size: number; color: string }) {
  const clamped = Math.min(6, Math.max(1, Math.round(face)));
  const pips = FACES[clamped];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <Mask id="pips">
          {/* White keeps the body, black removes it: the pips become holes. */}
          <Rect x="0" y="0" width="100" height="100" fill="#ffffff" />
          {pips.map(([column, row]) => (
            <Circle
              key={`${column}-${row}`}
              cx={SPOTS[column]}
              cy={SPOTS[row]}
              r="9"
              fill="#000000"
            />
          ))}
        </Mask>
      </Defs>

      <Rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="22"
        ry="22"
        fill={color}
        mask="url(#pips)"
      />
    </Svg>
  );
}

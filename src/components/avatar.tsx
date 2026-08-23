import { Image } from 'expo-image';
import { Text, View } from 'react-native';

/**
 * Placeholder faces, one per album accent.
 *
 * Deep grounds with a light letter rather than the accents at full strength:
 * these sit on a near-black canvas beside photography, and six saturated dots
 * in a friends list would pull harder than the photos they sit next to.
 */
const PLACEHOLDERS = [
  { ground: '#2A1F4D', letter: '#C4A9FF' },
  { ground: '#45182F', letter: '#FF9EC9' },
  { ground: '#16304F', letter: '#8FBEFF' },
  { ground: '#12403A', letter: '#7BE0D4' },
  { ground: '#452317', letter: '#FFB199' },
  { ground: '#471A24', letter: '#FF98AC' },
] as const;

/**
 * Pick a face from a stable seed.
 *
 * Seeded on the account id, not the name: someone who changes their display
 * name keeps the face their friends recognise them by. A plain multiplicative
 * hash is enough — this only has to be stable and evenly spread, never
 * unguessable.
 */
function faceFor(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return PLACEHOLDERS[hash % PLACEHOLDERS.length];
}

/** The letter shown when there is no photo. */
function initialOf(name: string): string {
  // Array.from, so a name starting with an emoji or a surrogate pair yields
  // the whole character instead of half of one.
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/**
 * Someone's face: their photo, or a placeholder standing in for it.
 *
 * The placeholder carries their initial on a colour of their own, so a list of
 * people without photos still reads as a list of different people. The flat
 * grey circle it replaces made every one of them look like the same absence.
 */
export function Avatar({
  url,
  name,
  seed,
  size = 44,
  ringWidth = 0,
}: {
  url: string | null | undefined;
  /** Display name or username — only its first character is shown. */
  name: string;
  /** Account id, so the colour survives a rename. Falls back to the name. */
  seed?: string;
  size?: number;
  /** Pro's monochrome frame. Zero leaves the disc unframed. */
  ringWidth?: number;
}) {
  const frame =
    ringWidth > 0
      ? { borderWidth: ringWidth, borderColor: '#ffffff' as const }
      : undefined;

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        cachePolicy="memory-disk"
        style={{ width: size, height: size, borderRadius: size / 2, ...frame }}
      />
    );
  }

  const face = faceFor(seed || name);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: face.ground,
        alignItems: 'center',
        justifyContent: 'center',
        ...frame,
      }}>
      <Text
        style={{
          color: face.letter,
          // Proportional, so the same component works at 22pt in a member row
          // and at 96pt on a profile without the letter swimming in the disc.
          fontSize: Math.round(size * 0.42),
          lineHeight: Math.round(size * 0.5),
          fontWeight: '500',
        }}>
        {initialOf(name)}
      </Text>
    </View>
  );
}

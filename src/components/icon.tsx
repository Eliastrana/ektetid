import { SymbolView, type AndroidSymbol, type SymbolViewProps } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * SF Symbol names paired with their Material Symbols equivalents.
 *
 * SF Symbols exist only on Apple platforms. expo-symbols renders a Material
 * Symbols glyph everywhere else, but only when handed the object form of
 * `name` — given a plain string it quietly falls through to `fallback`, which
 * is why every icon in the web build was invisible.
 *
 * Anything missing here still renders correctly on iOS and falls back
 * elsewhere, so an unmapped icon degrades rather than breaking.
 */
const MATERIAL: Partial<Record<SFSymbol, AndroidSymbol>> = {
  'arrow.triangle.2.circlepath.camera.fill': 'flip_camera_ios',
  'bubble.left': 'chat_bubble',
  'bubble.left.fill': 'chat_bubble',
  'camera.fill': 'photo_camera',
  checkmark: 'check',
  'chevron.left': 'chevron_left',
  'chevron.right': 'chevron_right',
  'clock.arrow.circlepath': 'history',
  ellipsis: 'more_horiz',
  'exclamationmark.triangle.fill': 'warning',
  eye: 'visibility',
  'eye.fill': 'visibility',
  'gearshape.fill': 'settings',
  heart: 'favorite',
  'heart.fill': 'favorite',
  'line.3.horizontal': 'menu',
  'map.fill': 'map',
  memories: 'auto_awesome',
  message: 'chat',
  pencil: 'edit',
  'person.2.fill': 'group',
  'person.crop.square': 'account_box',
  'photo.on.rectangle': 'photo_library',
  'photo.on.rectangle.angled': 'photo_library',
  'play.fill': 'play_arrow',
  plus: 'add',
  'rectangle.stack.fill': 'collections',
  'slider.horizontal.3': 'tune',
  'square.and.arrow.down': 'download',
  'square.grid.2x2.fill': 'grid_view',
  trash: 'delete',
  xmark: 'close',
};

// Every die face is one Material glyph; the pip count has no equivalent.
for (const face of [1, 2, 3, 4, 5, 6] as const) {
  MATERIAL[`die.face.${face}.fill`] = 'casino';
}

/**
 * An SF Symbol that also draws on Android and the web.
 *
 * A thin wrapper over SymbolView whose only job is supplying the cross-platform
 * name. Call sites name the icon the way iOS does — the mapping lives here, so
 * adding a platform never means touching them again.
 */
export function Icon({
  name,
  ...rest
}: Omit<SymbolViewProps, 'name'> & { name: SFSymbol }) {
  const material = MATERIAL[name];

  return (
    <SymbolView
      name={material ? { ios: name, android: material, web: material } : name}
      {...rest}
    />
  );
}

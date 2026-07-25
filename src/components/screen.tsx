import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom';

type Props = {
  children: ReactNode;
  className?: string;
  edges?: Edge[];
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
};

/**
 * Safe-area container that actually accepts Tailwind classes.
 *
 * NativeWind only maps className onto React Native's own components, so
 * SafeAreaView from react-native-safe-area-context silently drops it — padding
 * and flex classes on it do nothing at all. Applying the insets to a plain View
 * keeps styling in one system.
 */
export function Screen({
  children,
  className,
  edges = ['top', 'bottom'],
  pointerEvents,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={className}
      pointerEvents={pointerEvents}
      style={{
        paddingTop: edges.includes('top') ? insets.top : 0,
        paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
      }}>
      {children}
    </View>
  );
}

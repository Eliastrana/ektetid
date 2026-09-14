import { Text, View } from 'react-native';
import { Icon } from '@/components/icon';

/**
 * A human-facing error state, deliberately separate from raw developer output.
 * Technical details stay in logs; the app shows a calm message with one clear
 * visual cue instead of printing red text into an otherwise finished screen.
 */
export function ErrorNotice({ message }: { message: string }) {
  return (
    <View
      accessible
      accessibilityRole="alert"
      className="flex-row items-start gap-3 rounded-tile bg-surface-raised px-4 py-3">
      <Icon
        name="exclamationmark.triangle.fill"
        size={17}
        tintColor="#ffcc00"
        fallback={<Text className="text-base">!</Text>}
      />
      <Text selectable className="flex-1 text-sm leading-5 text-ink">
        {message}
      </Text>
    </View>
  );
}

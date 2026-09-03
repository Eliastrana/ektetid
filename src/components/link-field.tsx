import { Text, TextInput, View } from 'react-native';

import { isValidLink, linkLabel, normaliseLink } from '@/lib/link';

/**
 * The link row, for the composer and the post editor.
 *
 * Kept as raw text in the caller's state rather than as a normalised URL, so
 * what someone typed stays on screen while they type it. Normalising on every
 * keystroke would rewrite "ekt" to "https://ekt" under the cursor.
 *
 * The hint below does the reassuring: it shows the host the button will carry
 * once the value is usable, which is both a confirmation and a preview of what
 * a reader will see.
 */
export function LinkField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const trimmed = value.trim();
  const valid = isValidLink(trimmed);
  const normalised = valid ? normaliseLink(trimmed) : null;

  return (
    <View className="rounded-tile bg-glass p-4">
      <Text className="text-base text-ink">Lenke</Text>
      <Text className="mt-0.5 text-xs text-muted">
        Vises som en knapp på innlegget, og åpnes i appen
      </Text>

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="ektetid.no"
        placeholderTextColor="#6b6f76"
        selectionColor="#ffffff"
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType="url"
        inputMode="url"
        style={{ paddingHorizontal: 16 }}
        className="mt-3 h-12 rounded-xl bg-surface-raised text-base leading-none text-ink"
      />

      {trimmed.length > 0 ? (
        <Text className={`mt-2 text-xs ${valid ? 'text-muted' : 'text-alert'}`}>
          {valid && normalised
            ? `Knappen viser ${linkLabel(normalised)}`
            : 'Må være en nettadresse som starter med http eller https.'}
        </Text>
      ) : null}
    </View>
  );
}

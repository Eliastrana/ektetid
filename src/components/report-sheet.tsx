import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { Screen } from '@/components/screen';
import { ErrorNotice } from '@/components/error-notice';
import type { ReportReason } from '@/lib/database.types';
import { REPORT_REASONS, blockAndReport, type ReportTarget } from '@/lib/moderation';

type Props = {
  selfId: string;
  target: ReportTarget | null;
  onClose: () => void;
  onDone: () => void;
};

/**
 * Report, with the option to block in the same gesture.
 *
 * Apple expects reporting and blocking to both be reachable from the content
 * itself, not buried in settings — someone who has just seen something
 * upsetting should not have to go looking.
 */
export function ReportSheet({ selfId, target, onClose, onDone }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || !target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await blockAndReport(selfId, target, reason, details, alsoBlock);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReason(null);
      setDetails('');
      onDone();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Klarte ikke å sende rapporten. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={!!target} onClose={onClose} backdrop="bg-black/60" avoidKeyboard>
      <Screen className="px-5" edges={['bottom']}>
        <View className="flex-row items-center justify-between py-4">
          <Text className="text-xl text-ink">Rapporter innhold</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lukk"
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-glass">
            <Icon
              name="xmark"
              size={15}
              tintColor="#ffffff"
              fallback={<Text className="text-base text-ink">✕</Text>}
            />
          </Pressable>
        </View>

        <Text className="mb-3 text-sm text-muted">Hva er galt?</Text>
        <View className="flex-row flex-wrap gap-2">
          {REPORT_REASONS.map((option) => {
            const selected = option.value === reason;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  void Haptics.selectionAsync();
                  setReason(option.value);
                }}
                className={`rounded-full px-4 py-2 ${selected ? 'bg-ink' : 'bg-glass'}`}>
                <Text className={selected ? 'text-canvas' : 'text-ink'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Vil du utdype? (valgfritt)"
          placeholderTextColor="#6b6f76"
          selectionColor="#ffffff"
          multiline
          maxLength={1000}
          style={{ paddingHorizontal: 16, paddingVertical: 12 }}
          className="mt-4 min-h-20 rounded-tile bg-glass text-base text-ink"
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: alsoBlock }}
          onPress={() => {
            void Haptics.selectionAsync();
            setAlsoBlock((value) => !value);
          }}
          className="mt-4 flex-row items-center gap-3">
          <View
            className={`h-6 w-6 items-center justify-center rounded-md ${alsoBlock ? 'bg-ink' : 'bg-glass-strong'}`}>
            {alsoBlock ? (
              <Icon
                name="checkmark"
                size={14}
                tintColor="#000000"
                fallback={<Text className="text-sm text-canvas">✓</Text>}
              />
            ) : null}
          </View>
          <Text className="flex-1 text-sm text-ink">
            Blokker denne personen også
          </Text>
        </Pressable>

        {error ? (
          <View className="mt-3">
            <ErrorNotice message={error} />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!reason || busy}
          onPress={submit}
          className={`mt-5 h-14 items-center justify-center rounded-tile active:opacity-80 ${
            reason ? 'bg-alert' : 'bg-surface-raised'
          }`}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className={`text-base ${reason ? 'text-ink' : 'text-muted'}`}>
              Send rapport
            </Text>
          )}
        </Pressable>

        <Text className="mb-2 mt-3 text-center text-xs text-muted">
          Vi ser på alle rapporter innen 24 timer.
        </Text>
      </Screen>
    </BottomSheet>
  );
}

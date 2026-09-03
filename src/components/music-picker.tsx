import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/bottom-sheet';
import { NativePostButton } from '@/components/native-post-button';
import { Screen } from '@/components/screen';
import { errorMessage } from '@/lib/errors';
import {
  fetchMusicSuggestions,
  searchMusic,
  type MusicSuggestions,
  type MusicTrack,
} from '@/lib/music';

/**
 * Long enough that typing a title does not spend a request per letter.
 *
 * Apple allows roughly twenty searches a minute per address, and a search on
 * every keystroke would burn that in one word.
 */
const DEBOUNCE_MS = 350;

/**
 * How tall the sheet gets when nothing is competing for the screen.
 *
 * A search sheet wants to be tall — the whole point is a list of results — so
 * this is generous, and the keyboard shortens it rather than pushing it.
 */
const MAX_FRACTION = 0.72;

/**
 * Space left above the sheet when the keyboard has squeezed it.
 *
 * Enough to clear the status bar and to still read as a sheet rather than a
 * screen, and no more — every point here is a point the results list loses.
 */
const TOP_MARGIN = 44;

/**
 * Search Apple's catalogue and pick a thirty-second snippet.
 *
 * Only tracks with a preview are offered — a result we cannot play is a result
 * that would attach silence, which is worse than not offering it.
 */
export function MusicPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (track: MusicTrack) => void;
}) {
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<MusicTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  /**
   * What to offer before anyone types.
   *
   * Loaded once per opening rather than on mount: the sheet is rendered by the
   * form whether or not it is showing, and neither Apple nor our own database
   * should be asked anything until someone actually looks.
   */
  const [suggestions, setSuggestions] = useState<MusicSuggestions | null>(null);

  /** The in-flight request, so a slower earlier search cannot overwrite a newer one. */
  const inFlight = useRef<AbortController | null>(null);

  /**
   * The sheet's height, measured against the keyboard rather than fixed.
   *
   * `avoidKeyboard` lifts the surface by the keyboard's height, so a fixed
   * height taller than what is left over goes off the top of the screen — at
   * 72% of an iPhone 12 that is 608pt against roughly 508pt of free space, and
   * the title and the search field were the part that disappeared. Shrinking
   * instead keeps the field where the eye already is and gives the list
   * whatever room remains.
   */
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    // `will` events on iOS so the height changes with the keyboard rather than
    // after it; Android only emits `did`.
    const isIOS = process.env.EXPO_OS === 'ios';
    const shown = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setKeyboard(event.endCoordinates.height)
    );
    const hidden = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboard(0)
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  /** Whether the list is answering a query or offering suggestions. */
  const searching = term.trim().length > 0;

  const sheetHeight = Math.min(
    screenHeight * MAX_FRACTION,
    screenHeight - keyboard - TOP_MARGIN
  );

  useEffect(() => {
    if (!visible) {
      setTerm('');
      setRows([]);
      setError(null);
      setSearched(false);
      return;
    }

    const controller = new AbortController();
    void fetchMusicSuggestions({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSuggestions(result);
      })
      // A missing suggestion list is not worth a message: the search box is
      // still there and still the point of the sheet.
      .catch(() => {});
    return () => controller.abort();
  }, [visible]);

  useEffect(() => {
    const query = term.trim();
    if (!query) {
      inFlight.current?.abort();
      setRows([]);
      setBusy(false);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setBusy(true);
      setError(null);

      void searchMusic(query, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) return;
          setRows(results);
          setSearched(true);
        })
        .catch((caught) => {
          // An aborted request is this component's own doing, not a failure.
          if (controller.signal.aborted) return;
          setError(errorMessage(caught, 'Klarte ikke å søke etter musikk.'));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => () => inFlight.current?.abort(), []);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      surfaceStyle={{ height: sheetHeight }}
      avoidKeyboard
      // Screen already reserves the home-indicator inset inside the sheet.
      // Subtract it from iOS' keyboard displacement, or the same inset is
      // counted twice as an empty band above the keyboard.
      keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? -insets.bottom : 0}>
      <Screen className="flex-1 px-5" edges={['bottom']}>
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-xl text-ink">Legg til musikk</Text>
          <NativePostButton
            label="Lukk"
            systemImage="xmark"
            appearance="glass"
            onPress={onClose}
          />
        </View>

        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Søk etter sang eller artist"
          placeholderTextColor="#6b6f76"
          selectionColor="#ffffff"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ paddingHorizontal: 16 }}
          className="h-12 rounded-tile bg-glass text-base leading-none text-ink"
        />

        {error ? <Text className="mt-3 text-sm text-alert">{error}</Text> : null}

        {/*
          A heading only over the suggestions. Search results need no label —
          they are plainly the answer to what was typed — but a list appearing
          unbidden has to say where it came from, and "popular here" is a
          different claim from "popular everywhere".
        */}
        {!searching && suggestions && suggestions.tracks.length > 0 ? (
          <Text className="mb-1 mt-4 text-sm text-muted">
            {suggestions.source === 'community'
              ? 'Populært i EkteTid'
              : 'På topplisten nå'}
          </Text>
        ) : null}

        <FlatList
          className="mt-3 flex-1"
          data={searching ? rows : (suggestions?.tracks ?? [])}
          keyExtractor={(track) => String(track.trackId)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16, gap: 8 }}
          ListEmptyComponent={
            busy || (!searching && !suggestions) ? (
              <View className="py-10">
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : searched ? (
              <Text className="py-10 text-center text-sm text-muted">
                Ingen treff med lydutdrag.
              </Text>
            ) : (
              <Text className="py-10 text-center text-sm text-muted">
                Utdragene er 30 sekunder, hentet fra Apple.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Velg ${item.title} av ${item.artist}`}
              onPress={() => {
                void Haptics.selectionAsync();
                onPick(item);
              }}
              className="flex-row items-center gap-3 rounded-tile bg-glass p-2 active:opacity-70">
              {item.artworkUrl ? (
                <Image
                  source={{ uri: item.artworkUrl }}
                  style={{ width: 48, height: 48, borderRadius: 6 }}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View className="h-12 w-12 rounded-md bg-surface-raised" />
              )}
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-base text-ink">
                  {item.title}
                </Text>
                <Text numberOfLines={1} className="text-sm text-muted">
                  {item.artist}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </Screen>
    </BottomSheet>
  );
}

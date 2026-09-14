import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Avatar } from '@/components/avatar';
import { Screen } from '@/components/screen';
import { ErrorNotice } from '@/components/error-notice';
import type { Profile } from '@/lib/database.types';
import {
  acceptFriendRequest,
  listFriendships,
  listFriendSuggestions,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
  type FriendRequest,
  type FriendSuggestion,
} from '@/lib/friends';

type Row =
  | { kind: 'header'; title: string }
  | { kind: 'friendship'; item: FriendRequest }
  | { kind: 'suggestion'; item: FriendSuggestion }
  | { kind: 'result'; item: Profile };

export default function FriendsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [friendships, setFriendships] = useState<FriendRequest[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selfId) return;
    try {
      const [nextFriendships, nextSuggestions] = await Promise.all([
        listFriendships(selfId),
        listFriendSuggestions(),
      ]);
      setFriendships(nextFriendships);
      setSuggestions(nextSuggestions);
      setError(null);
    } catch {
      setError('Klarte ikke å hente vennene dine.');
    } finally {
      setLoading(false);
    }
  }, [selfId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced so a fast typist does not fire a query per keystroke.
  useEffect(() => {
    if (!selfId) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchProfiles(term, selfId)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selfId]);

  const act = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      setBusyId(id);
      setError(null);
      try {
        await fn();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      } catch {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError('Noe gikk galt. Prøv igjen.');
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  if (!selfId) return null;

  const incoming = friendships.filter((f) => !f.outgoing && f.status === 'pending');
  const outgoing = friendships.filter((f) => f.outgoing && f.status === 'pending');
  const accepted = friendships.filter((f) => f.status === 'accepted');
  const knownIds = new Set(friendships.map((f) => f.profile.id));

  const rows: Row[] = [];
  if (results.length) {
    rows.push({ kind: 'header', title: 'Søkeresultat' });
    results.forEach((item) => rows.push({ kind: 'result', item }));
  }
  if (incoming.length) {
    rows.push({ kind: 'header', title: 'Vil bli venn med deg' });
    incoming.forEach((item) => rows.push({ kind: 'friendship', item }));
  }
  if (accepted.length) {
    rows.push({ kind: 'header', title: `Venner (${accepted.length})` });
    accepted.forEach((item) => rows.push({ kind: 'friendship', item }));
  }
  if (!query.trim() && suggestions.length) {
    rows.push({ kind: 'header', title: 'Venner av venner' });
    suggestions.forEach((item) => rows.push({ kind: 'suggestion', item }));
  }
  if (outgoing.length) {
    rows.push({ kind: 'header', title: 'Forespørsler sendt' });
    outgoing.forEach((item) => rows.push({ kind: 'friendship', item }));
  }

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['bottom']}>
        <View className="px-5 pt-4">
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Søk etter brukernavn"
            placeholderTextColor="#6b6f76"
            selectionColor="#ffffff"
            style={{ paddingHorizontal: 16 }}
            className="h-12 rounded-tile bg-glass text-base leading-none text-ink"
          />
          {error ? (
            <View className="mt-3">
              <ErrorNotice message={error} />
            </View>
          ) : null}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(row, i) => {
            if (row.kind === 'header') return `h-${row.title}-${i}`;
            const id =
              row.kind === 'result' || row.kind === 'suggestion'
                ? row.item.id
                : row.item.profile.id;
            return `${row.kind}-${id}`;
          }}
          contentContainerClassName="px-5 pb-8 pt-2"
          ListEmptyComponent={
            loading ? (
              <View className="items-center py-16">
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : (
              <View className="items-center gap-2 py-16">
                <Text className="text-base text-ink">Ingen venner ennå</Text>
                <Text className="text-center text-sm text-muted">
                  Søk etter brukernavnet til noen du kjenner.
                </Text>
              </View>
            )
          }
          renderItem={({ item: row }) => {
            if (row.kind === 'header') {
              return (
                <Text className="mb-2 mt-5 text-sm text-muted">{row.title}</Text>
              );
            }

            const profile =
              row.kind === 'result' || row.kind === 'suggestion'
                ? row.item
                : row.item.profile;
            const busy = busyId === profile.id;

            return (
              <View className="mb-2 flex-row items-center gap-3 rounded-tile bg-glass p-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Se profilen til ${profile.username}`}
                  onPress={() => router.push(`/profil/${profile.id}`)}
                  className="flex-1 flex-row items-center gap-3 active:opacity-70">
                  <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} seed={profile.id} />
                  <View className="flex-1">
                    <Text className="text-base text-ink">
                      {profile.display_name ?? profile.username}
                    </Text>
                    <Text className="text-xs text-muted">@{profile.username}</Text>
                    {row.kind === 'suggestion' ? (
                      <Text className="mt-0.5 text-xs text-muted">
                        {row.item.mutualCount}{' '}
                        {row.item.mutualCount === 1 ? 'felles venn' : 'felles venner'}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : row.kind === 'result' || row.kind === 'suggestion' ? (
                  knownIds.has(profile.id) ? (
                    <Text className="text-xs text-muted">Sendt</Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        act(profile.id, () => sendFriendRequest(selfId, profile.id))
                      }
                      className="rounded-full bg-ink px-4 py-2 active:opacity-80">
                      <Text className="text-sm text-canvas">Legg til</Text>
                    </Pressable>
                  )
                ) : row.item.status === 'pending' && !row.item.outgoing ? (
                  <View className="flex-row gap-2">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        act(profile.id, () => acceptFriendRequest(profile.id, selfId))
                      }
                      className="rounded-full bg-ink px-4 py-2 active:opacity-80">
                      <Text className="text-sm text-canvas">Godta</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => act(profile.id, () => removeFriendship(selfId, profile.id))}
                      className="rounded-full px-4 py-2 active:opacity-70">
                      <Text className="text-sm text-ink">Avslå</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Fjern ${profile.username}`}
                    onPress={() => act(profile.id, () => removeFriendship(selfId, profile.id))}
                    className="rounded-full px-4 py-2 active:opacity-70">
                    <Text className="text-sm text-muted">
                      {row.item.status === 'pending' ? 'Avbryt' : 'Fjern'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      </Screen>
    </View>
  );
}

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import {
  addMember,
  deleteAlbum,
  deletePost,
  fetchAlbumAdmin,
  listInvitableFriends,
  removeMember,
  reorderAlbum,
  updateAlbum,
  type AdminPost,
  type AlbumAdmin,
} from '@/lib/album-admin';
import { errorMessage } from '@/lib/errors';
import type { Profile } from '@/lib/database.types';

type Friend = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export default function EditAlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;

  const [album, setAlbum] = useState<AlbumAdmin | null>(null);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [savedField, setSavedField] = useState<'title' | 'description' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !selfId) return;
    try {
      const data = await fetchAlbumAdmin(id, selfId);
      setAlbum(data);
      setPosts(data.posts);
      setTitle(data.title);
      setDescription(data.description ?? '');
      setDirtyOrder(false);
      if (data.isOwner) setFriends(await listInvitableFriends(id, selfId));
    } catch (caught) {
      setError(errorMessage(caught, 'Klarte ikke å hente albumet.'));
    } finally {
      setLoading(false);
    }
  }, [id, selfId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      } catch (caught) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(errorMessage(caught, 'Noe gikk galt.'));
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  /** Reordering is local until saved, so a long list is not a write per tap. */
  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= posts.length) return;
    void Haptics.selectionAsync();
    setPosts((current) => {
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
    setDirtyOrder(true);
  }

  function confirmDeletePost(post: AdminPost) {
    Alert.alert('Slette bildet?', 'Bildet fjernes fra albumet for godt.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett',
        style: 'destructive',
        onPress: () => void run(() => deletePost(post)),
      },
    ]);
  }

  function confirmInvite(friend: Friend) {
    if (!id || !selfId) return;
    Alert.alert(
      `Dele med ${friend.display_name ?? friend.username}?`,
      // The consequence is not reversible, so it is stated before the tap
      // rather than discovered afterwards.
      'De kan legge til, endre og slette bilder i albumet. Albumet blir også synlig for vennene deres, også bildene som allerede ligger her.',
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Del album', onPress: () => void run(() => addMember(id, friend.id, selfId)) },
      ]
    );
  }

  function confirmDeleteAlbum() {
    if (!id) return;
    Alert.alert('Slette albumet?', 'Alle bildene i albumet slettes for godt.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett album',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteAlbum(id);
            router.dismissTo('/');
          } catch (caught) {
            setError(errorMessage(caught, 'Klarte ikke å slette albumet.'));
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!album || !selfId || !id) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text className="text-center text-base text-muted">
          {error ?? 'Fant ikke albumet.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="text-base text-ink">Tilbake</Text>
        </Pressable>
      </View>
    );
  }

  const shared = album.members.length > 0;

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top', 'bottom']}>
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          contentContainerClassName="px-5 pb-8"
          ListHeaderComponent={
            <View>
              <View className="flex-row items-center justify-between pt-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tilbake"
                  onPress={() => router.back()}
                  hitSlop={10}
                  className="h-10 w-10 items-center justify-center rounded-full bg-glass active:bg-glass-strong">
                  <SymbolView
                    name="chevron.left"
                    size={18}
                    tintColor="#ffffff"
                    fallback={<Text className="text-lg text-ink">‹</Text>}
                  />
                </Pressable>
                <Text className="text-3xl text-ink">Rediger</Text>
              </View>

              <View className="mb-2 mt-6 flex-row items-center justify-between">
                <Text className="text-sm text-muted">Tittel</Text>
                {savedField === 'title' ? (
                  <Text className="text-xs text-muted">Lagret</Text>
                ) : null}
              </View>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={() => {
                  // Saves on blur — no button. The confirmation exists because
                  // a silent write leaves you unsure whether it took.
                  if (title.trim() && title.trim() !== album.title) {
                    void run(() => updateAlbum(album.id, { title: title.trim() })).then(() => {
                      setSavedField('title');
                      setTimeout(() => setSavedField(null), 2000);
                    });
                  }
                }}
                maxLength={60}
                placeholderTextColor="#6b6f76"
                selectionColor="#ffffff"
                className="h-14 rounded-tile bg-glass px-4 text-xl leading-none text-ink"
              />

              <View className="mb-2 mt-4 flex-row items-center justify-between">
                <Text className="text-sm text-muted">Beskrivelse</Text>
                {savedField === 'description' ? (
                  <Text className="text-xs text-muted">Lagret</Text>
                ) : null}
              </View>
              <TextInput
                value={description}
                onChangeText={setDescription}
                onBlur={() => {
                  if (description.trim() !== (album.description ?? '')) {
                    void run(() =>
                      updateAlbum(album.id, { description: description.trim() || null })
                    ).then(() => {
                      setSavedField('description');
                      setTimeout(() => setSavedField(null), 2000);
                    });
                  }
                }}
                multiline
                maxLength={500}
                placeholder="Vises under tittelen på albumet"
                placeholderTextColor="#6b6f76"
                selectionColor="#ffffff"
                className="min-h-20 rounded-tile bg-glass px-4 py-3 text-base text-ink"
              />

              <Text className="mb-2 mt-7 text-sm text-muted">
                {shared ? `Deles med ${album.members.length}` : 'Deles med ingen'}
              </Text>

              {album.members.map((member) => (
                <View
                  key={member.id}
                  className="mb-2 flex-row items-center gap-3 rounded-tile bg-glass p-3">
                  <Avatar url={member.avatar_url} name={member.username} />
                  <Text className="flex-1 text-base text-ink">
                    {member.display_name ?? member.username}
                  </Text>
                  {album.isOwner || member.id === selfId ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void run(() => removeMember(album.id, member.id))}
                      className="rounded-full px-3 py-2 active:opacity-70">
                      <Text className="text-sm text-muted">Fjern</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              {/* With no friends there is nobody to share with, and rendering
                  nothing leaves the user hunting for a button that cannot
                  exist. Say why, and point at the fix. */}
              {album.isOwner && friends.length === 0 && album.members.length === 0 ? (
                <View className="rounded-tile bg-glass p-4">
                  <Text className="text-base text-ink">Ingen å dele med ennå</Text>
                  <Text className="mt-1 text-sm text-muted">
                    Du kan bare dele album med venner. Legg til noen først.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/venner')}
                    className="mt-3 h-12 items-center justify-center rounded-tile bg-ink active:opacity-80">
                    <Text className="text-base text-canvas">Finn venner</Text>
                  </Pressable>
                </View>
              ) : null}

              {album.isOwner && friends.length > 0 ? (
                <>
                  <Text className="mb-2 mt-2 text-xs text-muted">Legg til en venn</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {friends.map((friend) => (
                      <Pressable
                        key={friend.id}
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => confirmInvite(friend)}
                        className="flex-row items-center gap-2 rounded-full bg-glass px-3 py-2 active:bg-glass-strong">
                        <Avatar url={friend.avatar_url} name={friend.username} small />
                        <Text className="text-sm text-ink">
                          {friend.display_name ?? friend.username}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <View className="mb-2 mt-7 flex-row items-center justify-between">
                <Text className="text-sm text-muted">Bilder ({posts.length})</Text>
                {dirtyOrder ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      void run(() => reorderAlbum(album.id, posts.map((p) => p.id)))
                    }
                    className="rounded-full bg-ink px-4 py-2 active:opacity-80">
                    <Text className="text-sm text-canvas">Lagre rekkefølge</Text>
                  </Pressable>
                ) : null}
              </View>

              {error ? <Text className="mb-3 text-sm text-alert">{error}</Text> : null}
            </View>
          }
          ListEmptyComponent={
            <Text className="py-8 text-center text-sm text-muted">Ingen bilder ennå</Text>
          }
          renderItem={({ item, index }) => (
            <View className="mb-2 flex-row items-center gap-3 rounded-tile bg-glass p-2">
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
                  style={{ width: 52, height: 68, borderRadius: 8 }}
                  contentFit="cover"
                />
              ) : null}

              <View className="flex-1">
                <Text numberOfLines={1} className="text-base text-ink">
                  {item.title ?? 'Uten tittel'}
                </Text>
                {/* Whose photo it is only matters once more than one person
                    can add to the album. */}
                {shared ? (
                  <Text numberOfLines={1} className="text-xs text-muted">
                    {item.author?.display_name ?? item.author?.username}
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Flytt opp"
                disabled={index === 0 || busy}
                onPress={() => move(index, -1)}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-full ${
                  index === 0 ? 'opacity-30' : 'active:bg-glass-strong'
                }`}>
                <SymbolView
                  name="chevron.up"
                  size={15}
                  tintColor="#ffffff"
                  fallback={<Text className="text-ink">↑</Text>}
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Flytt ned"
                disabled={index === posts.length - 1 || busy}
                onPress={() => move(index, 1)}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-full ${
                  index === posts.length - 1 ? 'opacity-30' : 'active:bg-glass-strong'
                }`}>
                <SymbolView
                  name="chevron.down"
                  size={15}
                  tintColor="#ffffff"
                  fallback={<Text className="text-ink">↓</Text>}
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Slett bildet"
                disabled={busy}
                onPress={() => confirmDeletePost(item)}
                hitSlop={6}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-glass-strong">
                <SymbolView
                  name="trash"
                  size={15}
                  tintColor="#ff3b30"
                  fallback={<Text className="text-alert">✕</Text>}
                />
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            album.isOwner ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={confirmDeleteAlbum}
                className="mt-8 h-14 items-center justify-center rounded-tile active:opacity-80">
                <Text className="text-base text-alert">Slett albumet</Text>
              </Pressable>
            ) : null
          }
        />
      </Screen>
    </View>
  );
}

function Avatar({
  url,
  name,
  small = false,
}: {
  url: string | null;
  name: string;
  small?: boolean;
}) {
  const size = small ? 22 : 40;
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      className="items-center justify-center rounded-full bg-surface-raised"
      style={{ width: size, height: size }}>
      <Text className={small ? 'text-[10px] text-ink' : 'text-base text-ink'}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

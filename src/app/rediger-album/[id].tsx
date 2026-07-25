import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';

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
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !selfId) return;
    try {
      const data = await fetchAlbumAdmin(id, selfId);
      setAlbum(data);
      setPosts(data.posts);
      setTitle(data.title);
      setDescription(data.description ?? '');
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

  /** Reordering is local until saved, so dragging is not a write per frame. */
  const onReorder = useCallback(({ from, to }: ReorderableListReorderEvent) => {
    void Haptics.selectionAsync();
    setPosts((current) => reorderItems(current, from, to));
  }, []);

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

  /*
   * Compared against what was loaded, rather than tracked with a flag set on
   * every edit. Typing a character and deleting it again leaves a flag stuck
   * on, and the Save button then claims there is something to save when there
   * is not.
   */
  const nextTitle = title.trim();
  const nextDescription = description.trim();
  const fieldsChanged =
    nextTitle !== album.title || nextDescription !== (album.description ?? '');
  const orderChanged = posts.some((post, i) => post.id !== album.posts[i]?.id);
  const dirty = fieldsChanged || orderChanged;

  function save() {
    void run(async () => {
      // Guarded here rather than by disabling Save: a disabled button with no
      // explanation leaves you unsure what is wrong.
      if (!nextTitle) throw new Error('Tittelen kan ikke være tom.');

      if (fieldsChanged) {
        await updateAlbum(album!.id, {
          title: nextTitle,
          description: nextDescription || null,
        });
      }
      if (orderChanged) {
        await reorderAlbum(album!.id, posts.map((post) => post.id));
      }
    }).then(() => {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top', 'bottom']}>
        <ReorderableList
          data={posts}
          onReorder={onReorder}
          /*
           * Tolerates a missing item on purpose.
           *
           * During a reorder the library walks every index between the old and
           * new position and calls this for each, without checking that the row
           * is still there — and it reaches that code through a runOnJS from a
           * memoised gesture worklet, which can be holding an older `data` than
           * the one on screen. Its own `|| i.toString()` fallback assumes the
           * extractor survives that; `post.id` did not, and every drag threw.
           */
          keyExtractor={(post, index) => post?.id ?? String(index)}
          // Plain style, not contentContainerClassName: NativeWind only maps
          // className onto the components it knows about, and this list is not
          // one of them.
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lagre endringer"
                  disabled={!dirty || busy}
                  onPress={save}
                  // active: stays in the class list unconditionally — adding or
                  // removing a pressable state after mount makes react-native-css
                  // reset the component and remount its children.
                  className={`h-10 min-w-24 items-center justify-center rounded-full px-5 active:opacity-80 ${
                    dirty && !busy ? 'bg-ink' : 'bg-surface-raised'
                  }`}>
                  {busy ? (
                    <ActivityIndicator color="#0d0d0f" />
                  ) : (
                    <Text className={`text-base ${dirty ? 'text-canvas' : 'text-muted'}`}>
                      {justSaved && !dirty ? 'Lagret' : 'Lagre'}
                    </Text>
                  )}
                </Pressable>
              </View>

              <Text className="mb-2 mt-6 text-sm text-muted">Tittel</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={60}
                placeholderTextColor="#6b6f76"
                selectionColor="#ffffff"
                className="h-14 rounded-tile bg-glass px-4 text-xl leading-none text-ink"
              />

              <Text className="mb-2 mt-4 text-sm text-muted">Beskrivelse</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
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

              <View className="mb-2 mt-7 flex-row items-baseline justify-between">
                <Text className="text-sm text-muted">Bilder ({posts.length})</Text>
                {posts.length > 1 ? (
                  <Text className="text-xs text-muted">Hold og dra for å sortere</Text>
                ) : null}
              </View>

              {error ? <Text className="mb-3 text-sm text-alert">{error}</Text> : null}
            </View>
          }
          ListEmptyComponent={
            <Text className="py-8 text-center text-sm text-muted">Ingen bilder ennå</Text>
          }
          renderItem={({ item }) => (
            <PostRow
              post={item}
              shared={shared}
              busy={busy}
              onDelete={() => confirmDeletePost(item)}
            />
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

/**
 * One photo in the album, draggable by its grip.
 *
 * Split into its own component because `useReorderableDrag` only resolves
 * inside a row rendered by the list — called from the screen it has no item to
 * attach to.
 */
function PostRow({
  post,
  shared,
  busy,
  onDelete,
}: {
  post: AdminPost;
  shared: boolean;
  busy: boolean;
  onDelete: () => void;
}) {
  const drag = useReorderableDrag();

  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-tile bg-glass p-2">
      {post.imageUrl ? (
        <Image
          source={{ uri: post.imageUrl }}
          placeholder={post.blurhash ? { blurhash: post.blurhash } : undefined}
          style={{ width: 52, height: 68, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : null}

      <View className="flex-1">
        <Text numberOfLines={1} className="text-base text-ink">
          {post.title ?? 'Uten tittel'}
        </Text>
        {/* Whose photo it is only matters once more than one person can add to
            the album. */}
        {shared ? (
          <Text numberOfLines={1} className="text-xs text-muted">
            {post.author?.display_name ?? post.author?.username}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Slett bildet"
        disabled={busy}
        onPress={onDelete}
        hitSlop={6}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-glass-strong">
        <SymbolView
          name="trash"
          size={15}
          tintColor="#ff3b30"
          fallback={<Text className="text-alert">✕</Text>}
        />
      </Pressable>

      {/*
        A dedicated grip rather than dragging the whole row: the row sits in a
        scrolling list, so making all of it draggable would fight the scroll.
        Long press to start, with a haptic — otherwise there is no signal that
        the row has been picked up.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Endre rekkefølge"
        disabled={busy}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          drag();
        }}
        delayLongPress={180}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-glass-strong">
        <SymbolView
          name="line.3.horizontal"
          size={16}
          tintColor="#b0b4ba"
          fallback={<Text className="text-muted">≡</Text>}
        />
      </Pressable>
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

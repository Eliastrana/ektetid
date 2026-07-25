import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import {
  addComment,
  deleteComment,
  fetchComments,
  subscribeToComments,
  type CommentWithAuthor,
} from '@/lib/social';

type Props = {
  postId: string;
  selfId: string;
  visible: boolean;
  onClose: () => void;
};

/** "3 minutter siden" — the relative formatting dayjs did on the web. */
function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'nettopp';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d siden`;
  return new Date(iso).toLocaleDateString('nb-NO');
}

export function CommentSheet({ postId, selfId, visible, onClose }: Props) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments(await fetchComments(postId));
    } catch {
      // Leave whatever is already on screen rather than blanking the thread.
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    void load();
    // Realtime replaces the web app's Firestore onSnapshot listener.
    return subscribeToComments(postId, () => void load());
  }, [load, postId, visible]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(postId, selfId, body);
      setDraft('');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await load();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  }, [draft, load, postId, selfId, sending]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <Pressable accessibilityRole="button" className="flex-1" onPress={onClose} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="max-h-[70vh] min-h-[45vh] rounded-t-3xl bg-surface">
            <Screen className="flex-1" edges={['bottom']}>
              <View className="flex-row items-center justify-between px-5 py-4">
                <Text className="text-xl text-ink">Kommentarer</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lukk"
                  onPress={onClose}
                  className="h-9 w-9 items-center justify-center rounded-full bg-glass">
                  <SymbolView
                    name="xmark"
                    size={15}
                    tintColor="#ffffff"
                    fallback={<Text className="text-base text-ink">✕</Text>}
                  />
                </Pressable>
              </View>

              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                contentContainerClassName="px-5 pb-4 gap-4"
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  loading ? (
                    <View className="items-center py-10">
                      <ActivityIndicator color="#ffffff" />
                    </View>
                  ) : (
                    // Icon rather than a line of encouragement: the empty state
                    // is seen constantly and a prompt that asks for something
                    // clever gets tiring. Labelled for screen readers, which
                    // otherwise land on an empty list with nothing to announce.
                    <View
                      className="items-center py-12"
                      accessible
                      accessibilityLabel="Ingen kommentarer ennå">
                      <SymbolView
                        name="airplane.departure"
                        size={40}
                        tintColor="#3a3d42"
                        fallback={<Text className="text-4xl opacity-30">✈️</Text>}
                      />
                    </View>
                  )
                }
                renderItem={({ item }) => (
                  <View className="flex-row gap-3">
                    {item.author?.avatar_url ? (
                      <Image
                        source={{ uri: item.author.avatar_url }}
                        style={{ width: 36, height: 36, borderRadius: 18 }}
                      />
                    ) : (
                      <View className="h-9 w-9 rounded-full bg-surface-raised" />
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-sm text-ink">@{item.author?.username}</Text>
                        <Text className="text-xs text-muted">
                          {relativeTime(item.created_at)}
                        </Text>
                      </View>
                      <Text className="mt-0.5 text-base text-ink">{item.body}</Text>
                    </View>
                    {item.author_id === selfId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Slett kommentar"
                        onPress={async () => {
                          await deleteComment(item.id);
                          await load();
                        }}>
                        <Text className="px-2 text-sm text-muted">Slett</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              />

              <View className="flex-row items-center gap-2 border-t border-glass-border px-5 py-3">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Skriv en kommentar…"
                  placeholderTextColor="#6b6f76"
                  selectionColor="#ffffff"
                  maxLength={2000}
                  onSubmitEditing={send}
                  returnKeyType="send"
                  className="h-12 flex-1 rounded-full bg-glass px-4 text-base leading-none text-ink"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  disabled={!draft.trim() || sending}
                  onPress={send}
                  className="h-12 w-12 items-center justify-center rounded-full bg-ink active:opacity-80">
                  {sending ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <SymbolView
                      name="arrow.up"
                      size={20}
                      tintColor="#000000"
                      fallback={<Text className="text-lg text-canvas">↑</Text>}
                    />
                  )}
                </Pressable>
              </View>
            </Screen>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

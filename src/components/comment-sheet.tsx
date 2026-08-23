import { Host, TextInput as NativeTextInput, useNativeState } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BottomSheet } from '@/components/bottom-sheet';
import { NativePostButton } from '@/components/native-post-button';
import { Screen } from '@/components/screen';
import {
  addComment,
  deleteComment,
  fetchComments,
  subscribeToComments,
  toggleCommentLike,
  type CommentWithAuthor,
} from '@/lib/social';

type Props = {
  postId: string;
  selfId: string;
  visible: boolean;
  onClose: () => void;
};

type NativeCommentInputProps = {
  value: string;
  placeholder: string;
  disabled: boolean;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

/** Native SwiftUI/Compose text field, embedded in the React Native sheet. */
function NativeCommentInput({
  value,
  placeholder,
  disabled,
  onChangeText,
  onSubmit,
}: NativeCommentInputProps) {
  const nativeValue = useNativeState(value);

  useEffect(() => {
    nativeValue.value = value;
  }, [nativeValue, value]);

  return (
    <Host colorScheme="dark" style={{ flex: 1, height: 48 }}>
      <NativeTextInput
        value={nativeValue}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b6f76"
        selectionColor="#ffffff"
        editable={!disabled}
        maxLength={2000}
        onSubmitEditing={onSubmit}
        returnKeyType="send"
        style={{
          height: 48,
          paddingHorizontal: 16,
          backgroundColor: '#202124',
          borderRadius: 24,
        }}
        textStyle={{ color: '#ffffff', fontSize: 16 }}
      />
    </Host>
  );
}

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
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentWithAuthor | null>(null);

  const load = useCallback(async () => {
    try {
      setComments(await fetchComments(postId, selfId));
    } catch {
      // Leave whatever is already on screen rather than blanking the thread.
    } finally {
      setLoading(false);
    }
  }, [postId, selfId]);

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
      await addComment(postId, selfId, body, replyTo?.id);
      setDraft('');
      setReplyTo(null);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await load();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  }, [draft, load, postId, replyTo?.id, selfId, sending]);

  const likeComment = useCallback(
    async (comment: CommentWithAuthor) => {
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                likedByMe: !comment.likedByMe,
                likeCount: comment.likeCount + (comment.likedByMe ? -1 : 1),
              }
            : item
        )
      );
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await toggleCommentLike(comment.id, selfId, comment.likedByMe);
      } catch {
        await load();
      }
    },
    [load, selfId]
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      className="max-h-[70vh] min-h-[45vh]"
      avoidKeyboard
      // Screen already reserves the home-indicator inset inside the sheet.
      // Subtract it from iOS' keyboard displacement so the same inset is not
      // counted twice as an empty band above the keyboard.
      keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? -insets.bottom : 0}>
      <Screen className="flex-1" edges={['bottom']}>
        <View className="flex-row items-center justify-between px-5 py-4">
          <Text className="text-xl text-ink">Kommentarer</Text>
          <NativePostButton
            label="Lukk kommentarer"
            systemImage="xmark"
            onPress={onClose}
            appearance="glass"
            size={36}
          />
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
                  name="message"
                  size={38}
                  tintColor="#3a3d42"
                  fallback={<Text className="text-4xl text-muted opacity-30">◯</Text>}
                />
              </View>
            )
          }
          renderItem={({ item }) => (
            <View
              className="flex-row gap-3"
              style={{ marginLeft: item.parent_comment_id ? 32 : 0 }}>
              {/* Seeded on the username: comment authors are selected without
                  their id, and a username is stable enough to keep a face. */}
              <Avatar
                url={item.author?.avatar_url}
                name={item.author?.username ?? ''}
                size={36}
              />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-ink">@{item.author?.username}</Text>
                  <Text className="text-xs text-muted">
                    {relativeTime(item.created_at)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-base text-ink">{item.body}</Text>
                <View className="mt-1 flex-row items-center gap-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.likedByMe ? 'Fjern liker på kommentar' : 'Lik kommentar'
                    }
                    onPress={() => void likeComment(item)}
                    className="flex-row items-center gap-1 py-1">
                    <SymbolView
                      name={item.likedByMe ? 'heart.fill' : 'heart'}
                      size={13}
                      tintColor={item.likedByMe ? '#ff3b30' : '#b0b4ba'}
                      fallback={<Text className="text-xs text-muted">♥</Text>}
                    />
                    {item.likeCount > 0 ? (
                      <Text className="text-xs text-muted">{item.likeCount}</Text>
                    ) : null}
                  </Pressable>
                  {!item.parent_comment_id ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Svar ${item.author?.username}`}
                      onPress={() => {
                        setReplyTo(item);
                        void Haptics.selectionAsync();
                      }}>
                      <Text className="py-1 text-xs text-muted">Svar</Text>
                    </Pressable>
                  ) : null}
                </View>
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

        {replyTo ? (
          <View className="flex-row items-center justify-between border-t border-glass-border px-5 pt-2">
            <Text className="text-xs text-muted">Svarer @{replyTo.author?.username}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avbryt svar"
              onPress={() => setReplyTo(null)}>
              <Text className="px-2 py-1 text-xs text-ink">Avbryt</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          className={`flex-row items-center gap-2 px-5 py-3 ${
            replyTo ? '' : 'border-t border-glass-border'
          }`}>
          <NativeCommentInput
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTo ? 'Skriv et svar…' : 'Skriv en kommentar…'}
            disabled={sending}
            onSubmit={() => void send()}
          />
          <NativePostButton
            label="Send kommentar"
            systemImage={sending ? 'hourglass' : 'arrow.up'}
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            appearance="filled"
            tintColor="#ffffff"
            foregroundColor="#000000"
            size={48}
          />
        </View>
      </Screen>
    </BottomSheet>
  );
}

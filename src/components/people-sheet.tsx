import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import {
  fetchLikers,
  fetchPostViewers,
  type Liker,
  type PostViewer,
  type SocialProfile,
} from '@/lib/social';

type Mode = 'likes' | 'views';

type Row = {
  key: string;
  profile: SocialProfile;
  detail: string;
};

function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className="h-11 w-11 rounded-full bg-surface-raised" />
      <View className="flex-1 gap-2">
        <View className="h-4 w-32 rounded-full bg-surface-raised" />
        <View className="h-3 w-20 rounded-full bg-surface-raised" />
      </View>
    </View>
  );
}

function toRows(mode: Mode, data: Liker[] | PostViewer[]): Row[] {
  if (mode === 'likes') {
    return (data as Liker[]).map((item) => ({
      key: item.user.id,
      profile: item.user,
      detail: 'Ga et hjerte',
    }));
  }
  return (data as PostViewer[]).map((item) => ({
    key: item.viewer.id,
    profile: item.viewer,
    detail: item.view_count > 1 ? `Sett ${item.view_count} ganger` : 'Har sett innlegget',
  }));
}

export function PeopleSheet({
  postId,
  mode,
  visible,
  onClose,
}: {
  postId: string;
  mode: Mode;
  visible: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setRows([]);
    setLoading(true);
    setFailed(false);
    const request = mode === 'likes' ? fetchLikers(postId) : fetchPostViewers(postId);
    void request
      .then((data) => {
        if (active) setRows(toRows(mode, data));
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, postId, visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <Pressable accessibilityRole="button" className="flex-1" onPress={onClose} />
        <View className="h-[58vh] rounded-t-3xl bg-surface">
          <Screen className="flex-1" edges={['bottom']}>
            <View className="flex-row items-center justify-between px-5 py-4">
              <Text className="text-xl text-ink">{mode === 'likes' ? 'Hjerter' : 'Har sett'}</Text>
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

            {loading ? (
              <View className="gap-2 px-5">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </View>
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(item) => item.key}
                contentContainerClassName="px-5 pb-6"
                ListEmptyComponent={
                  <Text className="py-12 text-center text-sm text-muted">
                    {failed
                      ? 'Klarte ikke å hente listen. Prøv igjen senere.'
                      : mode === 'likes'
                        ? 'Ingen hjerter ennå.'
                        : 'Ingen har sett innlegget ennå.'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <View className="flex-row items-center gap-3 py-2">
                    {item.profile.avatar_url ? (
                      <Image
                        source={{ uri: item.profile.avatar_url }}
                        cachePolicy="memory-disk"
                        style={{ width: 44, height: 44, borderRadius: 22 }}
                      />
                    ) : (
                      <View className="h-11 w-11 rounded-full bg-surface-raised" />
                    )}
                    <View className="flex-1">
                      <Text className="text-base text-ink">
                        {item.profile.display_name ?? item.profile.username}
                      </Text>
                      <Text className="text-xs text-muted">{item.detail}</Text>
                    </View>
                  </View>
                )}
              />
            )}
          </Screen>
        </View>
      </View>
    </Modal>
  );
}

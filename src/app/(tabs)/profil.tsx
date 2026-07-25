import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { AlbumCard } from '@/components/album-card';
import { AvatarPicker } from '@/components/avatar-picker';
import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import {
  fetchOwnAlbums,
  fetchProfileStats,
  type OwnAlbum,
  type ProfileStats,
} from '@/lib/profile';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl text-ink">{value}</Text>
      <Text className="mt-0.5 text-xs text-muted">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, refreshProfile } = useAuth();
  const userId = session?.user.id;

  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [albums, setAlbums] = useState<OwnAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [nextStats, nextAlbums] = await Promise.all([
        fetchProfileStats(userId),
        fetchOwnAlbums(userId),
      ]);
      setStats(nextStats);
      setAlbums(nextAlbums);
    } catch {
      // Keep whatever is on screen; the pull-to-refresh is the retry.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const initials = (profile?.display_name ?? profile?.username ?? '?')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top']}>
        <FlatList
          data={albums}
          keyExtractor={(album) => album.id!}
          numColumns={2}
          contentContainerClassName="px-5 pb-32 gap-3"
          columnWrapperClassName="gap-3"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#ffffff"
            />
          }
          ListHeaderComponent={
            <View className="pb-5">
              <View className="flex-row items-center justify-end pt-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Innstillinger"
                  onPress={() => router.push('/innstillinger')}
                  hitSlop={10}
                  className="h-11 w-11 items-center justify-center rounded-full bg-glass active:bg-glass-strong">
                  <SymbolView
                    name="gearshape.fill"
                    size={20}
                    tintColor="#ffffff"
                    fallback={<Text className="text-lg text-ink">⚙</Text>}
                  />
                </Pressable>
              </View>

              <View className="mt-2 flex-row items-center gap-4">
                {userId ? (
                  <AvatarPicker
                    userId={userId}
                    avatarUrl={profile?.avatar_url ?? null}
                    initials={initials}
                    onChanged={async () => {
                      await refreshProfile();
                      await load();
                    }}
                  />
                ) : null}
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-3xl text-ink">
                    {profile?.display_name ?? profile?.username ?? 'Profil'}
                  </Text>
                  <Text className="text-base text-muted">@{profile?.username}</Text>
                </View>
              </View>

              <View className="mt-6 flex-row rounded-tile bg-glass py-4">
                <Stat value={stats?.posts ?? 0} label="bilder" />
                <Stat value={stats?.albums ?? 0} label="album" />
                <Stat value={stats?.heartsReceived ?? 0} label="hjerter" />
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/venner')}
                className="mt-3 h-14 flex-row items-center justify-between rounded-tile bg-glass px-4 active:bg-glass-strong">
                <Text className="text-base text-ink">Venner</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-base text-muted">{stats?.friends ?? 0}</Text>
                  <SymbolView
                    name="chevron.right"
                    size={14}
                    tintColor="#6b6f76"
                    fallback={<Text className="text-base text-muted">›</Text>}
                  />
                </View>
              </Pressable>

              <Text className="mb-1 mt-7 text-sm text-muted">Albumene dine</Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : (
              <View className="items-center gap-2 py-10">
                <Text className="text-base text-ink">Ingen album ennå</Text>
                <Text className="text-center text-sm text-muted">
                  Ta ditt første bilde, så dukker det opp her.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              showOwner={false}
              onPress={() => router.push(`/album/${item.id}`)}
            />
          )}
        />
      </Screen>
    </View>
  );
}

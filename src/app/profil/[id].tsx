import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { AlbumCard } from '@/components/album-card';
import { ErrorNotice } from '@/components/error-notice';
import { AlbumGridSkeleton } from '@/components/skeleton';
import { useAuth } from '@/components/auth-provider';
import { ReportSheet } from '@/components/report-sheet';
import { Avatar } from '@/components/avatar';
import { Screen } from '@/components/screen';
import { errorMessage } from '@/lib/errors';
import { acceptFriendRequest, removeFriendship, sendFriendRequest } from '@/lib/friends';
import type { ReportTarget } from '@/lib/moderation';
import { encodeOrigin } from '@/lib/origin';
import { fetchPublicProfile, type PublicProfile } from '@/lib/public-profile';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl text-ink">{value}</Text>
      <Text className="mt-0.5 text-xs text-muted">{label}</Text>
    </View>
  );
}

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;

  const [data, setData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const load = useCallback(async () => {
    if (!id || !selfId) return;
    try {
      setData(await fetchPublicProfile(id, selfId));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, 'Klarte ikke å hente profilen.'));
    } finally {
      setLoading(false);
    }
  }, [id, selfId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
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

  if (loading) {
    return (
      <View className="flex-1 bg-canvas px-5 pt-5">
        <AlbumGridSkeleton />
      </View>
    );
  }

  if (!data || !selfId) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text className="text-center text-base text-muted">
          {error ?? 'Fant ikke denne profilen.'}
        </Text>
      </View>
    );
  }

  const { profile, relationship } = data;
  const isFriend = relationship.kind === 'accepted';
  const name = profile.display_name ?? profile.username;

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['bottom']}>
        <FlatList
          data={data.visibleAlbums}
          keyExtractor={(album) => album.id!}
          numColumns={2}
          contentContainerClassName="px-5 pb-8 gap-3"
          columnWrapperClassName="gap-3"
          ListHeaderComponent={
            <View className="pb-5">
              <View className="flex-row items-center justify-end pt-2">
                {relationship.kind !== 'self' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rapporter denne personen"
                    onPress={() => setReportTarget({ reportedUserId: profile.id })}
                    hitSlop={10}
                    className="h-10 w-10 items-center justify-center rounded-full bg-glass active:bg-glass-strong">
                    <Icon
                      name="ellipsis"
                      size={18}
                      tintColor="#ffffff"
                      fallback={<Text className="text-lg text-ink">⋯</Text>}
                    />
                  </Pressable>
                ) : null}
              </View>

              <View className="mt-4 flex-row items-center gap-4">
                <Avatar
                  url={profile.avatar_url}
                  name={name}
                  seed={profile.id}
                  size={72}
                  ringWidth={data.isPro ? 2 : 0}
                />
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-3xl text-ink">
                    {name}
                  </Text>
                  <Text className="text-base text-muted">@{profile.username}</Text>
                </View>
              </View>

              {/* Counts reflect what you can see, so they read as zero until you
                  are friends — which is the honest answer, not a hidden one. */}
              {isFriend ? (
                <View className="mt-6 flex-row rounded-tile bg-glass py-4">
                  <Stat value={data.posts} label="bilder" />
                  <Stat value={data.albums} label="album" />
                  <Stat value={data.heartsReceived} label="hjerter" />
                </View>
              ) : null}

              <FriendshipButton
                relationship={relationship}
                busy={busy}
                onAdd={() => act(() => sendFriendRequest(selfId, profile.id))}
                onAccept={() => act(() => acceptFriendRequest(profile.id, selfId))}
                onRemove={() => act(() => removeFriendship(selfId, profile.id))}
              />

              {error ? (
                <View className="mt-3">
                  <ErrorNotice message={error} />
                </View>
              ) : null}

              {isFriend ? (
                <Text className="mb-1 mt-7 text-sm text-muted">Albumene deres</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            isFriend ? (
              <View className="items-center py-10">
                <Text className="text-sm text-muted">Ingen album ennå</Text>
              </View>
            ) : (
              <View className="items-center gap-2 py-10">
                <Text className="text-base text-ink">Albumene er private</Text>
                <Text className="text-center text-sm text-muted">
                  Dere må være venner for å se hverandres øyeblikk.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              pro={data.isPro}
              showOwner={false}
              onPress={(origin) =>
                router.push({
                  pathname: '/album/[id]',
                  params: {
                    id: item.id!,
                    ...encodeOrigin(origin),
                    // Lets the opening animation show the photo immediately
                    // rather than growing an empty rectangle.
                    ...(item.coverUrl ? { cover: item.coverUrl } : {}),
                    ...(item.cover_blurhash ? { cb: item.cover_blurhash } : {}),
                  },
                })
              }
            />
          )}
        />
      </Screen>

      <ReportSheet
        selfId={selfId}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onDone={() => {
          setReportTarget(null);
          router.back();
        }}
      />
    </View>
  );
}

function FriendshipButton({
  relationship,
  busy,
  onAdd,
  onAccept,
  onRemove,
}: {
  relationship: PublicProfile['relationship'];
  busy: boolean;
  onAdd: () => void;
  onAccept: () => void;
  onRemove: () => void;
}) {
  if (relationship.kind === 'self') return null;

  const config = {
    none: { label: 'Legg til venn', onPress: onAdd, primary: true },
    accepted: { label: 'Fjern venn', onPress: onRemove, primary: false },
    blocked: { label: 'Blokkert', onPress: undefined, primary: false },
    pendingOut: { label: 'Forespørsel sendt', onPress: onRemove, primary: false },
    pendingIn: { label: 'Godta forespørsel', onPress: onAccept, primary: true },
  }[
    relationship.kind === 'pending'
      ? relationship.outgoing
        ? 'pendingOut'
        : 'pendingIn'
      : relationship.kind
  ];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || !config.onPress}
      onPress={config.onPress}
      className={`mt-4 h-14 items-center justify-center rounded-tile active:opacity-80 ${
        config.primary ? 'bg-ink' : 'bg-glass'
      }`}>
      {busy ? (
        <ActivityIndicator color={config.primary ? '#000000' : '#ffffff'} />
      ) : (
        <Text className={`text-base ${config.primary ? 'text-canvas' : 'text-ink'}`}>
          {config.label}
        </Text>
      )}
    </Pressable>
  );
}

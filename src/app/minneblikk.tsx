import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth-provider';
import { ErrorNotice } from '@/components/error-notice';
import { Screen } from '@/components/screen';
import { Scrim } from '@/components/scrim';
import { Segmented } from '@/components/segmented';
import {
  fetchMemories,
  groupMemories,
  memoriesOnThisDay,
  type MemoryGroup,
  type MemoryPost,
} from '@/lib/memories';

type MemoryView = 'day' | 'months' | 'years';

const VIEW_OPTIONS: { value: MemoryView; label: string }[] = [
  { value: 'day', label: 'Denne dagen' },
  { value: 'months', label: 'Måneder' },
  { value: 'years', label: 'År' },
];

export default function MemoriesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [posts, setPosts] = useState<MemoryPost[]>([]);
  const [view, setView] = useState<MemoryView>('day');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setPosts(await fetchMemories());
      setError(null);
    } catch {
      setError('Minneblikk er tilgjengelig når EkteTid Pro er aktivt.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const dayPosts = useMemo(() => memoriesOnThisDay(posts), [posts]);
  const months = useMemo(() => groupMemories(posts, 'month'), [posts]);
  const years = useMemo(() => groupMemories(posts, 'year'), [posts]);

  const openPost = useCallback(
    (post: MemoryPost) => {
      router.push({
        pathname: '/album/[id]',
        params: { id: post.albumId, post: post.id },
      });
    },
    [router]
  );

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['bottom']}>
        <ScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 }}>
          <View className="mb-5 flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-glass-strong">
              <Icon
                name="clock.arrow.circlepath"
                size={20}
                tintColor="#ffffff"
                fallback={<Text className="text-lg text-ink">↻</Text>}
              />
            </View>
            <View className="flex-1">
              <Text className="text-xl text-ink">Dine øyeblikk, samlet</Text>
              <Text className="mt-0.5 text-sm text-muted">
                Gjenopplev det du har delt gjennom tiden.
              </Text>
            </View>
          </View>

          <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} />

          {loading ? (
            <View className="items-center py-20">
              <ActivityIndicator color="#ffffff" />
            </View>
          ) : error ? (
            <View className="mt-5 gap-3">
              <ErrorNotice message={error} />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/innstillinger')}
                className="h-12 items-center justify-center rounded-tile bg-ink active:opacity-80">
                <Text className="text-base text-canvas">Se EkteTid Pro</Text>
              </Pressable>
            </View>
          ) : view === 'day' ? (
            <DayMemories posts={dayPosts} onOpen={openPost} />
          ) : (
            <GroupMemories groups={view === 'months' ? months : years} onOpen={openPost} />
          )}
        </ScrollView>
      </Screen>
    </View>
  );
}

function DayMemories({
  posts,
  onOpen,
}: {
  posts: MemoryPost[];
  onOpen: (post: MemoryPost) => void;
}) {
  if (posts.length === 0) {
    return (
      <View className="items-center gap-2 py-20">
        <Text className="text-lg text-ink">Ingen tidligere øyeblikk i dag</Text>
        <Text className="text-center text-sm text-muted">
          Når du har publisert på denne datoen et tidligere år, dukker det opp her.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-5 gap-3">
      {posts.map((post) => (
        <MemoryCard
          key={post.id}
          posts={[post]}
          label={new Intl.DateTimeFormat('nb-NO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date(post.takenAt))}
          detail={post.albumTitle}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function GroupMemories({
  groups,
  onOpen,
}: {
  groups: MemoryGroup[];
  onOpen: (post: MemoryPost) => void;
}) {
  if (groups.length === 0) {
    return (
      <View className="items-center gap-2 py-20">
        <Text className="text-lg text-ink">Ingen minner ennå</Text>
        <Text className="text-center text-sm text-muted">
          Publiseringene dine blir til oppsummeringer her.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-5 gap-3">
      {groups.map((group) => (
        <MemoryCard
          key={group.key}
          posts={group.posts}
          label={group.label}
          detail={group.detail}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function MemoryCard({
  posts,
  label,
  detail,
  onOpen,
}: {
  posts: MemoryPost[];
  label: string;
  detail: string;
  onOpen: (post: MemoryPost) => void;
}) {
  const post = posts[0];
  const previews = posts.slice(0, 4);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      onPress={() => onOpen(post)}
      className="h-52 overflow-hidden rounded-tile bg-surface active:opacity-90">
      <View className="flex-1 flex-row flex-wrap">
        {previews.map((preview) =>
          preview.imageUrl ? (
            <Image
              key={preview.id}
              source={{ uri: preview.imageUrl }}
              placeholder={preview.blurhash ? { blurhash: preview.blurhash } : undefined}
              contentFit="cover"
              style={{
                width: previews.length === 1 ? '100%' : '50%',
                height: previews.length <= 2 ? '100%' : '50%',
              }}
            />
          ) : null
        )}
      </View>
      <Scrim />
      <View className="absolute inset-x-4 bottom-4">
        <Text className="text-2xl text-ink">{label}</Text>
        <Text className="mt-1 text-sm text-ink opacity-75">{detail}</Text>
      </View>
    </Pressable>
  );
}

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth-provider';
import { Avatar } from '@/components/avatar';
import { Dice } from '@/components/dice';
import { CommentSheet } from '@/components/comment-sheet';
import { PeopleSheet } from '@/components/people-sheet';
import { ErrorNotice } from '@/components/error-notice';
import { SkeletonBox } from '@/components/skeleton';
import { fetchPostFeed, type PostFeedItem } from '@/lib/post-feed';
import {
  fetchPostSocialCounts,
  toggleLike,
  type PostSocialCounts,
} from '@/lib/social';

function StreamSkeleton() {
  return (
    <View className="gap-5">
      {[0, 1].map((key) => (
        <View key={key} className="gap-3">
          <View className="flex-row items-center gap-3">
            <SkeletonBox style={{ width: 40, height: 40, borderRadius: 20 }} />
            <SkeletonBox style={{ width: 144, height: 16, borderRadius: 8 }} />
          </View>
          <SkeletonBox style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }} />
        </View>
      ))}
    </View>
  );
}

const NO_SOCIAL: PostSocialCounts = { likes: 0, likedByMe: false, comments: 0 };

function PostCard({
  item,
  social,
  onToggleLike,
  onComment,
  onShowLikers,
}: {
  item: PostFeedItem;
  social: PostSocialCounts;
  onToggleLike: () => void;
  onComment: () => void;
  onShowLikers: () => void;
}) {
  const router = useRouter();
  const authorName = item.author.display_name ?? item.author.username;

  return (
    <View className="overflow-hidden rounded-tile bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Åpne ${item.title || 'innlegg'} av ${authorName}`}
        onPress={() =>
          router.push({
            pathname: '/album/[id]',
            params: {
              id: item.album.id,
              post: item.id,
              cover: item.imageUrl,
              ...(item.blurhash ? { cb: item.blurhash } : {}),
            },
          })
        }>
        <View className="aspect-[3/4] bg-surface-raised">
          <Image
            source={{ uri: item.imageUrl }}
            placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={160}
            style={{ flex: 1 }}
          />
          {item.video_path ? (
            <View className="absolute inset-0 items-center justify-center">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-overlay-strong">
                <Icon name="play.fill" size={24} tintColor="#ffffff" />
              </View>
            </View>
          ) : null}
          {item.rating ? (
            <View className="absolute right-3 top-3 flex-row items-center gap-1.5 rounded-full bg-overlay-strong px-3 py-2">
              <Dice face={item.rating} size={16} color="#ffffff" />
              <Text className="text-sm text-ink">{item.rating}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View className="gap-2 p-4">
        <View className="flex-row items-center gap-3">
          <Avatar
            url={item.author.avatar_url}
            name={authorName}
            seed={item.author.id}
            size={40}
            ringWidth={item.authorHasPro ? 2 : 0}
          />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-base text-ink">
              {authorName}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted">
              {item.album.title}
              {item.location ? ` · ${item.location}` : ''}
            </Text>
          </View>
        </View>

        {item.title ? <Text className="text-lg text-ink">{item.title}</Text> : null}
        {item.description ? (
          <Text numberOfLines={3} className="text-sm leading-5 text-muted">
            {item.description}
          </Text>
        ) : null}

        {/*
          Hearts and comments belong on the card. The stream exists to be read
          straight through, and making someone open the album to respond turns
          a reaction into a detour they mostly will not take.
        */}
        <View className="mt-1 flex-row items-center gap-5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={social.likedByMe ? 'Fjern hjerte' : 'Gi hjerte'}
            onPress={onToggleLike}
            className="flex-row items-center gap-2 active:opacity-60">
            <Icon
              name={social.likedByMe ? 'heart.fill' : 'heart'}
              size={20}
              tintColor={social.likedByMe ? '#ff3b30' : '#ffffff'}
              fallback={<Text className="text-base text-ink">♥</Text>}
            />
            {social.likes > 0 ? (
              <Text className="text-sm text-muted">{social.likes}</Text>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kommentarer"
            onPress={onComment}
            className="flex-row items-center gap-2 active:opacity-60">
            <Icon
              name="bubble.left"
              size={20}
              tintColor="#ffffff"
              fallback={<Text className="text-base text-ink">💬</Text>}
            />
            {social.comments > 0 ? (
              <Text className="text-sm text-muted">{social.comments}</Text>
            ) : null}
          </Pressable>

          {social.likes > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Se hvem som ga ${social.likes} hjerter`}
              onPress={onShowLikers}
              className="active:opacity-60">
              <Text className="text-sm text-muted">Se hvem</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function PostStream({ header }: { header: ReactElement }) {
  const { session } = useAuth();
  const selfId = session?.user.id;
  const [posts, setPosts] = useState<PostFeedItem[]>([]);
  const [social, setSocial] = useState<Map<string, PostSocialCounts>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [likersFor, setLikersFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const feed = await fetchPostFeed();
      setPosts(feed);
      setError(null);
      // Counts follow the posts rather than blocking them: the photographs are
      // the point, and a heart arriving a moment later costs nothing.
      if (selfId) {
        void fetchPostSocialCounts(
          feed.map((post) => post.id),
          selfId
        )
          .then(setSocial)
          .catch(() => {});
      }
    } catch {
      setError('Klarte ikke å hente strømmen.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selfId]);

  const onToggleLike = useCallback(
    async (postId: string) => {
      if (!selfId) return;
      const before = social.get(postId) ?? NO_SOCIAL;

      // Optimistic: the heart should answer the tap, not the round trip.
      setSocial((current) => {
        const next = new Map(current);
        next.set(postId, {
          ...before,
          likes: before.likes + (before.likedByMe ? -1 : 1),
          likedByMe: !before.likedByMe,
        });
        return next;
      });
      void Haptics.impactAsync(
        before.likedByMe
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium
      );

      try {
        await toggleLike(postId, selfId, before.likedByMe);
      } catch {
        setSocial((current) => {
          const next = new Map(current);
          next.set(postId, before);
          return next;
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [selfId, social]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => (
          <PostCard
            item={item}
            social={social.get(item.id) ?? NO_SOCIAL}
            onToggleLike={() => void onToggleLike(item.id)}
            onComment={() => setCommentsFor(item.id)}
            onShowLikers={() => setLikersFor(item.id)}
          />
        )}
        contentContainerClassName="gap-5 px-4 pb-32"
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
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
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <StreamSkeleton />
          ) : error ? (
            <ErrorNotice message={error} />
          ) : (
            <Text className="py-20 text-center text-sm text-muted">Ingen innlegg ennå.</Text>
          )
        }
      />

      {commentsFor && selfId ? (
        <CommentSheet
          postId={commentsFor}
          selfId={selfId}
          visible
          onClose={() => {
            setCommentsFor(null);
            // The count on the card is stale the moment a comment is added or
            // removed, and nothing else tells the stream it changed.
            if (selfId) {
              void fetchPostSocialCounts(
                posts.map((post) => post.id),
                selfId
              )
                .then(setSocial)
                .catch(() => {});
            }
          }}
        />
      ) : null}

      {likersFor ? (
        <PeopleSheet
          postId={likersFor}
          initialMode="likes"
          // Viewer lists stay in the album, where the post's author is known.
          canSeeViews={false}
          visible
          onClose={() => setLikersFor(null)}
        />
      ) : null}
    </>
  );
}

import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { BottomSheet } from '@/components/bottom-sheet';
import { NativePostButton } from '@/components/native-post-button';
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

/** Index order is the segmented control's contract, so the two stay together. */
const MODES: Mode[] = ['likes', 'views'];
const MODE_LABELS = ['Hjerter', 'Har sett'];

/** One list's worth of state. Both are held so a swipe has somewhere to land. */
type ListState = { rows: Row[]; loading: boolean; failed: boolean };

const EMPTY: ListState = { rows: [], loading: true, failed: false };

function PeopleList({ state, mode }: { state: ListState; mode: Mode }) {
  if (state.loading) {
    return (
      <View className="gap-2 px-5">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  return (
    <FlatList
      data={state.rows}
      keyExtractor={(item) => item.key}
      contentContainerClassName="px-5 pb-6"
      ListEmptyComponent={
        <Text className="py-12 text-center text-sm text-muted">
          {state.failed
            ? 'Klarte ikke å hente listen. Prøv igjen senere.'
            : mode === 'likes'
              ? 'Ingen hjerter ennå.'
              : 'Ingen har sett innlegget ennå.'}
        </Text>
      }
      renderItem={({ item }) => (
        <View className="flex-row items-center gap-3 py-2">
          <Avatar
            url={item.profile.avatar_url}
            name={item.profile.display_name ?? item.profile.username}
            seed={item.profile.id}
          />
          <View className="flex-1">
            <Text className="text-base text-ink">
              {item.profile.display_name ?? item.profile.username}
            </Text>
            <Text className="text-xs text-muted">{item.detail}</Text>
          </View>
        </View>
      )}
    />
  );
}

export function PeopleSheet({
  postId,
  initialMode,
  canSeeViews,
  visible,
  onClose,
}: {
  postId: string;
  initialMode: Mode;
  /**
   * Whether the viewer list is available: your own post, on Pro. Hearts are
   * open to everyone, so the toggle only appears when there is a second list
   * to switch to.
   */
  canSeeViews: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [likes, setLikes] = useState<ListState>(EMPTY);
  const [views, setViews] = useState<ListState>(EMPTY);
  const pager = useRef<ScrollView>(null);
  const placed = useRef(false);

  useEffect(() => {
    if (visible) setMode(canSeeViews ? initialMode : 'likes');
    else placed.current = false;
  }, [canSeeViews, initialMode, visible]);

  // Both lists load up front. A swipe that had to wait for its fetch before
  // showing anything would defeat the point of being able to swipe at all.
  useEffect(() => {
    if (!visible) return;
    let active = true;

    setLikes(EMPTY);
    void fetchLikers(postId)
      .then((data) => {
        if (active) setLikes({ rows: toRows('likes', data), loading: false, failed: false });
      })
      .catch(() => {
        if (active) setLikes({ rows: [], loading: false, failed: true });
      });

    if (!canSeeViews) return () => {
      active = false;
    };

    setViews(EMPTY);
    void fetchPostViewers(postId)
      .then((data) => {
        if (active) setViews({ rows: toRows('views', data), loading: false, failed: false });
      })
      .catch(() => {
        if (active) setViews({ rows: [], loading: false, failed: true });
      });

    return () => {
      active = false;
    };
  }, [canSeeViews, postId, visible]);

  /** Drive the pager from the control, so both routes end in the same place. */
  const show = useCallback(
    (next: Mode) => {
      setMode(next);
      pager.current?.scrollTo({ x: MODES.indexOf(next) * width, animated: true });
    },
    [width]
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} className="h-[58vh]">
      <Screen className="flex-1" edges={['bottom']}>
        <View className="flex-row items-center justify-between px-5 py-4">
          {canSeeViews ? (
            <SegmentedControl
              values={MODE_LABELS}
              selectedIndex={MODES.indexOf(mode)}
              onChange={({ nativeEvent }) => {
                const next = MODES[nativeEvent.selectedSegmentIndex];
                if (!next) return;
                void Haptics.selectionAsync();
                show(next);
              }}
              accessibilityLabel="Velg hjerter eller hvem som har sett"
              style={{ width: 190, height: 34 }}
            />
          ) : (
            <Text className="text-xl text-ink">Hjerter</Text>
          )}
          <NativePostButton
            label="Lukk"
            systemImage="xmark"
            appearance="glass"
            onPress={onClose}
          />
        </View>

        {canSeeViews ? (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            // The lists scroll vertically inside each page; without this the
            // pager claims the gesture and neither list moves.
            directionalLockEnabled
            onLayout={() => {
              // Opening straight onto the viewer list has to start there
              // rather than animate across on first paint.
              if (placed.current) return;
              placed.current = true;
              pager.current?.scrollTo({
                x: MODES.indexOf(mode) * width,
                animated: false,
              });
            }}
            onMomentumScrollEnd={({ nativeEvent }) => {
              const next = MODES[Math.round(nativeEvent.contentOffset.x / width)];
              if (!next || next === mode) return;
              void Haptics.selectionAsync();
              setMode(next);
            }}>
            <View style={{ width }}>
              <PeopleList state={likes} mode="likes" />
            </View>
            <View style={{ width }}>
              <PeopleList state={views} mode="views" />
            </View>
          </ScrollView>
        ) : (
          <PeopleList state={likes} mode="likes" />
        )}
      </Screen>
    </BottomSheet>
  );
}

import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { NotificationOptIn } from '@/components/notification-opt-in';
import { useAuth } from '@/components/auth-provider';
import { ProCard } from '@/components/pro-card';
import { Screen } from '@/components/screen';

type IntroPage = {
  kind: 'intro';
  icon: 'camera.fill' | 'person.2.fill' | 'map.fill';
  title: string;
  body: string;
};

type Page =
  | IntroPage
  | { kind: 'notifications'; title: string; body: string }
  | { kind: 'pro'; title: string };

const PAGES: Page[] = [
  {
    kind: 'intro',
    icon: 'camera.fill',
    title: 'Del dine beste øyeblikk',
    body: 'Velg Bilde eller Video, ta øyeblikket og legg det i et album.',
  },
  {
    kind: 'intro',
    icon: 'person.2.fill',
    title: 'En nærere opplevelse',
    body: 'Albumene dine er private. Bare venner du godkjenner kan se innleggene dine.',
  },
  {
    kind: 'intro',
    icon: 'map.fill',
    title: 'Finn minnene igjen',
    body: 'Se innlegg andre har lagt ut, enten på forsiden eller på kartet.',
  },
  // Before Pro: the one thing on these pages that changes whether the app
  // works for you. Without a registered device, friends' posts arrive silently.
  {
    kind: 'notifications',
    title: 'Ikke gå glipp av noe',
    body: 'Få varsel når venner legger ut nye øyeblikk, kommenterer eller vil bli venn med deg. Du velger selv hva du får varsel om i profilen.',
  },
  // Last, once the app has been explained. Offered, never required: the
  // button below always lets you continue without buying.
  { kind: 'pro', title: 'EkteTid Pro' },
];

/**
 * Off iOS there is no till — see pro-card-earned.tsx — so the page talks
 * about earning Pro rather than buying it.
 */
const PRO_BODY =
  process.env.EXPO_OS === 'ios'
    ? 'Et engangskjøp, ingen abonnement. Du kan også låse det opp gratis ved å dele 20 innlegg i minst tre album.'
    : 'Lås opp Pro gratis ved å dele 20 innlegg i minst tre album.';

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Page>>(null);
  const [page, setPage] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const { completeOnboarding, session } = useAuth();
  const userId = session?.user.id;
  const last = page === PAGES.length - 1;

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top', 'bottom']}>
        {/*
          Hidden rather than unmounted on the last page. Removing it collapses
          this row to nothing, and every page's centred content jumps upward as
          the reader arrives at the end.
        */}
        <View className="flex-row justify-end px-5 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityElementsHidden={last}
            importantForAccessibility={last ? 'no-hide-descendants' : 'auto'}
            disabled={last}
            style={{ opacity: last ? 0 : 1 }}
            onPress={() => void completeOnboarding()}>
            <Text className="px-2 py-3 text-sm text-muted">Hopp over</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={PAGES}
          keyExtractor={(item) => item.title}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) =>
            item.kind === 'pro' ? (
              // Scrolls on its own: the card is taller than the other pages'
              // content, and on a small phone it would otherwise be cut off
              // above the buttons.
              <ScrollView
                style={{ width }}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                contentContainerClassName="px-6 py-4"
                showsVerticalScrollIndicator={false}>
                <Text className="text-center text-4xl text-ink">{item.title}</Text>
                <Text className="mb-6 mt-3 text-center text-base leading-6 text-muted">
                  {PRO_BODY}
                </Text>
                {userId ? <ProCard userId={userId} onProChange={setIsPro} /> : null}
              </ScrollView>
            ) : item.kind === 'notifications' ? (
              <View style={{ width }} className="flex-1 items-center justify-center px-10">
                <View className="h-28 w-28 items-center justify-center rounded-[32px] bg-glass">
                  <Icon name="bell.fill" size={48} tintColor="#ffffff" />
                </View>
                <Text className="mt-10 text-center text-4xl text-ink">{item.title}</Text>
                <Text className="mt-4 text-center text-base leading-6 text-muted">{item.body}</Text>
                {userId ? <NotificationOptIn userId={userId} /> : null}
              </View>
            ) : (
              <View style={{ width }} className="flex-1 items-center justify-center px-10">
                <View className="h-28 w-28 items-center justify-center rounded-[32px] bg-glass">
                  <Icon name={item.icon} size={48} tintColor="#ffffff" />
                </View>
                <Text className="mt-10 text-center text-4xl text-ink">{item.title}</Text>
                <Text className="mt-4 text-center text-base leading-6 text-muted">{item.body}</Text>
              </View>
            )
          }
        />

        <View className="gap-5 px-6 pb-4">
          <View className="flex-row justify-center gap-2">
            {PAGES.map((item, index) => (
              <View
                key={item.title}
                className={`h-2 rounded-full ${index === page ? 'w-6 bg-ink' : 'w-2 bg-glass-strong'}`}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Haptics.selectionAsync();
              if (last) {
                void completeOnboarding();
              } else {
                listRef.current?.scrollToIndex({ index: page + 1, animated: true });
                setPage(page + 1);
              }
            }}
            // On the Pro page the card carries the filled purchase button, so
            // this steps back to an outline — two solid buttons stacked read as
            // two equally weighted choices.
            className={`h-14 items-center justify-center rounded-tile active:opacity-80 ${
              last && !isPro ? 'border border-glass-strong' : 'bg-ink'
            }`}>
            <Text className={`text-base ${last && !isPro ? 'text-ink' : 'text-canvas'}`}>
              {last ? (isPro ? 'Kom i gang' : 'Fortsett uten Pro') : 'Neste'}
            </Text>
          </Pressable>
        </View>
      </Screen>
    </View>
  );
}

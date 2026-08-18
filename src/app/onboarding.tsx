import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';

const PAGES = [
  {
    icon: 'camera.fill',
    title: 'Ta bildet. Ta selfien.',
    body: 'Velg Bilde eller Video, ta øyeblikket og legg ved reaksjonen din med frontkameraet.',
  },
  {
    icon: 'person.2.fill',
    title: 'Bare ekte venner',
    body: 'Albumene dine er private. Bare venner du godkjenner kan se innleggene dine.',
  },
  {
    icon: 'map.fill',
    title: 'Finn minnene igjen',
    body: 'Se innlegg i en vertikal strøm eller finn dem på kartet. Du bestemmer hva som deles.',
  },
] as const;

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof PAGES)[number]>>(null);
  const [page, setPage] = useState(0);
  const { completeOnboarding } = useAuth();
  const last = page === PAGES.length - 1;

  return (
    <View className="flex-1 bg-canvas">
      <Screen className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row justify-end px-5 pt-2">
          {!last ? (
            <Pressable accessibilityRole="button" onPress={() => void completeOnboarding()}>
              <Text className="px-2 py-3 text-sm text-muted">Hopp over</Text>
            </Pressable>
          ) : null}
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
          renderItem={({ item }) => (
            <View style={{ width }} className="flex-1 items-center justify-center px-10">
              <View className="h-28 w-28 items-center justify-center rounded-[32px] bg-glass">
                <SymbolView name={item.icon} size={48} tintColor="#ffffff" />
              </View>
              <Text className="mt-10 text-center text-4xl text-ink">{item.title}</Text>
              <Text className="mt-4 text-center text-base leading-6 text-muted">{item.body}</Text>
            </View>
          )}
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
            className="h-14 items-center justify-center rounded-tile bg-ink active:opacity-80">
            <Text className="text-base text-canvas">{last ? 'Kom i gang' : 'Neste'}</Text>
          </Pressable>
        </View>
      </Screen>
    </View>
  );
}

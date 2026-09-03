import { Circle, HStack, Image, Link, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type RecentFriendWidgetItem = {
  id: string;
  name: string;
  initial: string;
  postedAt: number;
  albumId: string;
  albumTitle: string;
  postId: string;
};

export type RecentFriendsWidgetProps = {
  state: 'ready' | 'signedOut';
  friends: RecentFriendWidgetItem[];
};

function RecentFriendsWidget(props: RecentFriendsWidgetProps) {
  'widget';

  const secondary = '#AEB2B8';
  const friends = props?.friends?.slice(0, 4) ?? [];

  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        padding({ all: 14 }),
        containerBackground('#000000', 'widget'),
      ]}>
      <HStack spacing={6}>
        <Image systemName="person.2.fill" color="#FFFFFF" size={13} />
        <Text
          modifiers={[
            font({ size: 13, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#FFFFFF'),
          ]}>
          Nylig fra venner
        </Text>
      </HStack>

      {friends.length > 0 ? (
        friends.map((friend) => (
          <Link
            key={friend.id}
            destination={`ektetid:///album/${friend.albumId}?post=${friend.postId}`}
            modifiers={[
              frame({ maxWidth: Infinity, height: 27, alignment: 'leading' }),
              foregroundStyle('#FFFFFF'),
            ]}>
            <HStack spacing={8}>
              <ZStack>
                <Circle
                  modifiers={[
                    frame({ width: 24, height: 24 }),
                    foregroundStyle('#1E1F22'),
                  ]}
                />
                <Text
                  modifiers={[
                    font({ size: 11, weight: 'bold', design: 'rounded' }),
                    foregroundStyle('#FFFFFF'),
                  ]}>
                  {friend.initial}
                </Text>
              </ZStack>

              <VStack alignment="leading" spacing={0}>
                <HStack spacing={6}>
                  <Text
                    modifiers={[
                      font({ size: 12, weight: 'semibold' }),
                      foregroundStyle('#FFFFFF'),
                      lineLimit(1),
                    ]}>
                    {friend.name}
                  </Text>
                  <Spacer />
                  <Text
                    date={new Date(friend.postedAt)}
                    dateStyle="relative"
                    modifiers={[
                      font({ size: 10 }),
                      foregroundStyle(secondary),
                      lineLimit(1),
                    ]}
                  />
                </HStack>
                <Text
                  modifiers={[
                    font({ size: 10 }),
                    foregroundStyle(secondary),
                    lineLimit(1),
                  ]}>
                  {friend.albumTitle}
                </Text>
              </VStack>
            </HStack>
          </Link>
        ))
      ) : (
        <VStack
          alignment="center"
          spacing={5}
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
          <Image systemName="person.2" color={secondary} size={24} />
          <Text
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              foregroundStyle(secondary),
            ]}>
            {props?.state === 'signedOut' ? 'Åpne EkteTid for å logge inn' : 'Ingen nye innlegg'}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget('RecentFriendsWidget', RecentFriendsWidget);

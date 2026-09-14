import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type EkteTidActivityProps = {
  title: string;
  detail: string;
};

function EkteTidActivity(
  props: EkteTidActivityProps,
  environment: LiveActivityEnvironment
) {
  'widget';
  const secondary = environment.colorScheme === 'dark' ? '#B0B4BA' : '#54575C';

  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <VStack spacing={3}>
          <Text modifiers={[font({ weight: 'bold', size: 17 })]}>{props.title}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>
            {props.detail}
          </Text>
        </VStack>
        <Spacer />
        <Image systemName="camera.fill" color="#FFFFFF" />
      </HStack>
    ),
    compactLeading: <Image systemName="camera.fill" color="#FFFFFF" />,
    compactTrailing: <Text>EkteTid</Text>,
    minimal: <Image systemName="camera.fill" color="#FFFFFF" />,
    expandedLeading: (
      <Image
        systemName="camera.fill"
        color="#FFFFFF"
        modifiers={[padding({ all: 12 })]}
      />
    ),
    expandedCenter: (
      <VStack spacing={2} modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 16 })]}>{props.title}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary)]}>
          {props.detail}
        </Text>
      </VStack>
    ),
  };
}

export default createLiveActivity('EkteTidActivity', EkteTidActivity);

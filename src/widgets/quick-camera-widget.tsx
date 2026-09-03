import { Circle, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type QuickCameraWidgetProps = Record<string, never>;

function QuickCameraWidget(_props: QuickCameraWidgetProps) {
  'widget';

  return (
    <ZStack
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        containerBackground('#000000', 'widget'),
        widgetURL('ektetid:///kamera'),
      ]}>
      <VStack spacing={10}>
        <ZStack>
          <Circle
            modifiers={[
              frame({ width: 76, height: 76 }),
              foregroundStyle('#FFFFFF'),
            ]}
          />
          <Image systemName="camera.fill" color="#000000" size={30} />
        </ZStack>
        <Text
          modifiers={[
            font({ size: 13, weight: 'semibold', design: 'rounded' }),
            foregroundStyle('#FFFFFF'),
          ]}>
          Ta bilde
        </Text>
      </VStack>
    </ZStack>
  );
}

export default createWidget('QuickCameraWidget', QuickCameraWidget);

import { Button, Host, Icon, Text, TextInput, useNativeState } from '@expo/ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  glassEffect,
  padding,
  textFieldStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';
import { View } from 'react-native';

export type CommentComposerProps = {
  value: string;
  placeholder: string;
  disabled: boolean;
  sending: boolean;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

/** Expo UI maps these controls directly to SwiftUI on iOS. */
export function CommentComposer({
  value,
  placeholder,
  disabled,
  sending,
  onChangeText,
  onSubmit,
}: CommentComposerProps) {
  const text = useNativeState(value);

  useEffect(() => {
    if (text.value !== value) text.value = value;
  }, [text, value]);

  return (
    <View className="flex-row items-center gap-2">
      <Host colorScheme="dark" style={{ flex: 1, height: 44 }}>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          editable={!disabled}
          maxLength={2000}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          modifiers={[
            textFieldStyle('plain'),
            padding({ horizontal: 16, vertical: 10 }),
            glassEffect({
              glass: { variant: 'regular', interactive: true },
              shape: 'capsule',
            }),
          ]}
          style={{
            width: '100%',
            height: 44,
            ...(process.env.EXPO_OS === 'ios'
              ? null
              : {
                  paddingHorizontal: 14,
                  backgroundColor: '#202124',
                  borderRadius: 22,
                }),
          }}
        />
      </Host>
      <Host colorScheme="dark" matchContents>
        <Button
          disabled={disabled || !value.trim()}
          onPress={onSubmit}
          modifiers={[
            buttonStyle('glassProminent'),
            buttonBorderShape('circle'),
            controlSize('regular'),
            accessibilityLabel('Send kommentar'),
          ]}>
          {process.env.EXPO_OS === 'ios' ? (
            <Icon name={sending ? 'hourglass' : 'arrow.up'} size={18} />
          ) : (
            <Text textStyle={{ color: '#ffffff', fontSize: 18 }}>
              {sending ? '…' : '↑'}
            </Text>
          )}
        </Button>
      </Host>
    </View>
  );
}

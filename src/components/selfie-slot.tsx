import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/icon';

type Props = {
  uri: string | null;
  onChange: (uri: string | null) => void;
};

/**
 * The second half of the pair, editable on the compose screen.
 *
 * The dual capture fills this automatically, but two cases leave it empty: a
 * photo chosen from the library, and a selfie that failed to capture. Both
 * previously produced a post with no selfie and no way to add one, so the
 * feature was effectively camera-only.
 */
export function SelfieSlot({ uri, onChange }: Props) {
  async function take() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kameraet er ikke tilgjengelig', 'Gi EkteTid tilgang til kameraet først.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(result.assets[0].uri);
    }
  }

  async function choose() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(result.assets[0].uri);
    }
  }

  function open() {
    void Haptics.selectionAsync();
    Alert.alert(
      uri ? 'Bytt selfie' : 'Legg til selfie',
      undefined,
      [
        { text: 'Ta selfie', onPress: () => void take() },
        { text: 'Velg fra kamerarullen', onPress: () => void choose() },
        ...(uri
          ? [{ text: 'Fjern', style: 'destructive' as const, onPress: () => onChange(null) }]
          : []),
        { text: 'Avbryt', style: 'cancel' as const },
      ]
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={uri ? 'Bytt eller fjern selfie' : 'Legg til selfie'}
      onPress={open}
      className="active:opacity-80">
      <View
        className="items-center justify-center overflow-hidden rounded-tile bg-glass"
        style={{ width: 96, aspectRatio: 3 / 4 }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View className="items-center gap-1.5 px-2">
            <Icon
              name="person.crop.square"
              size={22}
              tintColor="#b0b4ba"
              fallback={<Text className="text-xl text-muted">+</Text>}
            />
            <Text className="text-center text-[10px] leading-tight text-muted">
              Legg til selfie
            </Text>
          </View>
        )}
      </View>

      {uri ? (
        <View className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full border-2 border-canvas bg-ink">
          <Icon
            name="pencil"
            size={11}
            tintColor="#000000"
            fallback={<Text className="text-xs text-canvas">✎</Text>}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

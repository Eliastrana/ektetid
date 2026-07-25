import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type FlashMode,
} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { setPendingCapture } from '@/lib/pending-capture';

/**
 * Time given to the front camera to mount and settle its exposure before the
 * second shot. expo-camera cannot drive both lenses at once, so the "both
 * sides" pair is captured sequentially, as BeReal itself originally did.
 */
const LENS_SETTLE_MS = 900;

/**
 * Back lenses we offer, in the order they appear on the zoom control.
 *
 * These are AVCaptureDevice identifiers. Telephoto is deliberately left out:
 * its magnification varies by model — 2x on some iPhones, 5x on others — so
 * there is no honest fixed label for it, and mislabelling a zoom level is
 * worse than not offering it.
 */
const BACK_LENSES: { id: string; label: string }[] = [
  { id: 'builtInUltraWideCamera', label: '0,5' },
  { id: 'builtInWideAngleCamera', label: '1' },
];

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [stage, setStage] = useState<'idle' | 'back' | 'selfie'>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lens selection is iOS-only; on Android onAvailableLensesChanged never
  // fires, so the control simply never appears.
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [backLens, setBackLens] = useState('builtInWideAngleCamera');

  // Only the back camera has an ultra-wide, so the control is hidden while the
  // front one is active — including mid-capture, when we flip for the selfie.
  const zoomOptions =
    facing === 'back' ? BACK_LENSES.filter((lens) => availableLenses.includes(lens.id)) : [];

  const capturePair = useCallback(async () => {
    if (stage !== 'idle') return;
    if (!cameraRef.current) {
      setError('Kameraet er ikke klart ennå.');
      console.warn('[kamera] shutter pressed but cameraRef is null');
      return;
    }

    try {
      setError(null);
      setStage('back');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const main: CameraCapturedPicture | undefined =
        await cameraRef.current.takePictureAsync({ quality: 0.9, exif: true });
      if (!main?.uri) throw new Error('Fikk ikke tatt bildet.');

      setPreview(main.uri);

      // Flip and let the front lens settle before the second frame.
      setStage('selfie');
      setFacing('front');
      await new Promise((resolve) => setTimeout(resolve, LENS_SETTLE_MS));

      let selfieUri: string | null = null;
      try {
        const selfie = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          shutterSound: false,
        });
        selfieUri = selfie?.uri ?? null;
      } catch {
        // A missing selfie is not fatal — the post still works without one,
        // exactly as it did when the Sanity `selfie` field was left empty.
        selfieUri = null;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setPendingCapture({
        imageUri: main.uri,
        selfieUri,
        exif: main.exif ?? null,
        width: main.width,
        height: main.height,
      });

      router.push('/nytt-innlegg');
    } catch (caught) {
      // Surfaced rather than swallowed: a silent shutter is impossible to
      // diagnose from the outside.
      console.error('[kamera] capture failed', caught);
      setError(caught instanceof Error ? caught.message : 'Klarte ikke å ta bildet.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setFacing('back');
      setStage('idle');
      setPreview(null);
    }
  }, [router, stage]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      exif: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingCapture({
      imageUri: asset.uri,
      selfieUri: null,
      exif: asset.exif ?? null,
      width: asset.width,
      height: asset.height,
    });
    router.push('/nytt-innlegg');
  }, [router]);

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
        <Text className="text-center text-xl text-ink">
          EkteTid trenger kameraet for å ta bilder.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void requestPermission()}
          className="h-14 items-center justify-center rounded-tile bg-ink px-8 active:opacity-80">
          <Text className="text-base text-canvas">Gi tilgang</Text>
        </Pressable>
      </View>
    );
  }

  const busy = stage !== 'idle';

  return (
    <View className="flex-1 bg-canvas">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        flash={flash}
        mode="picture"
        animateShutter={false}
        // Passing a back-camera lens while the front is active would ask for a
        // device that does not exist on this side.
        selectedLens={facing === 'back' ? backLens : undefined}
        onAvailableLensesChanged={({ lenses }) => {
          console.log('[kamera] lenses:', lenses.join(', '));
          setAvailableLenses(lenses);
        }}
        onCameraReady={() => {
          console.log('[kamera] camera ready, facing:', facing);
          setReady(true);
        }}
        onMountError={(event) => {
          console.error('[kamera] mount error', event);
          setError('Kameraet kunne ikke startes.');
        }}
      />

      {/*
        CameraView takes no children in SDK 57 — nesting the controls inside it
        renders them but swallows their touches. The preview is the background
        layer and the controls are an absolutely-positioned sibling on top.
      */}
      <View className="absolute inset-0">
        <Screen className="flex-1 justify-between">
          <View className="flex-row items-center justify-end gap-2 px-5 pt-2">
            {/* Labelled, because a bare icon does not say whether it is the
                current state or the action it would take. */}
            <Text className="text-sm text-ink">
              {flash === 'off' ? 'Blits av' : 'Blits auto'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={flash === 'off' ? 'Slå på blits' : 'Slå av blits'}
              onPress={() => {
                void Haptics.selectionAsync();
                setFlash((current) => (current === 'off' ? 'auto' : 'off'));
              }}
              hitSlop={8}
              className="h-14 w-14 items-center justify-center rounded-full border border-glass-border bg-glass active:bg-glass-strong">
              <SymbolView
                name={flash === 'off' ? 'bolt.slash.fill' : 'bolt.fill'}
                size={26}
                tintColor="#ffffff"
                fallback={<Text className="text-2xl text-ink">⚡︎</Text>}
              />
            </Pressable>
          </View>

          {/* The first frame, shown while the front lens settles. */}
          {preview ? (
            <View className="absolute right-5 top-20 h-32 w-24 overflow-hidden rounded-tile border border-glass-border">
              <Image source={{ uri: preview }} style={{ flex: 1 }} contentFit="cover" />
            </View>
          ) : null}

          <View className="items-center gap-5 pb-6">
            {/* Lens picker. Only rendered when the device actually reports an
                ultra-wide, so single-lens iPhones and Android see nothing. */}
            {zoomOptions.length > 1 && !busy ? (
              <View className="flex-row items-center gap-1 rounded-full border border-glass-border bg-glass p-1">
                {zoomOptions.map((lens) => {
                  const selected = lens.id === backLens;
                  return (
                    <Pressable
                      key={lens.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${lens.label} ganger zoom`}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setBackLens(lens.id);
                      }}
                      className={`h-9 min-w-9 items-center justify-center rounded-full px-3 ${
                        selected ? 'bg-ink' : ''
                      }`}>
                      <Text
                        className={`text-sm ${selected ? 'text-canvas' : 'text-ink opacity-80'}`}>
                        {lens.label}×
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Text className={`text-sm ${busy ? 'text-ink' : 'text-muted'}`}>
              {stage === 'back'
                ? 'Tar bildet…'
                : stage === 'selfie'
                  ? 'Snu deg — selfie!'
                  : ready
                    ? 'Ett trykk tar begge bildene'
                    : 'Starter kameraet…'}
            </Text>

            {error ? (
              <Text className="px-8 text-center text-sm text-alert">{error}</Text>
            ) : null}

            <View className="w-full flex-row items-center justify-around px-10">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Velg fra kamerarullen"
                disabled={busy}
                onPress={pickFromLibrary}
                hitSlop={10}
                className="h-14 w-14 items-center justify-center rounded-full border border-glass-border bg-glass active:bg-glass-strong">
                <SymbolView
                  name="photo.on.rectangle"
                  size={26}
                  tintColor="#ffffff"
                  fallback={<Text className="text-2xl text-ink">▤</Text>}
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ta bilde"
                disabled={busy}
                onPress={capturePair}
                className="h-20 w-20 items-center justify-center rounded-full border-4 border-ink active:opacity-70">
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <View className="h-16 w-16 rounded-full bg-ink" />
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bytt kamera"
                disabled={busy}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFacing((current) => (current === 'back' ? 'front' : 'back'));
                }}
                hitSlop={10}
                className="h-14 w-14 items-center justify-center rounded-full border border-glass-border bg-glass active:bg-glass-strong">
                <SymbolView
                  name="arrow.triangle.2.circlepath.camera.fill"
                  size={26}
                  tintColor="#ffffff"
                  fallback={<Text className="text-2xl text-ink">⟳</Text>}
                />
              </Pressable>
            </View>
          </View>
        </Screen>
      </View>
    </View>
  );
}

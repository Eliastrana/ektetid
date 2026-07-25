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
import Animated, { Easing, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { setPendingCapture } from '@/lib/pending-capture';

/**
 * Seconds counted down before the selfie is taken.
 *
 * expo-camera cannot drive both lenses at once, so the pair is captured
 * sequentially. The gap used to be a silent 900ms, which meant being
 * photographed before you had registered that the camera had flipped. The
 * countdown gives you time to see yourself and react — and it comfortably
 * covers the exposure settling the delay was originally there for.
 */
const SELFIE_COUNTDOWN = 3;

/**
 * Sort the lenses the device reports into the ones we offer.
 *
 * `selectedLens` is matched against `AVCaptureDevice.localizedName` — not the
 * device type — so the values coming back are display strings like "Back Ultra
 * Wide Camera", and they are translated on a non-English phone. Passing the
 * AVFoundation identifier `builtInUltraWideCamera`, as this used to, matched
 * nothing: the filter emptied the list, the control never rendered, and 0,5
 * was unreachable.
 *
 * Matching on "ultra" survives translation, since the term is a loanword in
 * the languages this ships in. Telephoto is deliberately left out: its
 * magnification varies by model — 2x on some iPhones, 5x on others — so there
 * is no honest fixed label, and mislabelling a zoom level is worse than not
 * offering it.
 */
function backLensOptions(lenses: string[]): { id: string; label: string }[] {
  const ultraWide = lenses.find((lens) => lens.toLowerCase().includes('ultra'));

  /*
   * The plain wide-angle camera, and nothing that merely contains one.
   *
   * The device also reports virtual cameras that combine several physical
   * ones — "Back Dual Wide Camera", "Back Triple Camera". Those pass a naive
   * "not ultra, not tele" test, and picking one is why every shot came out at
   * 0,5: on a virtual device that includes an ultra-wide, zoom factor 1.0 is
   * the ultra-wide's field of view, not the wide one's. The 1× equivalent is
   * factor 2.0. Excluding them leaves the real wide-angle camera, whose own
   * default framing is what "1" is supposed to mean.
   */
  const combined = ['dual', 'triple', 'lidar', 'truedepth'];
  const wide = lenses.find((lens) => {
    const name = lens.toLowerCase();
    if (name.includes('ultra') || name.includes('tele')) return false;
    return !combined.some((part) => name.includes(part));
  });

  const options: { id: string; label: string }[] = [];
  if (ultraWide) options.push({ id: ultraWide, label: '0,5' });
  // Omitted rather than guessed at if no single-lens camera is reported.
  // Leaving selectedLens unset falls back to the system's own choice, which is
  // a sensible 1×; naming a virtual device instead would not be.
  if (wide) options.push({ id: wide, label: '1' });
  return options;
}

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
  const [countdown, setCountdown] = useState<number | null>(null);

  // Lens selection is iOS-only; on Android onAvailableLensesChanged never
  // fires, so the control simply never appears.
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  // Null until the device says what it has. Naming a lens up front would mean
  // guessing a localized string, and a name that matches nothing is ignored.
  const [backLens, setBackLens] = useState<string | null>(null);

  // Only the back camera has an ultra-wide, so the control is hidden while the
  // front one is active — including mid-capture, when we flip for the selfie.
  const zoomOptions = facing === 'back' ? backLensOptions(availableLenses) : [];

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

      setStage('selfie');
      setFacing('front');

      // Count down visibly, one tick per second, so the shot is never a
      // surprise. The haptic matters as much as the number: it lands even if
      // you are looking at your own face rather than the digit.
      for (let remaining = SELFIE_COUNTDOWN; remaining > 0; remaining -= 1) {
        setCountdown(remaining);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setCountdown(null);

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
      setCountdown(null);
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
        selectedLens={facing === 'back' ? (backLens ?? undefined) : undefined}
        // Mirrored, so the selfie is saved the way you saw yourself compose it.
        // The takePictureAsync option of the same name is deprecated in SDK 57.
        mirror
        onAvailableLensesChanged={({ lenses }) => {
          // Both the raw names and what they were classified as: the names
          // differ by model and by language, so a wrong pick is only
          // diagnosable if you can see what there was to choose from.
          console.log('[kamera] lenses:', lenses.join(' | '));
          console.log('[kamera] chose:', JSON.stringify(backLensOptions(lenses)));
          setAvailableLenses(lenses);
          // Settle on the plain wide lens once the names are known, so the
          // control starts on 1 rather than on whatever the system defaulted to.
          setBackLens((current) => {
            if (current && lenses.includes(current)) return current;
            const options = backLensOptions(lenses);
            return options.find((lens) => lens.label === '1')?.id ?? null;
          });
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
              className="h-14 w-14 items-center justify-center rounded-full bg-overlay active:bg-overlay-strong">
              <SymbolView
                name={flash === 'off' ? 'bolt.slash.fill' : 'bolt.fill'}
                size={26}
                tintColor="#ffffff"
                fallback={<Text className="text-2xl text-ink">⚡︎</Text>}
              />
            </Pressable>
          </View>

          {/*
            Counting down before the selfie.

            Only the digit is keyed. Keying the whole block, as this used to,
            tore down the circle and the instruction on every tick and played
            their entrances again — so the text flashed once a second, which
            reads as a glitch rather than as a countdown. The frame stays put
            and just the number changes inside it.
          */}
          {countdown !== null ? (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(180)}
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center">
              <View className="h-32 w-32 items-center justify-center rounded-full bg-overlay">
                {/* No exit animation: the outgoing digit would sit alongside
                    the incoming one and shunt it off centre. */}
                <Animated.Text
                  key={countdown}
                  entering={ZoomIn.duration(220).easing(Easing.out(Easing.cubic))}
                  className="text-7xl text-ink">
                  {countdown}
                </Animated.Text>
              </View>
              <Text className="mt-4 text-base text-ink">Se på kameraet</Text>
            </Animated.View>
          ) : null}

          {/* The first frame, shown while the front lens settles. */}
          {preview ? (
            <View className="absolute right-5 top-20 h-32 w-24 overflow-hidden rounded-tile">
              <Image source={{ uri: preview }} style={{ flex: 1 }} contentFit="cover" />
            </View>
          ) : null}

          <View className="items-center gap-5 pb-6">
            {/* Lens picker. Only rendered when the device actually reports an
                ultra-wide, so single-lens iPhones and Android see nothing. */}
            {zoomOptions.length > 1 && !busy ? (
              <View className="flex-row items-center gap-1 rounded-full bg-overlay p-1">
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

            {/* On a pill, because this sits over the live preview: grey text
                on whatever the camera happens to be pointed at is legible
                against a dark room and invisible against a bright sky. */}
            <View className="rounded-full bg-overlay px-3 py-1.5">
              <Text className={`text-sm ${busy ? 'text-ink' : 'text-ink opacity-80'}`}>
                {stage === 'back'
                  ? 'Tar bildet…'
                  : stage === 'selfie'
                    ? 'Selfie om litt…'
                    : ready
                      ? 'Ett trykk tar begge bildene'
                      : 'Starter kameraet…'}
              </Text>
            </View>

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
                className="h-14 w-14 items-center justify-center rounded-full bg-overlay active:bg-overlay-strong">
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
                className="h-14 w-14 items-center justify-center rounded-full bg-overlay active:bg-overlay-strong">
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

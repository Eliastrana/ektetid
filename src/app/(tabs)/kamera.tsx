import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraCapturedPicture,
  type FlashMode,
} from 'expo-camera';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { ErrorNotice } from '@/components/error-notice';
import { NativeCameraButton } from '@/components/native-camera-button';
import { NativeShutterButton } from '@/components/native-shutter-button';
import * as VideoThumbnails from 'expo-video-thumbnails';

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

/** Longest clip a video-mode shutter records, in seconds. */
const MAX_VIDEO_SECONDS = 10;

/**
 * The zoom options to offer, given what the device reports.
 *
 * Only the ultra-wide is ever named. 1x is represented by *no* lens at all —
 * an unset `selectedLens` leaves iOS on its own default back camera, which is
 * the wide one. That asymmetry is the whole point.
 *
 * Naming the 1x lens is what broke this twice. `selectedLens` matches against
 * `AVCaptureDevice.localizedName`, so the values are display strings that vary
 * by model and are translated on a non-English phone; the AVFoundation
 * identifier matched nothing and the control never appeared. Guessing the name
 * instead landed on a virtual multi-camera device — "Back Dual Wide Camera" —
 * where zoom factor 1.0 is the ultra-wide's field of view, so every shot came
 * out at 0,5. There is no name to get wrong if we do not supply one.
 *
 * "ultra" is the one match worth trusting: it is the distinctive part of the
 * name, and a loanword in the languages this ships in. Telephoto is left out
 * deliberately — its magnification varies by model, so there is no honest
 * fixed label, and mislabelling a zoom level is worse than not offering it.
 */
type LensOption = { id: string | null; label: string };

function backLensOptions(lenses: string[]): LensOption[] {
  const ultraWide = lenses.find((lens) => lens.toLowerCase().includes('ultra'));

  // No ultra-wide means no choice to offer, and the control stays hidden.
  if (!ultraWide) return [];

  return [
    { id: ultraWide, label: '0,5' },
    { id: null, label: '1' },
  ];
}

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [stage, setStage] = useState<'idle' | 'back' | 'selfie'>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mode, setMode] = useState<'picture' | 'video'>('picture');
  const [recording, setRecording] = useState(false);
  /** Covers the preview while the capture session changes shape. */
  const [switching, setSwitching] = useState(false);
  /** Set when the press turned into a recording, so release knows what to do. */
  const recordingRef = useRef(false);

  // Lens selection is iOS-only; on Android onAvailableLensesChanged never
  // fires, so the control simply never appears.
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  // Null until the device says what it has. Naming a lens up front would mean
  // guessing a localized string, and a name that matches nothing is ignored.
  const [backLens, setBackLens] = useState<string | null>(null);

  // Only the back camera has an ultra-wide, so the control is hidden while the
  // front one is active — including mid-capture, when we flip for the selfie.
  const zoomOptions = facing === 'back' ? backLensOptions(availableLenses) : [];

  /**
   * Flip to the front camera, count down, and take the selfie.
   *
   * Shared by the photo and the video path so a clip ends exactly the way a
   * still does — the pairing is the point of the app, and a video without the
   * selfie would be a different kind of post.
   */
  const captureSelfie = useCallback(async (): Promise<string | null> => {
    setStage('selfie');
    setFacing('front');

    for (let remaining = SELFIE_COUNTDOWN; remaining > 0; remaining -= 1) {
      setCountdown(remaining);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(null);

    try {
      const selfie = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        shutterSound: false,
      });
      return selfie?.uri ?? null;
    } catch {
      // A missing selfie is not fatal — the post still works without one.
      return null;
    }
  }, []);

  /** Record until the shutter is tapped again, or ten seconds. */
  const runRecording = useCallback(async () => {
    try {
      setError(null);
      setStage('back');
      setRecording(true);
      recordingRef.current = true;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const clip = await cameraRef.current?.recordAsync({
        maxDuration: MAX_VIDEO_SECONDS,
      });

      setRecording(false);
      recordingRef.current = false;

      if (!clip?.uri) throw new Error('Fikk ikke tatt opp videoen.');

      /*
       * A still from the clip, so the rest of the app never has to care that
       * this post is a video: the grid cover, the map pin, the blurhash and
       * the notification all read image_path as usual.
       */
      const poster = await VideoThumbnails.getThumbnailAsync(clip.uri, { time: 0 });

      const selfieUri = await captureSelfie();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setPendingCapture({
        imageUri: poster.uri,
        videoUri: clip.uri,
        selfieUri,
        exif: null,
        width: poster.width,
        height: poster.height,
      });

      router.push('/nytt-innlegg');
    } catch (caught) {
      console.error('[kamera] recording failed', caught);
      setError(caught instanceof Error ? caught.message : 'Klarte ikke å ta opp video.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRecording(false);
      recordingRef.current = false;
      setMode('picture');
      setFacing('back');
      setStage('idle');
      setPreview(null);
      setCountdown(null);
    }
  }, [captureSelfie, router]);

  /*
   * Ask for the microphone as soon as the camera screen opens.
   *
   * Not when recording starts: the system dialog steals the first second or
   * two of a clip that is capped at ten, so the first video anyone records
   * would be the one ruined by the prompt. Asking here costs nothing — the
   * user has already chosen to open the camera — and by the time they select
   * shutter the answer is in.
   */
  useEffect(() => {
    if (permission?.granted && micPermission && !micPermission.granted && micPermission.canAskAgain) {
      void requestMicPermission();
    }
  }, [micPermission, permission?.granted, requestMicPermission]);

  const capturePair = useCallback(async () => {
    if (recordingRef.current || mode === 'video') return;
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

      const selfieUri = await captureSelfie();

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setPendingCapture({
        imageUri: main.uri,
        videoUri: null,
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
  }, [captureSelfie, mode, router, stage]);

  const pressShutter = useCallback(() => {
    if (recordingRef.current) {
      cameraRef.current?.stopRecording();
      return;
    }
    if (stage !== 'idle') return;
    if (mode === 'video') void runRecording();
    else void capturePair();
  }, [capturePair, mode, runRecording, stage]);

  const changeMode = useCallback(
    (selectedIndex: number) => {
      if (stage !== 'idle') return;
      const next = selectedIndex === 1 ? 'video' : 'picture';
      if (next === mode) return;
      void Haptics.selectionAsync();
      setSwitching(true);
      setMode(next);
      setTimeout(() => setSwitching(false), 240);
    },
    [mode, stage]
  );

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
      videoUri: null,
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
    const canAskForCamera = permission.canAskAgain;

    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
        <Text className="text-center text-xl text-ink">
          {canAskForCamera
            ? 'EkteTid bruker kameraet til å ta bilder og video du kan dele i album.'
            : 'Kameratilgang er slått av. Du kan slå den på i Innstillinger for å ta bilder og video.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void (canAskForCamera ? requestPermission() : Linking.openSettings())
          }
          className="h-14 items-center justify-center rounded-tile bg-ink px-8 active:opacity-80">
          <Text className="text-base text-canvas">
            {canAskForCamera ? 'Fortsett' : 'Åpne Innstillinger'}
          </Text>
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
        mode={mode}
        animateShutter={false}
        // Passing a back-camera lens while the front is active would ask for a
        // device that does not exist on this side.
        selectedLens={facing === 'back' ? (backLens ?? undefined) : undefined}
        // Mirrored, so the selfie is saved the way you saw yourself compose it.
        // The takePictureAsync option of the same name is deprecated in SDK 57.
        mirror
        onAvailableLensesChanged={({ lenses }) => {
          setAvailableLenses(lenses);
          // Settle on the plain wide lens once the names are known, so the
          // control starts on 1 rather than on whatever the system defaulted to.
          // Drop a selection the new camera does not have; null is 1x, which
          // every device has.
          setBackLens((current) => (current && lenses.includes(current) ? current : null));
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
        A blackout over the preview while the capture session is reconfigured.

        Switching from picture to video changes the session preset, and with it
        the preview's aspect — so the frame visibly jumped and resized just
        before recording began. The session cannot be told to hold still, but
        the moment can be covered: this fades in before the switch and out once
        it has settled, so a hold reads as the camera arming rather than
        glitching.
      */}
      {switching ? (
        <Animated.View
          entering={FadeIn.duration(90)}
          exiting={FadeOut.duration(160)}
          pointerEvents="none"
          className="absolute inset-0 bg-canvas"
        />
      ) : null}

      {/*
        CameraView takes no children in SDK 57 — nesting the controls inside it
        renders them but swallows their touches. The preview is the background
        layer and the controls are an absolutely-positioned sibling on top.
      */}
      <View className="absolute inset-0">
        <Screen className="flex-1 justify-between">
          <View className="items-end px-5 pt-2">
            <NativeCameraButton
              label={flash === 'off' ? 'Slå på automatisk blits' : 'Slå av blits'}
              systemImage={flash === 'off' ? 'bolt.slash.fill' : 'bolt.badge.a'}
              active={flash !== 'off'}
              onPress={() => {
                void Haptics.selectionAsync();
                setFlash((current) => (current === 'off' ? 'auto' : 'off'));
              }}
            />
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
              <SegmentedControl
                values={zoomOptions.map((lens) => `${lens.label}×`)}
                selectedIndex={Math.max(
                  0,
                  zoomOptions.findIndex((lens) => lens.id === backLens)
                )}
                onChange={({ nativeEvent }) => {
                  const selectedLens = zoomOptions[nativeEvent.selectedSegmentIndex];
                  if (!selectedLens) return;
                  void Haptics.selectionAsync();
                  setBackLens(selectedLens.id);
                }}
                accessibilityLabel="Velg kamerazoom"
                style={{ width: 132, height: 34 }}
              />
            ) : null}

            {!busy ? (
              <SegmentedControl
                values={['Bilde', 'Video']}
                selectedIndex={mode === 'picture' ? 0 : 1}
                onChange={({ nativeEvent }) => changeMode(nativeEvent.selectedSegmentIndex)}
                accessibilityLabel="Velg bilde eller video"
                style={{ width: 190, height: 34 }}
              />
            ) : null}

            {/* Only transient state needs copy. The shutter and native mode
                controls already explain the idle camera without an instruction. */}
            {busy || !ready ? (
              <View
                className={`rounded-full px-3 py-1.5 ${recording ? 'bg-alert' : 'bg-overlay'}`}>
                <Text className="text-sm text-ink">
                  {recording
                    ? 'Trykk igjen for å avslutte'
                    : stage === 'back'
                      ? 'Tar bildet…'
                      : stage === 'selfie'
                        ? 'Selfie om litt…'
                        : 'Starter kameraet…'}
                </Text>
              </View>
            ) : null}

            {error ? (
              <View className="w-full px-8">
                <ErrorNotice message={error} />
              </View>
            ) : null}

            <View className="w-full flex-row items-center justify-around px-10">
              <NativeCameraButton
                label="Velg fra kamerarullen"
                systemImage="photo.on.rectangle"
                disabled={busy}
                onPress={() => void pickFromLibrary()}
              />

              <NativeShutterButton
                mode={mode}
                recording={recording}
                busy={busy || !ready}
                onPress={pressShutter}
              />

              <NativeCameraButton
                label="Bytt kamera"
                systemImage="arrow.triangle.2.circlepath.camera.fill"
                disabled={busy}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFacing((current) => (current === 'back' ? 'front' : 'back'));
                }}
              />
            </View>
          </View>
        </Screen>
      </View>
    </View>
  );
}

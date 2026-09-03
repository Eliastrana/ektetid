import * as Haptics from 'expo-haptics';
import { registerForPush } from '@/lib/notifications';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth-provider';
import { NativePostButton } from '@/components/native-post-button';
import { Screen } from '@/components/screen';
import { SelfieSlot } from '@/components/selfie-slot';
import { ErrorNotice } from '@/components/error-notice';
import { errorMessage } from '@/lib/errors';
import { notePublishedPost } from '@/lib/review';
import { exifCoordinates, type Coordinates } from '@/lib/geo';
import { archivePublishedCapture } from '@/lib/local-archive';
import {
  clearPendingCapture,
  getPendingCapture,
  setPendingCapture,
} from '@/lib/pending-capture';
import type { Venue } from '@/../modules/venue-search';
import { LinkField } from '@/components/link-field';
import { MusicField } from '@/components/music-field';
import { VenueField } from '@/components/venue-field';
import type { MusicTrack } from '@/lib/music';
import {
  createAlbum,
  listWritableAlbums,
  publishPost,
  type PublishProgress,
  type WritableAlbum,
} from '@/lib/publish';

const PROGRESS_LABEL: Record<PublishProgress, string> = {
  processing: 'Behandler bildet…',
  uploading: 'Laster opp…',
  saving: 'Lagrer…',
  archiving: 'Legger i EkteTid-albumet…',
};

export default function NewPostScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [capture] = useState(getPendingCapture);
  const [selfieUri, setSelfieUri] = useState<string | null>(
    () => getPendingCapture()?.selfieUri ?? null
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [ratingEnabled, setRatingEnabled] = useState(false);
  /**
   * The snippet to play when the photo is opened.
   *
   * Offered on stills only. A clip already carries its own sound, and two
   * sources over one post means one of them has to be silenced arbitrarily.
   */
  const [music, setMusic] = useState<MusicTrack | null>(null);
  /** The venue this was taken in, from Apple's nearby places. Apple-only. */
  const [venue, setVenue] = useState<Venue | null>(null);
  /** Raw as typed; publishPost normalises it and drops anything unusable. */
  const [link, setLink] = useState('');
  const [rating, setRating] = useState(4);
  const [albums, setAlbums] = useState<WritableAlbum[]>([]);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  // EXIF wins: a library photo was taken where it was taken, not where the
  // user happens to be standing now.
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() =>
    exifCoordinates(getPendingCapture()?.exif)
  );
  const [error, setError] = useState<string | null>(null);

  const changeSelfie = useCallback(
    (uri: string | null) => {
      setSelfieUri(uri);
      if (capture) void setPendingCapture({ ...capture, selfieUri: uri });
    },
    [capture]
  );

  useEffect(() => {
    if (!userId) return;
    void listWritableAlbums(userId)
      .then((rows) => {
        setAlbums(rows);
        setAlbumId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => setError('Klarte ikke å hente albumene dine.'));
  }, [userId]);

  // Reverse-geocode quietly in the background. This fills the 📍 field the old
  // site had, and stays editable — a wrong guess should never block posting.
  useEffect(() => {
    let active = true;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !active) return;
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        // Only used when the photo carried no GPS of its own.
        setCoordinates((current) => current ?? {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        const [place] = await Location.reverseGeocodeAsync(position.coords);
        if (!active || !place) return;
        const label = [place.city ?? place.subregion, place.country].filter(Boolean).join(', ');
        if (label) setLocation((current) => current || label);
      } catch {
        // No location is fine.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const publish = useCallback(async () => {
    if (!capture || !userId || progress) return;

    setError(null);
    try {
      let targetAlbum = albumId;
      if (!targetAlbum) {
        const name = newAlbumTitle.trim() || 'Nytt album';
        targetAlbum = await createAlbum(name);
      }

      await publishPost(
        {
          capture: { ...capture, selfieUri },
          albumId: targetAlbum,
          title,
          description,
          location,
          takenAt: new Date(),
          coordinates,
          rating: ratingEnabled ? rating : null,
          music: capture.videoUri ? null : music,
          venue,
          link,
        },
        setProgress
      );

      // Pro's local archive is best effort. The post is already safely stored,
      // so Photos permission or a device-side album error cannot undo it.
      setProgress('archiving');
      await archivePublishedCapture(userId, capture).catch(() => false);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearPendingCapture();
      // Asked for here rather than on launch: iOS grants one prompt, and a
      // user who has just published has a reason to want the answer.
      void registerForPush(userId).catch(() => {});
      // Counts this publish and, once the app has clearly stuck, asks for a
      // rating. Deliberately not awaited: the post is done and the screen
      // should close regardless.
      void notePublishedPost();

      router.dismissTo('/');
    } catch (caught) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(caught, 'Klarte ikke å publisere.'));
    } finally {
      setProgress(null);
    }
  }, [
    albumId,
    capture,
    coordinates,
    description,
    link,
    location,
    music,
    newAlbumTitle,
    progress,
    rating,
    venue,
    ratingEnabled,
    router,
    selfieUri,
    title,
    userId,
  ]);

  if (!capture) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
        <Text className="text-center text-base text-muted">Fant ingen bilder å legge ut.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="text-base text-ink">Tilbake</Text>
        </Pressable>
      </View>
    );
  }

  const busy = progress !== null;
  const canPublish = !busy && (albumId !== null || newAlbumTitle.trim().length > 0);

  return (
    <View className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Screen className="flex-1" edges={['bottom']}>
          {/* Kept inside the modal so the preview retains its full layout. */}
          <View className="items-center pb-1 pt-2">
            <View className="h-1 w-10 rounded-full bg-muted opacity-40" />
          </View>

          {/*
            Fixed above the scrolling content so publishing is always within
            reach, even at the bottom of a long form.
          */}
          <View className="px-5 pb-3 pt-3">
            <View className="flex-row items-center justify-between">
              <NativePostButton
                label="Avbryt"
                systemImage="xmark"
                appearance="glass"
                disabled={busy}
                onPress={() => {
                  clearPendingCapture();
                  router.back();
                }}
              />

              {busy ? (
                // Same footprint as the button it replaces, so nothing else
                // in the row shifts while this is showing.
                <View style={{ height: 44, width: 44 }} className="items-center justify-center">
                  <ActivityIndicator color="#ffffff" />
                </View>
              ) : (
                <NativePostButton
                  label="Legg ut"
                  systemImage="paperplane.fill"
                  appearance="filled"
                  tintColor="#ffffff"
                  // Explicit rather than left to .borderedProminent's own
                  // contrast rule: on some tints that rule keeps the label
                  // white regardless of the fill, which on white would be an
                  // invisible icon on white glass. Black is unambiguous.
                  foregroundColor="#000000"
                  disabled={!canPublish}
                  onPress={() => void publish()}
                />
              )}
            </View>

            {busy ? (
              <Text className="mt-2 text-center text-xs text-muted">
                {PROGRESS_LABEL[progress]}
              </Text>
            ) : null}
          </View>

          <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
            <View className="relative aspect-[3/4] w-full overflow-hidden rounded-tile">
              <Image
                source={{ uri: capture.imageUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />

              {/*
                Picture-in-picture, the way the dual capture actually looks:
                the selfie is the small one, sitting on the corner of the shot
                it was taken alongside.
              */}
              <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
                  <SelfieSlot uri={selfieUri} onChange={changeSelfie} />
              </View>
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Tittel"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              maxLength={80}
              style={{ paddingHorizontal: 16 }}
              className="mt-5 h-14 rounded-tile bg-glass text-xl leading-none text-ink"
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Hva skjedde?"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              multiline
              maxLength={1000}
              style={{ paddingHorizontal: 16, paddingVertical: 12 }}
              className="mt-3 min-h-24 rounded-tile bg-glass text-base text-ink"
            />

            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Sted"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              maxLength={80}
              style={{ paddingHorizontal: 16 }}
              className="mt-3 h-14 rounded-tile bg-glass text-base leading-none text-ink"
            />

            <View className="mt-3 rounded-tile bg-glass p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-base text-ink">Terningkast</Text>
                  <Text className="mt-0.5 text-xs text-muted">
                    Vises som et overlay på innlegget
                  </Text>
                </View>
                <Switch value={ratingEnabled} onValueChange={setRatingEnabled} />
              </View>

              {ratingEnabled ? (
                <View className="mt-4 flex-row justify-between gap-2">
                  {[1, 2, 3, 4, 5, 6].map((value) => {
                    const selected = rating === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={`Terningkast ${value}`}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setRating(value);
                        }}
                        className={`h-11 flex-1 items-center justify-center rounded-xl ${
                          selected ? 'bg-ink' : 'bg-surface-raised'
                        }`}>
                        <Text className={`text-lg ${selected ? 'text-canvas' : 'text-ink'}`}>
                          {value}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {capture.videoUri ? null : (
              <View className="mt-3">
                <MusicField track={music} onChange={setMusic} />
              </View>
            )}

            {/* Renders nothing without coordinates, or off Apple platforms. */}
            <View className="mt-3">
              <VenueField venue={venue} coordinates={coordinates} onChange={setVenue} />
            </View>

            <View className="mt-3">
              <LinkField value={link} onChange={setLink} />
            </View>

            <Text className="mb-2 mt-6 text-sm text-muted">Album</Text>
            <View className="flex-row flex-wrap gap-2">
              {albums.map((album) => {
                const selected = album.id === albumId;
                return (
                  <Pressable
                    key={album.id}
                    accessibilityRole="button"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setAlbumId(album.id);
                      setNewAlbumTitle('');
                    }}
                    className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
                      selected ? 'bg-ink' : 'bg-glass'
                    }`}>
                    <Text className={selected ? 'text-canvas' : 'text-ink'}>
                      {album.title}
                      {/* Named, not just marked: two people can call an album
                          the same thing, and posting into the wrong one shows
                          the photo to the wrong set of friends. */}
                      {album.shared && album.ownerName ? (
                        <Text className={selected ? 'text-canvas opacity-70' : 'text-muted'}>
                          {`  ${album.ownerName}`}
                        </Text>
                      ) : null}
                    </Text>
                    {album.shared ? (
                      <Icon
                        name="person.2.fill"
                        size={11}
                        tintColor={selected ? '#000000' : '#b0b4ba'}
                        fallback={
                          <Text className={selected ? 'text-xs text-canvas' : 'text-xs text-muted'}>
                            ··
                          </Text>
                        }
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={newAlbumTitle}
              onChangeText={(text) => {
                setNewAlbumTitle(text);
                if (text.trim()) setAlbumId(null);
              }}
              placeholder={albums.length ? '…eller lag et nytt album' : 'Navn på ditt første album'}
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              maxLength={60}
              className="mt-3 h-14 rounded-tile bg-glass px-4 text-base leading-none text-ink"
            />

            {error ? (
              <View className="mt-4">
                <ErrorNotice message={error} />
              </View>
            ) : null}
            <View className="h-6" />
          </ScrollView>
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}

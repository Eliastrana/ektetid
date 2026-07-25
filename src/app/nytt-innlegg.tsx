import * as Haptics from 'expo-haptics';
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
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { Screen } from '@/components/screen';
import { errorMessage } from '@/lib/errors';
import { clearPendingCapture, getPendingCapture } from '@/lib/pending-capture';
import { createAlbum, listOwnAlbums, publishPost, type PublishProgress } from '@/lib/publish';

type AlbumOption = { id: string; title: string; updated_at: string };

const PROGRESS_LABEL: Record<PublishProgress, string> = {
  processing: 'Behandler bildet…',
  uploading: 'Laster opp…',
  saving: 'Lagrer…',
};

export default function NewPostScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [capture] = useState(getPendingCapture);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void listOwnAlbums(userId)
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
        targetAlbum = await createAlbum(userId, name);
      }

      await publishPost(
        {
          capture,
          albumId: targetAlbum,
          title,
          description,
          location,
          takenAt: new Date(),
        },
        setProgress
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearPendingCapture();
      router.dismissTo('/');
    } catch (caught) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(caught, 'Klarte ikke å publisere.'));
    } finally {
      setProgress(null);
    }
  }, [albumId, capture, description, location, newAlbumTitle, progress, router, title, userId]);

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen className="flex-1" edges={['bottom']}>
          <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
            <View className="mt-4 flex-row gap-3">
              <Image
                source={{ uri: capture.imageUri }}
                style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 12 }}
                contentFit="cover"
              />
              {capture.selfieUri ? (
                <Image
                  source={{ uri: capture.selfieUri }}
                  style={{ width: 96, aspectRatio: 3 / 4, borderRadius: 12 }}
                  contentFit="cover"
                />
              ) : null}
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Tittel"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              maxLength={80}
              className="mt-5 h-14 rounded-tile bg-glass px-4 text-xl leading-none text-ink"
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Hva skjedde?"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              multiline
              maxLength={1000}
              className="mt-3 min-h-24 rounded-tile bg-glass px-4 py-3 text-base text-ink"
            />

            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Sted"
              placeholderTextColor="#6b6f76"
              selectionColor="#ffffff"
              maxLength={80}
              className="mt-3 h-14 rounded-tile bg-glass px-4 text-base leading-none text-ink"
            />

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
                    className={`rounded-full border px-4 py-2 ${
                      selected ? 'border-ink bg-ink' : 'border-glass-border bg-glass'
                    }`}>
                    <Text className={selected ? 'text-canvas' : 'text-ink'}>{album.title}</Text>
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

            {error ? <Text className="mt-4 text-sm text-alert">{error}</Text> : null}
            <View className="h-6" />
          </ScrollView>

          <View className="gap-2 px-5 pt-2">
            <Pressable
              accessibilityRole="button"
              disabled={!canPublish}
              onPress={publish}
              className={`h-14 flex-row items-center justify-center gap-3 rounded-tile active:opacity-80 ${
                canPublish ? 'bg-ink' : 'bg-surface'
              }`}>
              {busy ? (
                <>
                  <ActivityIndicator color="#000000" />
                  <Text className="text-base text-canvas">{PROGRESS_LABEL[progress]}</Text>
                </>
              ) : (
                <Text className={`text-base ${canPublish ? 'text-canvas' : 'text-muted'}`}>
                  Legg ut
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                clearPendingCapture();
                router.back();
              }}>
              <Text className="py-2 text-center text-sm text-muted">Avbryt</Text>
            </Pressable>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}

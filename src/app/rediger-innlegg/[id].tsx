import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { ErrorNotice } from '@/components/error-notice';
import { SkeletonBox } from '@/components/skeleton';
import { errorMessage } from '@/lib/errors';
import { fetchEditablePost, updatePostDetails } from '@/lib/post-edit';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [ratingEnabled, setRatingEnabled] = useState(false);
  const [rating, setRating] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void fetchEditablePost(id)
      .then((post) => {
        if (!active) return;
        setTitle(post.title ?? '');
        setDescription(post.description ?? '');
        setLocation(post.location ?? '');
        setRatingEnabled(post.rating !== null);
        setRating(post.rating ?? 4);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught, 'Klarte ikke å åpne innlegget.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function save() {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updatePostDetails(id, {
        title,
        description,
        location,
        rating: ratingEnabled ? rating : null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (caught) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(caught, 'Klarte ikke å lagre endringene.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 gap-4 bg-canvas px-5 pt-6">
        <SkeletonBox style={{ width: '100%', height: 56, borderRadius: 14 }} />
        <SkeletonBox style={{ width: '100%', height: 112, borderRadius: 14 }} />
        <SkeletonBox style={{ width: '100%', height: 56, borderRadius: 14 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 12 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Tittel"
          placeholderTextColor="#6b6f76"
          selectionColor="#ffffff"
          maxLength={80}
          style={{ paddingHorizontal: 16 }}
          className="h-14 rounded-tile bg-glass text-xl leading-none text-ink"
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
          className="min-h-28 rounded-tile bg-glass text-base text-ink"
        />
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Sted"
          placeholderTextColor="#6b6f76"
          selectionColor="#ffffff"
          maxLength={80}
          style={{ paddingHorizontal: 16 }}
          className="h-14 rounded-tile bg-glass text-base leading-none text-ink"
        />

        <View className="rounded-tile bg-glass p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-ink">Terningkast</Text>
            <Switch value={ratingEnabled} onValueChange={setRatingEnabled} />
          </View>
          {ratingEnabled ? (
            <View className="mt-4 flex-row gap-2">
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: rating === value }}
                  onPress={() => setRating(value)}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${
                    rating === value ? 'bg-ink' : 'bg-surface-raised'
                  }`}>
                  <Text className={rating === value ? 'text-canvas' : 'text-ink'}>{value}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {error ? <ErrorNotice message={error} /> : null}

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          className="mt-4 h-14 items-center justify-center rounded-tile bg-ink active:opacity-80">
          {saving ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text className="text-base text-canvas">Lagre endringer</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

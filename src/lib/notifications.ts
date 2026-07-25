import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationPrefs } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * Which notifications a user gets.
 *
 * Mirrors the columns of `notification_prefs`. A missing row means these
 * defaults, so nothing needs backfilling and a new account is notified
 * correctly before it has ever opened this screen.
 */
export type Prefs = {
  friend_requests: boolean;
  comments: boolean;
  shared_album_posts: boolean;
  friend_posts: boolean;
  likes: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  friend_requests: true,
  comments: true,
  shared_album_posts: true,
  friend_posts: true,
  // Off by default: high volume, almost no information.
  likes: false,
};

/** Labels for the settings list, in the order they are shown. */
export const PREF_LABELS: { key: keyof Prefs; title: string; detail: string }[] = [
  {
    key: 'friend_requests',
    title: 'Venneforespørsler',
    detail: 'Når noen vil bli venn, og når noen godtar deg',
  },
  {
    key: 'shared_album_posts',
    title: 'Delte album',
    detail: 'Når noen legger til et bilde i et album dere deler',
  },
  {
    key: 'comments',
    title: 'Kommentarer',
    detail: 'Når noen kommenterer på bildet ditt',
  },
  {
    key: 'friend_posts',
    title: 'Nye øyeblikk',
    detail: 'Når en venn legger ut et nytt bilde',
  },
  {
    key: 'likes',
    title: 'Hjerter',
    detail: 'Når noen liker bildet ditt',
  },
];

/** Identifier for the daily prompt, so it can be replaced rather than stacked. */
const DAILY_REMINDER_ID = 'ektetid-daglig-paaminnelse';

/** When the prompt lands. Early evening: the day has happened, but is not over. */
const REMINDER_HOUR = 19;

/**
 * Show notifications while the app is open too.
 *
 * Without this iOS silently drops a notification that arrives in the
 * foreground, which makes the whole feature look broken when you are testing it
 * with the app in front of you.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for permission and store the push token.
 *
 * Returns false if the user declined or this is a simulator — iOS only issues
 * push tokens to real hardware, so there is nothing to register otherwise.
 *
 * Call this after a moment that earns the prompt, never on first launch: iOS
 * gives one chance, and asking before the user has a friend or a photo is how
 * you get a permanent no.
 */
export async function registerForPush(userId: string): Promise<boolean> {
  if (!Device.isDevice) return false;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;

  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return false;

  const token = await Notifications.getExpoPushTokenAsync();

  // Upsert on the token: reinstalling gives a new token, and the same device
  // may be signed in as someone else, so the row has to follow the token.
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { token: token.data, user_id: userId, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
      { onConflict: 'token' }
    );

  if (error) throw error;
  return true;
}

/** Forget this device, so a signed-out phone stops receiving someone's posts. */
export async function unregisterPush(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    await supabase.from('push_tokens').delete().eq('token', token.data);
  } catch {
    // A device that never had a token has nothing to remove, and failing to
    // clean up must not block signing out.
  }
}

export async function fetchPrefs(userId: string): Promise<Prefs> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('friend_requests, comments, shared_album_posts, friend_posts, likes')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? { ...DEFAULT_PREFS, ...(data as Partial<NotificationPrefs>) } : DEFAULT_PREFS;
}

export async function savePrefs(userId: string, prefs: Prefs): Promise<void> {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * The daily "be real" prompt.
 *
 * Scheduled on the device rather than sent from a server: it depends on nothing
 * but the clock, so a round trip and a push token would buy nothing. It also
 * keeps working with no signal.
 */
export async function setDailyReminder(enabled: boolean): Promise<void> {
  // Cancel first either way. Scheduling the same identifier twice would
  // otherwise leave two prompts a day, and there is no way to tell them apart
  // afterwards.
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  if (!enabled) return;

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'På tide å være ekte',
      body: 'Ta dagens øyeblikk før dagen er omme.',
      data: { url: 'ektetid:///kamera' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: 0,
    },
  });
}

export async function isDailyReminderOn(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((item) => item.identifier === DAILY_REMINDER_ID);
}

/**
 * Tell the server an event happened, so it can notify whoever should hear.
 *
 * Fire-and-forget on purpose: a notification that fails to send must never
 * surface as a failure to post, comment or add a friend. The work the user
 * asked for has already succeeded by the time this runs.
 *
 * Sending is driven from the client rather than a database trigger so that no
 * service-role key has to live in the database and no scheduled drain is
 * needed. The cost is that an event is lost if the app dies in the same
 * instant, which is an acceptable trade for a notification.
 */
export function notify(kind: NotifyKind, id: string): void {
  void supabase.functions
    .invoke('notify', { body: { kind, id } })
    .catch(() => {
      // Swallowed deliberately — see above.
    });
}

export type NotifyKind = 'friend_request' | 'friend_accepted' | 'comment' | 'post' | 'like';

import { supabase } from '@/lib/supabase';

/**
 * Browser push subscription.
 *
 * The native app's equivalent lives in notifications.ts and shares nothing with
 * this but its purpose: there, expo-notifications hands back an opaque token
 * that Expo resolves to a device. Here the browser hands back an endpoint it
 * owns plus the keys needed to encrypt to it, and delivery is a POST straight
 * to that endpoint.
 *
 * This file is only ever imported from `.web` code, so it makes no attempt to
 * be safe on native.
 */

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_KEY;

/**
 * Whether this browser can do any of it.
 *
 * On iPhone all three exist only once the app has been added to the home
 * screen — Safari deliberately withholds push from tabs — so this doubles as
 * the check for "has this been installed".
 */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * The application server key has to reach `subscribe` as bytes, even though it
 * is published everywhere as base64url.
 */
function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** The browser gives keys back as raw buffers; the database stores base64url. */
function encodeKey(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function worker(): Promise<ServiceWorkerRegistration> {
  // `ready` resolves once a worker is actually controlling the page, which
  // matters: subscribing against a registration that is still installing fails.
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

/**
 * Ask permission, subscribe, and store the result.
 *
 * Returns false when the user declines. Declining is a normal answer and not an
 * error — and it is permanent until they change it in browser settings, since
 * `requestPermission` resolves instantly with `denied` from then on.
 */
export async function registerForWebPush(userId: string): Promise<boolean> {
  if (!isWebPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await worker();

  // An existing subscription is reused. Browsers return the same endpoint until
  // it is unsubscribed, and subscribing twice with a different key throws.
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Required by every browser: a push must result in something the user
      // sees. Silent background pushes are not available to web apps.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY!),
    }));

  const { error } = await supabase.from('web_push_subscriptions').upsert(
    {
      endpoint: subscription.endpoint,
      user_id: userId,
      p256dh: encodeKey(subscription.getKey('p256dh')),
      auth: encodeKey(subscription.getKey('auth')),
    },
    { onConflict: 'endpoint' }
  );

  if (error) throw error;
  return true;
}

/** Whether this browser is currently subscribed. */
export async function isSubscribed(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return false;
  return !!(await registration.pushManager.getSubscription());
}

/**
 * Stop notifications on this browser.
 *
 * The row goes as well as the subscription. Left behind, the server would keep
 * posting to an endpoint the browser has abandoned until the push service
 * eventually answers 410.
 */
export async function unregisterWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await supabase.from('web_push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

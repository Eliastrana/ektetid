/**
 * The notification settings, on web: absent.
 *
 * expo-notifications is Android and iOS only, so every switch in the real
 * component controls nothing here. The calls are inside try/catch and so fail
 * quietly rather than crashing — which is the worse outcome: a row of switches
 * that move when tapped, save nothing, and read as broken rather than
 * unavailable.
 *
 * Nothing is rendered at all, heading included, so the profile screen closes
 * over the gap instead of showing an empty "Varsler".
 *
 * If web push is ever built it will not go here. A PushSubscription is an
 * endpoint and two keys rather than an Expo token, and delivery is the Web Push
 * protocol rather than the Expo Push API, so the web version would be its own
 * component sharing only the preference rows.
 */
export function NotificationSettings(_props: { userId: string }) {
  return null;
}

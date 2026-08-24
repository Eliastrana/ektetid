/**
 * The "Varsler" section, on Android: absent.
 *
 * Push here needs Firebase — a google-services.json and an FCM sender — and
 * neither is configured, so registering a token fails. Offering switches that
 * cannot take effect is worse than offering nothing, so the whole section
 * including its heading is left out, the way profil.tsx already expects for a
 * platform without notifications.
 *
 * The web build has its own implementation and is unaffected: browsers use
 * VAPID web push through the service worker, which does not involve Firebase.
 */
export function NotificationSettings(_props: { userId: string }) {
  return null;
}

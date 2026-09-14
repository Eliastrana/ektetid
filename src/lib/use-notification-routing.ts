import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Open whatever a tapped notification was about.
 *
 * Every notification carries a `url` in its payload — the same `ektetid://`
 * links the widget and deep links already use — so routing is one lookup rather
 * than a switch over notification kinds that has to be kept in step with the
 * server.
 *
 * Both paths are handled: a tap while the app is running, and a tap that
 * launched it. The second is easy to miss, and missing it means the notification
 * appears to do nothing at all in the case where the user is least likely to
 * already be looking at the right screen.
 */
export function useNotificationRouting(enabled = true): void {
  const router = useRouter();
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      const notificationId = response?.notification.request.identifier;
      const url = response?.notification.request.content.data?.url;
      if (
        typeof url !== 'string' ||
        !notificationId ||
        notificationId === lastHandledId.current
      ) {
        return;
      }
      lastHandledId.current = notificationId;

      // Strip the scheme: expo-router wants an in-app path, and passing the
      // full URL routes to a screen that does not exist.
      const path = url.replace(/^ektetid:\/\//, '');
      if (!path) return;

      // The response is single-use. Clearing it avoids reopening the same
      // screen if the root layout is mounted again later in this session.
      Notifications.clearLastNotificationResponse();
      router.push(path as never);
    };

    // A cold start has its response waiting rather than arriving as an event.
    // The synchronous SDK 57 API avoids adding another loading dependency to
    // app launch; this hook is enabled only once the protected routes exist.
    open(Notifications.getLastNotificationResponse());

    const subscription = Notifications.addNotificationResponseReceivedListener(open);

    return () => {
      subscription.remove();
    };
  }, [enabled, router]);
}

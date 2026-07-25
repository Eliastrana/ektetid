import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

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
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url !== 'string') return;

      // Strip the scheme: expo-router wants an in-app path, and passing the
      // full URL routes to a screen that does not exist.
      const path = url.replace(/^ektetid:\/\//, '');
      if (path) router.push(path as never);
    };

    // A cold start has its response waiting rather than arriving as an event.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled) open(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(open);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);
}

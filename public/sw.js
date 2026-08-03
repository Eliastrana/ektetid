/**
 * EkteTid's service worker.
 *
 * Exists for one reason: a browser will only deliver a push to a service
 * worker, and only shows a notification if that worker asks it to. There is no
 * caching or offline handling here — the app is useless without the network
 * anyway, since every photo is a signed URL fetched on demand.
 *
 * Plain JavaScript in public/ rather than anything the bundler touches: it is
 * served from the origin root, which is what lets it claim a scope of "/".
 */

/* global self, clients */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close. A worker
  // that only activates on the next visit means the first attempt to enable
  // notifications appears to do nothing.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || 'EkteTid';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag for the same destination, so ten new photos in one album
      // replace each other instead of stacking into a wall.
      tag: payload.url || 'ektetid',
      renotify: true,
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Notifications carry the same ektetid:// links the native app and the widget
  // use. In a browser those are paths, not schemes.
  const raw = (event.notification.data && event.notification.data.url) || '/';
  const path = raw.replace(/^ektetid:\/\//, '/').replace(/^\/+/, '/');
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse a tab that is already open rather than piling up new ones. Any
      // tab on this origin will do — it is a single-page app, so navigating it
      // is cheaper than a cold start.
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});

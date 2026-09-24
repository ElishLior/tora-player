/*
 * Web Push handlers, loaded by public/sw.js via importScripts('/sw-push.js').
 * Payload (JSON, see src/lib/notifications/push.ts): { title, body, url, tag }.
 * Only push, notificationclick and pushsubscriptionchange live here; caching
 * belongs to sw.js.
 */

const PUSH_FALLBACK_URL = '/he';
const PUSH_ICON = '/icons/icon-192.png';

function samePushTarget(url) {
  try {
    const target = new URL(url || PUSH_FALLBACK_URL, self.location.origin);
    return target.origin === self.location.origin ? target.href : new URL(PUSH_FALLBACK_URL, self.location.origin).href;
  } catch {
    return new URL(PUSH_FALLBACK_URL, self.location.origin).href;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'נגן תורה';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: PUSH_ICON,
      dir: 'rtl',
      lang: 'he',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: samePushTarget(payload.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = samePushTarget(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const appWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (appWindow) {
        await appWindow.focus();
        try {
          await appWindow.navigate(targetUrl);
          return;
        } catch {
          // Uncontrolled window: navigate() is not allowed; open a new one below.
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// The browser rotated the subscription: re-subscribe and tell the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const subscription =
        event.newSubscription ||
        (event.oldSubscription &&
          (await self.registration.pushManager.subscribe(event.oldSubscription.options)));
      if (!subscription) return;
      await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          previousEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : undefined,
        }),
      });
    })(),
  );
});

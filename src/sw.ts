/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// A new version takes over straight away instead of waiting until every tab is closed;
// the page then reloads itself (registerType: 'autoUpdate').
self.skipWaiting();
clientsClaim();

// App shell works offline.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Reminders pushed from the server.
self.addEventListener('push', (event) => {
  let msg: { title?: string; body?: string; tag?: string; url?: string } = {};
  try { msg = event.data?.json() ?? {}; } catch { msg = { body: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(msg.title || 'One Thing', {
      body: msg.body || '',
      tag: msg.tag,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url: msg.url || '/' },
      requireInteraction: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url as string) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) { await win.focus(); await win.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});

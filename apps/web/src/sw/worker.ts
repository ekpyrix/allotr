// The service worker, built to /sw.js by build/service-worker.ts. It caches
// the app shell and static files of one build so the app opens offline;
// figures always come from the server. A new build installs beside the old
// one and waits until the page asks it to take over (the update prompt).
import { route } from './policy.ts';
import { parsePush } from './push.ts';

declare const self: ServiceWorkerGlobalScope;

interface Precache {
  version: string;
  files: string[];
}

// Replaced with the build's file list when the bundle is written.
const precache = JSON.parse('__ALLOTR_PRECACHE__') as Precache;

const CACHE_PREFIX = 'allotr-shell-';
const cacheName = `${CACHE_PREFIX}${precache.version}`;
const files = new Set(precache.files);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(precache.files)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName)
          .map((name) => caches.delete(name)),
      );
      // The first install controls open pages at once, so they work offline
      // without a reload. Later versions get here only after skip-waiting.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'skip-waiting'
  )
    void self.skipWaiting();
});

async function fromCache(request: Request, path: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(path);
  return hit ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const target = route(event.request, self.location.origin, files);
  if (target.kind === 'network') return;
  const path = target.kind === 'shell' ? '/index.html' : target.path;
  event.respondWith(fromCache(event.request, path));
});

// Web Push (ADR 0024): shown only for a device the user turned it on for.
// The payload names a path in this app; tapping the notification opens it.
self.addEventListener('push', (event) => {
  const message = parsePush(event.data === null ? null : event.data.text());
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icon-192.png',
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const url = parsePush(JSON.stringify(data)).url;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const target = new URL(url, self.location.origin).href;
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

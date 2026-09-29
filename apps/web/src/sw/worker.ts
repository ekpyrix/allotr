// The service worker, built to /sw.js by build/service-worker.ts. It caches
// the app shell and static files of one build so the app opens offline;
// figures always come from the server. A new build installs beside the old
// one and waits until the page asks it to take over (the update prompt).
import { route } from './policy.ts';

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

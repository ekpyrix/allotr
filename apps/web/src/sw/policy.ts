// Which requests the service worker answers. Only build output is cached:
// API calls, probes and every write always go to the network (FR-W3; the
// offline entry queue is FR-W4, M7).

/** Paths the server answers itself; mirrors apps/server/src/http/web.ts. */
export const networkOnlyPrefixes = [
  '/v1/',
  '/healthz',
  '/readyz',
  '/openapi.json',
];

export interface RequestLike {
  method: string;
  url: string;
  mode: string;
}

export type Route =
  /** A page load: answer with the cached app shell. */
  | { kind: 'shell' }
  /** A file from the build: answer from the cache. */
  | { kind: 'precached'; path: string }
  /** Leave it to the network; the worker does not call respondWith. */
  | { kind: 'network' };

export function route(
  request: RequestLike,
  origin: string,
  precached: ReadonlySet<string>,
): Route {
  if (request.method !== 'GET') return { kind: 'network' };
  const url = new URL(request.url);
  if (url.origin !== origin) return { kind: 'network' };
  const { pathname } = url;
  if (networkOnlyPrefixes.some((prefix) => pathname.startsWith(prefix)))
    return { kind: 'network' };
  if (precached.has(pathname)) return { kind: 'precached', path: pathname };
  if (request.mode === 'navigate') return { kind: 'shell' };
  return { kind: 'network' };
}

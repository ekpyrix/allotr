import { describe, expect, it } from 'vitest';
import { route, type RequestLike } from './policy.ts';

const origin = 'https://allotr.example';
const precached = new Set(['/index.html', '/assets/index-abc123.js']);

function get(path: string, mode = 'cors'): RequestLike {
  return { method: 'GET', url: `${origin}${path}`, mode };
}

describe('route', () => {
  it('answers precached build files from the cache', () => {
    expect(route(get('/assets/index-abc123.js'), origin, precached)).toEqual({
      kind: 'precached',
      path: '/assets/index-abc123.js',
    });
  });

  it('answers page loads with the app shell', () => {
    expect(route(get('/ledger', 'navigate'), origin, precached)).toEqual({
      kind: 'shell',
    });
    expect(route(get('/?from=home', 'navigate'), origin, precached)).toEqual({
      kind: 'shell',
    });
  });

  it.each([
    '/v1/today',
    '/v1/auth/get-session',
    '/healthz',
    '/readyz',
    '/openapi.json',
  ])('leaves %s to the network, even as a page load', (path) => {
    expect(route(get(path), origin, precached)).toEqual({ kind: 'network' });
    expect(route(get(path, 'navigate'), origin, precached)).toEqual({
      kind: 'network',
    });
  });

  it('leaves writes to the network', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const request = { ...get('/assets/index-abc123.js'), method };
      expect(route(request, origin, precached)).toEqual({ kind: 'network' });
    }
  });

  it('leaves other origins and unknown files to the network', () => {
    expect(
      route(
        { method: 'GET', url: 'https://cdn.example/x.js', mode: 'cors' },
        origin,
        precached,
      ),
    ).toEqual({ kind: 'network' });
    expect(route(get('/assets/old-zzz999.js'), origin, precached)).toEqual({
      kind: 'network',
    });
  });
});

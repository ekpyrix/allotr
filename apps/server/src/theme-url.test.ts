import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fetchThemeText,
  isPublicAddress,
  ThemeUrlError,
  type FetchDeps,
} from './theme-url.ts';

describe('isPublicAddress', () => {
  it.each([
    ['0.0.0.0', 'unspecified'],
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.20.0.5', 'private'],
    ['192.168.1.10', 'private'],
    ['169.254.169.254', 'link-local'],
    ['100.72.0.1', 'carrier-grade NAT'],
    ['224.0.0.251', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['192.0.2.1', 'documentation'],
    ['::', 'IPv6 unspecified'],
    ['::1', 'IPv6 loopback'],
    ['fd12:3456::1', 'IPv6 unique local'],
    ['fe80::1', 'IPv6 link-local'],
    ['ff02::1', 'IPv6 multicast'],
    ['2001:db8::1', 'IPv6 documentation'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['64:ff9b::a00:1', 'NAT64'],
    ['not an address', 'not an address'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    ['93.184.215.14'],
    ['1.1.1.1'],
    ['2606:4700::1111'],
    ['::ffff:1.1.1.1'],
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ThemeUrlError) return error.reason;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('fetchThemeText', () => {
  const resolveTo =
    (...addresses: string[]): FetchDeps['resolve'] =>
    () =>
      Promise.resolve(
        addresses.map((address) => ({
          address,
          family: address.includes(':') ? (6 as const) : (4 as const),
        })),
      );
  let server: Server;
  let port = 0;
  let connections = 0;

  // A plain HTTP server on loopback stands in for the remote host: the
  // test's `request` speaks HTTP and `allow` lets loopback through.
  beforeAll(async () => {
    server = createServer((req, res) => {
      connections += 1;
      if (req.url === '/theme.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"base":"#1d2421","text":"#d8e2da"}');
      } else if (req.url === '/moved') {
        res.writeHead(302, { location: 'https://example.test/theme.json' });
        res.end();
      } else if (req.url === '/big') {
        res.writeHead(200);
        res.end('x'.repeat(70 * 1024));
      } else if (req.url === '/slow') {
        setTimeout(() => res.end('late'), 2000);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  const local: FetchDeps = {
    resolve: resolveTo('127.0.0.1'),
    allow: () => true,
    request: (options) => request({ ...options, protocol: 'http:', port }),
    timeoutMs: 300,
    maxBytes: 64 * 1024,
  };

  it('fetches the text from the checked address', async () => {
    expect(
      await fetchThemeText('https://themes.example.test/theme.json', local),
    ).toBe('{"base":"#1d2421","text":"#d8e2da"}');
  });

  it('refuses http and credentials without connecting', async () => {
    const before = connections;
    expect(await refusal(fetchThemeText('http://example.test/t', local))).toBe(
      'not_https',
    );
    expect(await refusal(fetchThemeText('ftp://example.test/t', local))).toBe(
      'not_https',
    );
    expect(await refusal(fetchThemeText('not a url', local))).toBe('not_https');
    expect(
      await refusal(fetchThemeText('https://me:secret@example.test/t', local)),
    ).toBe('credentials');
    expect(connections).toBe(before);
  });

  it('refuses a name that resolves to any non-public address', async () => {
    const before = connections;
    const guarded = { ...local, allow: isPublicAddress };
    for (const addresses of [
      ['127.0.0.1'],
      ['10.0.0.8'],
      ['169.254.169.254'],
      ['::1'],
      ['::ffff:192.168.0.1'],
      // One public address does not excuse a private one beside it.
      ['1.1.1.1', '192.168.0.1'],
    ]) {
      expect(
        await refusal(
          fetchThemeText('https://themes.example.test/theme.json', {
            ...guarded,
            resolve: resolveTo(...addresses),
          }),
        ),
        addresses.join(','),
      ).toBe('not_public');
    }
    expect(
      await refusal(
        fetchThemeText('https://[::1]/theme.json', {
          ...guarded,
          resolve: resolveTo('::1'),
        }),
      ),
    ).toBe('not_public');
    expect(
      await refusal(
        fetchThemeText('https://nowhere.example.test/', {
          ...guarded,
          resolve: () => Promise.reject(new Error('ENOTFOUND')),
        }),
      ),
    ).toBe('unresolved');
    expect(connections).toBe(before);
  });

  it('does not follow redirects', async () => {
    expect(
      await refusal(fetchThemeText('https://themes.example.test/moved', local)),
    ).toBe('redirect');
  });

  it('stops at the size cap', async () => {
    expect(
      await refusal(fetchThemeText('https://themes.example.test/big', local)),
    ).toBe('too_large');
  });

  it('gives up after the timeout', async () => {
    expect(
      await refusal(fetchThemeText('https://themes.example.test/slow', local)),
    ).toBe('timeout');
  });

  it('refuses any answer but 200', async () => {
    expect(
      await refusal(fetchThemeText('https://themes.example.test/gone', local)),
    ).toBe('status');
  });
});

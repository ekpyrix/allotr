import { describe, expect, it } from 'vitest';
import { createClientIpResolver } from './client-ip.ts';

describe('client IP resolution', () => {
  it('uses the socket address when no proxy is trusted', () => {
    const resolve = createClientIpResolver([]);
    expect(resolve('203.0.113.9', '198.51.100.1')).toBe('203.0.113.9');
  });

  it('ignores forwarded headers from untrusted peers', () => {
    const resolve = createClientIpResolver(['10.0.0.1']);
    expect(resolve('203.0.113.9', '198.51.100.1')).toBe('203.0.113.9');
  });

  it('takes the nearest untrusted hop behind trusted proxies', () => {
    const resolve = createClientIpResolver(['10.0.0.0/8']);
    expect(resolve('10.0.0.1', '198.51.100.7, 203.0.113.5, 10.0.0.2')).toBe(
      '203.0.113.5',
    );
  });

  it('normalises IPv4-mapped IPv6 socket addresses', () => {
    const resolve = createClientIpResolver(['127.0.0.1']);
    expect(resolve('::ffff:127.0.0.1', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('falls back to the proxy address when the header is missing or invalid', () => {
    const resolve = createClientIpResolver(['10.0.0.1']);
    expect(resolve('10.0.0.1', null)).toBe('10.0.0.1');
    expect(resolve('10.0.0.1', 'not-an-ip')).toBe('10.0.0.1');
  });

  it('returns undefined without a socket address', () => {
    expect(createClientIpResolver([])(undefined, null)).toBeUndefined();
  });
});

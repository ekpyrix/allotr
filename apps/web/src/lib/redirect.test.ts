import { describe, expect, it } from 'vitest';
import { safeRedirect, shellPaths, subTabPaths } from './redirect.ts';

describe('safeRedirect', () => {
  it('accepts destinations and sub-tab addresses', () => {
    for (const path of [
      '/',
      '/transactions',
      '/accounts/credit',
      '/budget/pools',
      '/settings/data',
    ])
      expect(safeRedirect(path)).toBe(path);
  });

  it('rejects unknown, external and protocol-relative targets', () => {
    for (const value of [
      '//evil.example',
      'https://evil.example',
      '/nope',
      '/budget/nope',
      '/accounts/all',
      42,
      undefined,
    ])
      expect(safeRedirect(value)).toBeUndefined();
  });

  it('lists every sub-tab once, without the bare accounts tab', () => {
    expect(new Set(subTabPaths).size).toBe(subTabPaths.length);
    expect(subTabPaths).toContain('/reports/cycles');
    expect(shellPaths).not.toContain('/accounts/all');
  });
});

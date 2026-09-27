import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect.ts';

describe('safeRedirect', () => {
  it('accepts a signed-in route', () => {
    expect(safeRedirect('/accounts')).toBe('/accounts');
  });

  it.each([
    undefined,
    42,
    '',
    '/',
    '/sign-in',
    '//evil.example/today',
    'https://evil.example/today',
    '/today?next=//evil.example',
    '/nowhere',
  ])('refuses %j', (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });
});

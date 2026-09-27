import { describe, expect, it } from 'vitest';
import {
  cacheMode,
  readCachedMode,
  resolveScheme,
  THEME_MODE_KEY,
} from './theme-mode.ts';

function storage(value: string | null) {
  return { getItem: (key: string) => (key === THEME_MODE_KEY ? value : null) };
}

const blocked = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('blocked');
  },
};

describe('resolveScheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('%s with a dark device=%s is %s', (mode, prefersDark, scheme) => {
    expect(resolveScheme(mode, prefersDark)).toBe(scheme);
  });
});

describe('readCachedMode', () => {
  it.each(['light', 'dark', 'system'] as const)('reads %s', (mode) => {
    expect(readCachedMode(storage(mode))).toBe(mode);
  });

  it.each([null, 'purple', '', '"dark"'])(
    'falls back to system for %j',
    (value) => {
      expect(readCachedMode(storage(value))).toBe('system');
    },
  );

  it('falls back to system when storage is missing or blocked', () => {
    expect(readCachedMode(undefined)).toBe('system');
    expect(readCachedMode(blocked)).toBe('system');
  });
});

describe('cacheMode', () => {
  it('writes the mode', () => {
    const written: [string, string][] = [];
    cacheMode(
      {
        setItem: (key, value) => {
          written.push([key, value]);
        },
      },
      'dark',
    );
    expect(written).toEqual([[THEME_MODE_KEY, 'dark']]);
  });

  it('ignores storage that is missing or blocked', () => {
    expect(() => {
      cacheMode(blocked, 'dark');
    }).not.toThrow();
    expect(() => {
      cacheMode(undefined, 'dark');
    }).not.toThrow();
  });
});

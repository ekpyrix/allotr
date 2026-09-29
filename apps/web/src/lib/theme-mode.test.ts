import {
  DEFAULT_APPEARANCE,
  darkTheme,
  lightTheme,
  SHIPPED_THEMES,
  type NamedTheme,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  cacheMode,
  cacheTokens,
  readCachedMode,
  readCachedTokens,
  resolveScheme,
  slotTokens,
  THEME_MODE_KEY,
  THEME_TOKENS_KEY,
  tokenProperties,
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

const paper = SHIPPED_THEMES.find((theme) => theme.id === 'paper');
const mine: NamedTheme = {
  id: 'c1',
  name: 'Mine',
  scheme: 'dark',
  tokens: { ...darkTheme, background: '#000000' },
};

describe('slotTokens', () => {
  it('leaves built-in slots to the stylesheet', () => {
    expect(slotTokens(DEFAULT_APPEARANCE, [])).toEqual({});
  });

  it('gives the colours of shipped and custom themes', () => {
    expect(
      slotTokens({ ...DEFAULT_APPEARANCE, light: 'paper', dark: 'c1' }, [mine]),
    ).toEqual({ light: paper?.tokens, dark: mine.tokens });
  });

  it('ignores a theme that is gone or of the other scheme', () => {
    expect(
      slotTokens({ ...DEFAULT_APPEARANCE, light: 'c1', dark: 'gone' }, [mine]),
    ).toEqual({});
  });
});

function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

describe('cached tokens', () => {
  it('round-trips the slot colours', () => {
    const storage = memory();
    cacheTokens(storage, { dark: mine.tokens });
    expect(readCachedTokens(storage)).toEqual({ dark: mine.tokens });
  });

  it('removes the key when every slot is built-in', () => {
    const storage = memory({ [THEME_TOKENS_KEY]: '{}' });
    cacheTokens(storage, {});
    expect(storage.items.has(THEME_TOKENS_KEY)).toBe(false);
  });

  it.each([
    'not json',
    '"light"',
    JSON.stringify({ light: { ...lightTheme, ring: 'url(x)' } }),
    JSON.stringify({ light: { background: '#fff' } }),
  ])('reads nothing from %j', (value) => {
    expect(readCachedTokens(memory({ [THEME_TOKENS_KEY]: value }))).toEqual({});
  });

  it('ignores storage that is missing or blocked', () => {
    expect(readCachedTokens(undefined)).toEqual({});
    expect(readCachedTokens(blocked)).toEqual({});
    expect(() => {
      cacheTokens({ ...blocked, removeItem: blocked.setItem }, {});
    }).not.toThrow();
  });
});

describe('tokenProperties', () => {
  it('names every token as a custom property', () => {
    const properties = tokenProperties(lightTheme);
    expect(properties).toContainEqual(['--muted-foreground', '#55655e']);
    expect(properties).toHaveLength(Object.keys(lightTheme).length);
  });
});

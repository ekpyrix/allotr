import {
  DEFAULT_APPEARANCE,
  findPaletteTheme,
  paletteTheme,
  ROLES,
  toThemeFileV2,
  type CustomThemeView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  cacheMode,
  cacheRoles,
  customPaletteThemes,
  LEGACY_TOKENS_KEY,
  readCachedMode,
  readCachedRoles,
  resolveScheme,
  roleProperties,
  slotRoles,
  THEME_MODE_KEY,
  THEME_ROLES_KEY,
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

const paper = findPaletteTheme('paper', []);
const mocha = findPaletteTheme('catppuccin-mocha', []);
if (mocha === undefined) throw new Error('No Catppuccin Mocha');
const mine = paletteTheme(
  'c1',
  toThemeFileV2({
    name: 'Mine',
    scheme: 'dark',
    palette: mocha.palette,
    roles: { canvas: { slot: 'crust' } },
  }),
);

describe('slotRoles', () => {
  it('leaves default slots to the stylesheet', () => {
    expect(slotRoles(DEFAULT_APPEARANCE, [])).toEqual({});
  });

  it('gives the roles of shipped and custom themes', () => {
    expect(
      slotRoles({ ...DEFAULT_APPEARANCE, light: 'paper', dark: 'c1' }, [mine]),
    ).toEqual({ light: paper?.resolved.roles, dark: mine.resolved.roles });
    expect(mine.resolved.roles.canvas).toBe(mocha.palette.neutrals.crust);
  });

  it('reads the earlier built-in ids as Allotr Classic', () => {
    const roles = slotRoles({ ...DEFAULT_APPEARANCE, light: 'light' }, []);
    expect(roles.light?.canvas).toBe('#f3f5f2');
  });

  it('ignores a theme that is gone or of the other scheme', () => {
    expect(
      slotRoles({ ...DEFAULT_APPEARANCE, light: 'c1', dark: 'gone' }, [mine]),
    ).toEqual({});
  });
});

describe('customPaletteThemes', () => {
  it('reads the API view of a custom theme', () => {
    const view: CustomThemeView = {
      id: 'c2',
      version: 2,
      name: 'Two',
      scheme: 'dark',
      palette: mine.palette,
      roles: mine.roles,
      tokens: {} as CustomThemeView['tokens'],
    };
    const [theme] = customPaletteThemes([view]);
    expect(theme?.resolved.roles).toEqual(mine.resolved.roles);
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

describe('cached roles', () => {
  it('round-trips the slot colours', () => {
    const storage = memory();
    cacheRoles(storage, { dark: mine.resolved.roles });
    expect(readCachedRoles(storage)).toEqual({ dark: mine.resolved.roles });
  });

  it('removes the key when every slot is on its default, and the v1 cache', () => {
    const storage = memory({
      [THEME_ROLES_KEY]: '{}',
      [LEGACY_TOKENS_KEY]: '{"light":{}}',
    });
    cacheRoles(storage, {});
    expect(storage.items.has(THEME_ROLES_KEY)).toBe(false);
    expect(storage.items.has(LEGACY_TOKENS_KEY)).toBe(false);
  });

  it.each([
    'not json',
    '"light"',
    JSON.stringify({ light: { ...mine.resolved.roles, ring: 'url(x)' } }),
    JSON.stringify({ light: { canvas: '#fff' } }),
  ])('reads nothing from %j', (value) => {
    expect(readCachedRoles(memory({ [THEME_ROLES_KEY]: value }))).toEqual({});
  });

  it('ignores storage that is missing or blocked', () => {
    expect(readCachedRoles(undefined)).toEqual({});
    expect(readCachedRoles(blocked)).toEqual({});
    expect(() => {
      cacheRoles({ ...blocked, removeItem: blocked.setItem }, {});
    }).not.toThrow();
  });
});

describe('roleProperties', () => {
  it('names every role as a custom property', () => {
    const properties = roleProperties(mine.resolved.roles);
    expect(properties).toContainEqual(['--canvas', mine.resolved.roles.canvas]);
    expect(properties).toHaveLength(ROLES.length);
  });
});

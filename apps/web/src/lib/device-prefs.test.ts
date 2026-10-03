import { describe, expect, it } from 'vitest';
import {
  applyPrefs,
  DEVICE_PREFS,
  effectiveMotion,
  readPref,
  writePref,
} from './device-prefs.ts';

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('readPref', () => {
  it('reads a stored value', () => {
    expect(readPref('motion', memory({ 'allotr.motion': 'off' }))).toBe('off');
    expect(
      readPref('density', memory({ 'allotr.density': 'comfortable' })),
    ).toBe('comfortable');
  });

  it.each(Object.keys(DEVICE_PREFS) as (keyof typeof DEVICE_PREFS)[])(
    'falls back for %s on a bad value, nothing stored, or throwing storage',
    (pref) => {
      const { key, fallback } = DEVICE_PREFS[pref];
      expect(readPref(pref, memory({ [key]: 'sideways' }))).toBe(fallback);
      expect(readPref(pref, memory())).toBe(fallback);
      expect(readPref(pref, throwing)).toBe(fallback);
      expect(readPref(pref, undefined)).toBe(fallback);
    },
  );
});

describe('writePref', () => {
  it('stores a choice and removes the key for the default', () => {
    const store = memory();
    writePref('haptics', 'off', store);
    expect(store.values.get('allotr.haptics')).toBe('off');
    writePref('haptics', 'on', store);
    expect(store.values.has('allotr.haptics')).toBe(false);
  });

  it('survives throwing storage', () => {
    expect(() => {
      writePref('motion', 'reduced', throwing);
    }).not.toThrow();
  });
});

describe('effectiveMotion', () => {
  it('follows the device on System', () => {
    expect(effectiveMotion('system', false)).toBe('full');
    expect(effectiveMotion('system', true)).toBe('reduced');
  });

  it('lets a chosen setting win over the device', () => {
    expect(effectiveMotion('full', true)).toBe('full');
    expect(effectiveMotion('off', false)).toBe('off');
    expect(effectiveMotion('reduced', false)).toBe('reduced');
  });
});

describe('applyPrefs', () => {
  it('sets data attributes only for non-default choices', () => {
    const doc = { documentElement: { dataset: {} as DOMStringMap } };
    applyPrefs(doc, { motion: 'off', density: 'comfortable' });
    expect(doc.documentElement.dataset).toEqual({
      motion: 'off',
      density: 'comfortable',
    });
    applyPrefs(doc, { motion: 'system', density: 'compact' });
    expect(doc.documentElement.dataset).toEqual({});
  });
});

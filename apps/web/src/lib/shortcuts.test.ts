import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS_KEY,
  readShortcutsEnabled,
  saveShortcutsEnabled,
  shortcutAction,
  type ShortcutEvent,
} from './shortcuts.ts';

const press = (patch: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key: '1',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  target: { tagName: 'BODY', isContentEditable: false },
  ...patch,
});

const text = (tagName: string) => ({ tagName, isContentEditable: false });

describe('shortcutAction', () => {
  it.each([
    ['1', { type: 'destination', index: 0 }],
    ['2', { type: 'destination', index: 1 }],
    ['3', { type: 'destination', index: 2 }],
    ['4', { type: 'destination', index: 3 }],
    ['5', { type: 'destination', index: 4 }],
    ['[', { type: 'sub-tab', step: -1 }],
    [']', { type: 'sub-tab', step: 1 }],
    ['/', { type: 'command-line' }],
    [',', { type: 'settings' }],
    ['f', { type: 'filter' }],
    ['F', { type: 'filter' }],
    ['Escape', { type: 'escape' }],
  ])('maps %s', (key, action) => {
    expect(shortcutAction(press({ key }), true)).toEqual(action);
    expect(shortcutAction(press({ key, target: null }), true)).toEqual(action);
  });

  it.each(['0', '6', 'n', 'N', 'k', 'a', 'Enter', ' '])('ignores %s', (key) => {
    expect(shortcutAction(press({ key }), true)).toBeNull();
  });

  it('does nothing when shortcuts are off', () => {
    for (const key of ['1', '/', 'Escape'])
      expect(shortcutAction(press({ key }), false)).toBeNull();
  });

  it('ignores repeats and composition', () => {
    expect(shortcutAction(press({ repeat: true }), true)).toBeNull();
    expect(shortcutAction(press({ isComposing: true }), true)).toBeNull();
  });

  it('ignores modifiers, including Ctrl+K and Cmd+K', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const)
      for (const key of ['1', 'k', '/', 'Escape'])
        expect(shortcutAction(press({ key, [mod]: true }), true)).toBeNull();
  });

  it('ignores keys inside text fields and editable content', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT'])
      expect(shortcutAction(press({ target: text(tag) }), true)).toBeNull();
    expect(
      shortcutAction(
        press({ target: { tagName: 'DIV', isContentEditable: true } }),
        true,
      ),
    ).toBeNull();
  });

  it('lets Esc through while typing, so the command line can be left', () => {
    expect(
      shortcutAction(press({ key: 'Escape', target: text('INPUT') }), true),
    ).toEqual({ type: 'escape' });
  });

  it('ignores everything inside an open overlay', () => {
    const target = {
      tagName: 'DIV',
      isContentEditable: false,
      inOverlay: true,
    };
    for (const key of ['1', '[', '/', 'Escape'])
      expect(shortcutAction(press({ key, target }), true)).toBeNull();
  });

  it('fires from buttons and links', () => {
    expect(
      shortcutAction(press({ target: text('BUTTON') }), true),
    ).not.toBeNull();
    expect(shortcutAction(press({ target: text('A') }), true)).not.toBeNull();
  });

  it('never produces an action while typing (except Esc) or with a modifier', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 3 }),
        fc.constantFrom('INPUT', 'TEXTAREA', 'SELECT'),
        (key, tagName) => {
          const action = shortcutAction(
            press({ key, target: text(tagName) }),
            true,
          );
          expect(action === null || action.type === 'escape').toBe(true);
          expect(key === 'Escape' || action === null).toBe(true);
        },
      ),
    );
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 3 }),
        fc.constantFrom('ctrlKey', 'metaKey', 'altKey'),
        (key, mod) => {
          expect(shortcutAction(press({ key, [mod]: true }), true)).toBeNull();
        },
      ),
    );
  });
});

describe('the per-device switch', () => {
  it('is on unless stored as off', () => {
    const storage = (value: string | null) => ({ getItem: () => value });
    expect(readShortcutsEnabled(undefined)).toBe(true);
    expect(readShortcutsEnabled(storage(null))).toBe(true);
    expect(readShortcutsEnabled(storage('on'))).toBe(true);
    expect(readShortcutsEnabled(storage('off'))).toBe(false);
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readShortcutsEnabled(blocked)).toBe(true);
    expect(() => {
      saveShortcutsEnabled(blocked, false);
    }).not.toThrow();
  });

  it('saves the choice', () => {
    const saved: [string, string][] = [];
    const storage = {
      setItem: (key: string, value: string) => saved.push([key, value]),
    };
    saveShortcutsEnabled(storage, false);
    saveShortcutsEnabled(storage, true);
    expect(saved).toEqual([
      [SHORTCUTS_KEY, 'off'],
      [SHORTCUTS_KEY, 'on'],
    ]);
  });
});

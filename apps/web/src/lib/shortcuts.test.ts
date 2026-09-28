import { describe, expect, it } from 'vitest';
import {
  isQuickEntryShortcut,
  readShortcutsEnabled,
  saveShortcutsEnabled,
  type ShortcutEvent,
} from './shortcuts.ts';

const press = (patch: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key: 'n',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  target: { tagName: 'BODY', isContentEditable: false },
  ...patch,
});

describe('isQuickEntryShortcut', () => {
  it('opens on n and N outside text fields', () => {
    expect(isQuickEntryShortcut(press(), true)).toBe(true);
    expect(isQuickEntryShortcut(press({ key: 'N' }), true)).toBe(true);
    expect(isQuickEntryShortcut(press({ target: null }), true)).toBe(true);
    expect(
      isQuickEntryShortcut(
        press({ target: { tagName: 'BUTTON', isContentEditable: false } }),
        true,
      ),
    ).toBe(true);
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT'])(
    'ignores typing in %s',
    (tagName) => {
      expect(
        isQuickEntryShortcut(
          press({ target: { tagName, isContentEditable: false } }),
          true,
        ),
      ).toBe(false);
    },
  );

  it('ignores contenteditable, modifiers, repeats, composition and other keys', () => {
    for (const event of [
      press({ target: { tagName: 'DIV', isContentEditable: true } }),
      press({ ctrlKey: true }),
      press({ metaKey: true }),
      press({ altKey: true }),
      press({ repeat: true }),
      press({ isComposing: true }),
      press({ key: 'm' }),
    ])
      expect(isQuickEntryShortcut(event, true)).toBe(false);
  });

  it('does nothing when switched off (WCAG 2.2 SC 2.1.4)', () => {
    expect(isQuickEntryShortcut(press(), false)).toBe(false);
  });
});

describe('shortcut preference', () => {
  it('is on unless saved off, and survives blocked storage', () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    };
    expect(readShortcutsEnabled(storage)).toBe(true);
    saveShortcutsEnabled(storage, false);
    expect(readShortcutsEnabled(storage)).toBe(false);
    saveShortcutsEnabled(storage, true);
    expect(readShortcutsEnabled(storage)).toBe(true);
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
});

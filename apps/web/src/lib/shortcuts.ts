// Single-key shortcuts can be triggered by speech input and switch
// devices, so WCAG 2.2 SC 2.1.4 needs a way to turn them off. The choice
// is per device.

export const SHORTCUTS_KEY = 'allotr.shortcuts';

export function readShortcutsEnabled(
  storage: Pick<Storage, 'getItem'> | undefined,
): boolean {
  try {
    return storage?.getItem(SHORTCUTS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveShortcutsEnabled(
  storage: Pick<Storage, 'setItem'> | undefined,
  enabled: boolean,
): void {
  try {
    storage?.setItem(SHORTCUTS_KEY, enabled ? 'on' : 'off');
  } catch {
    // Blocked storage: the choice lasts for this page.
  }
}

interface ShortcutTarget {
  readonly tagName: string;
  readonly isContentEditable: boolean;
}

export interface ShortcutEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly target: ShortcutTarget | null;
}

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** `n` opens quick entry, unless the user is typing somewhere. */
export function isQuickEntryShortcut(
  event: ShortcutEvent,
  enabled: boolean,
): boolean {
  if (!enabled || event.repeat || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key !== 'n' && event.key !== 'N') return false;
  const { target } = event;
  return (
    target === null ||
    !(target.isContentEditable || TEXT_TAGS.has(target.tagName))
  );
}

/**
 * ⌘K or Ctrl+K opens the command palette anywhere; `/` does too, unless
 * the user is typing. Both follow the same on/off setting.
 */
export function isPaletteShortcut(
  event: ShortcutEvent,
  enabled: boolean,
): boolean {
  if (!enabled || event.repeat || event.isComposing || event.altKey)
    return false;
  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key === 'k' || event.key === 'K')
  )
    return true;
  if (event.ctrlKey || event.metaKey || event.key !== '/') return false;
  const { target } = event;
  return (
    target === null ||
    !(target.isContentEditable || TEXT_TAGS.has(target.tagName))
  );
}

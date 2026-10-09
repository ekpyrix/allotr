// Single-key shortcuts can be triggered by speech input and switch
// devices, so WCAG 2.2 SC 2.1.4 needs a way to turn them off. The choice
// is per device. The key map is docs/ui.md §5.

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
  /** Inside an open dialog, menu or listbox, which own their keys. */
  readonly inOverlay?: boolean;
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

export type ShortcutAction =
  | { readonly type: 'destination'; readonly index: 0 | 1 | 2 | 3 | 4 }
  | { readonly type: 'sub-tab'; readonly step: -1 | 1 }
  | { readonly type: 'command-line' }
  | { readonly type: 'settings' }
  | { readonly type: 'filter' }
  | { readonly type: 'escape' };

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const DESTINATION_KEYS: Readonly<Record<string, 0 | 1 | 2 | 3 | 4>> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
};

/**
 * The action a key press triggers: `1`–`5` destinations, `[` `]` sub-tabs,
 * `/` command line, `,` Settings, `f` filter, `Esc` leaves the command line.
 * Nothing fires with a modifier, mid-composition, inside an open overlay, or
 * when the user turned shortcuts off. Only `Esc` fires while typing.
 */
export function shortcutAction(
  event: ShortcutEvent,
  enabled: boolean,
): ShortcutAction | null {
  if (!enabled || event.repeat || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const { target } = event;
  if (target?.inOverlay === true) return null;
  if (event.key === 'Escape') return { type: 'escape' };
  if (
    target !== null &&
    (target.isContentEditable || TEXT_TAGS.has(target.tagName))
  )
    return null;
  const index = DESTINATION_KEYS[event.key];
  if (index !== undefined) return { type: 'destination', index };
  switch (event.key) {
    case '[':
      return { type: 'sub-tab', step: -1 };
    case ']':
      return { type: 'sub-tab', step: 1 };
    case '/':
      return { type: 'command-line' };
    case ',':
      return { type: 'settings' };
    case 'f':
    case 'F':
      return { type: 'filter' };
    default:
      return null;
  }
}

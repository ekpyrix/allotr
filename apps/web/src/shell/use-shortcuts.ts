import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { readShortcutsEnabled, shortcutAction } from '@/lib/shortcuts';
import { navItems, settingsItem, subTabs } from '../nav-items.ts';
import { focusCommandLine } from './command/store.ts';
import { requestFilterMenu } from './filter-menu.ts';
import { screenOf, subTabPath } from './title-strip.tsx';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Where `step` sub-tabs from the current path leads, clamped; null if none. */
export function adjacentSubTab(pathname: string, step: -1 | 1): string | null {
  const screen = screenOf(pathname);
  if (!(screen in subTabs)) return null;
  const key = screen as keyof typeof subTabs;
  const tabs: readonly string[] = subTabs[key];
  const current = tabs.findIndex((sub) => subTabPath(key, sub) === pathname);
  const from = current === -1 ? 0 : current;
  const next = Math.min(tabs.length - 1, Math.max(0, from + step));
  const sub = tabs[next];
  return sub === undefined || next === from ? null : subTabPath(key, sub);
}

/** The app-level keyboard map (docs/ui.md §5). Mounted once, in the shell. */
export function useShortcuts() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target instanceof HTMLElement ? event.target : null;
      const action = shortcutAction(
        {
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          repeat: event.repeat,
          isComposing: event.isComposing,
          target:
            el === null
              ? null
              : {
                  tagName: el.tagName,
                  isContentEditable: el.isContentEditable,
                  inOverlay:
                    el.closest(
                      '[role="dialog"],[role="menu"],[role="listbox"]',
                    ) !== null,
                },
        },
        readShortcutsEnabled(storage()),
      );
      if (action === null) return;
      switch (action.type) {
        case 'destination': {
          event.preventDefault();
          void navigate({ to: navItems[action.index].to });
          return;
        }
        case 'sub-tab': {
          const to = adjacentSubTab(pathname, action.step);
          if (to === null) return;
          event.preventDefault();
          void navigate({ href: to });
          return;
        }
        case 'command-line':
          event.preventDefault();
          focusCommandLine();
          return;
        case 'settings':
          event.preventDefault();
          void navigate({ to: settingsItem.to });
          return;
        case 'filter':
          if (screenOf(pathname) !== 'transactions') return;
          event.preventDefault();
          requestFilterMenu();
          return;
        case 'escape':
          // Overlays close themselves; this only leaves the command line.
          if (
            el instanceof HTMLInputElement &&
            el.closest('[data-slot="command"]') !== null
          )
            el.blur();
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate, pathname]);
}

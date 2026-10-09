import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// A screen's own controls (search, period, filter) render into the title
// strip's `#strip-controls` slot (docs/ui.md §3), whatever the screen's own
// tree looks like.

const noSubscription = () => () => undefined;
const slot = () => document.getElementById('strip-controls');

export function StripControls({ children }: { children: ReactNode }) {
  // The slot is part of the shell, which renders in the same commit as the
  // screen, so the first snapshot is empty and React re-reads it afterwards.
  const target = useSyncExternalStore(noSubscription, slot, () => null);
  return target === null ? null : createPortal(children, target);
}

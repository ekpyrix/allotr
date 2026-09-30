import { useEffect } from 'react';

// Stands in for `react-remove-scroll-bar`, which Radix dialogs use to lock
// page scroll. The original injects a <style> element that the strict CSP
// (`style-src 'self'`, SECURITY.md) blocks; this keeps its lock counter on
// <body> and leaves the styling to `body[data-scroll-locked]` in
// styles.css. Aliased in vite.config.ts.

export const zeroRightClassName = 'right-scroll-bar-position';
export const fullWidthClassName = 'width-before-scroll-bar';
export const noScrollbarsClassName = 'with-scroll-bars-hidden';
export const removedBarSizeVariable = '--removed-body-scroll-bar-size';

const lockAttribute = 'data-scroll-locked';

function lockCount(): number {
  const count = Number.parseInt(
    document.body.getAttribute(lockAttribute) ?? '0',
    10,
  );
  return Number.isFinite(count) ? count : 0;
}

/** Marks <body> as scroll-locked while mounted; renders nothing. */
export function RemoveScrollBar(): null {
  useEffect(() => {
    document.body.setAttribute(lockAttribute, String(lockCount() + 1));
    return () => {
      const next = lockCount() - 1;
      if (next <= 0) document.body.removeAttribute(lockAttribute);
      else document.body.setAttribute(lockAttribute, String(next));
    };
  }, []);
  return null;
}

export function getGapWidth() {
  return { left: 0, top: 0, right: 0, gap: 0 };
}

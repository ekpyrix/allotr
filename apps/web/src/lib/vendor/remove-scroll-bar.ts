import { useEffect } from 'react';

// Stands in for `react-remove-scroll-bar`, which Radix dialogs use to lock
// page scroll. The original injects a <style> element that the strict CSP
// (`style-src 'self'`, SECURITY.md) blocks; this keeps its lock counter on
// <body>, sets the scrollbar width it hides as a custom property (through
// the CSSOM, which the CSP allows) and leaves the styling to
// `body[data-scroll-locked]` in styles.css. Aliased in vite.config.ts.

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

/** The width of the page's classic scrollbar; 0 for overlay scrollbars. */
function scrollbarWidth(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

/** Marks <body> as scroll-locked while mounted; renders nothing. */
export function RemoveScrollBar(): null {
  useEffect(() => {
    const count = lockCount();
    // Measured before the lock hides the scrollbar; the first lock wins.
    if (count === 0)
      document.body.style.setProperty(
        removedBarSizeVariable,
        `${String(scrollbarWidth())}px`,
      );
    document.body.setAttribute(lockAttribute, String(count + 1));
    return () => {
      const next = lockCount() - 1;
      if (next > 0) {
        document.body.setAttribute(lockAttribute, String(next));
        return;
      }
      document.body.removeAttribute(lockAttribute);
      document.body.style.removeProperty(removedBarSizeVariable);
    };
  }, []);
  return null;
}

export function getGapWidth() {
  return { left: 0, top: 0, right: 0, gap: scrollbarWidth() };
}

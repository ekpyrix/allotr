import type { ReactNode } from 'react';

// The top app bar (spec §4): transparent over the page at rest; once the
// content scrolls under it, it turns chrome with a hairline and shows the
// title inline while the large title scrolls away. Driven by a scroll
// timeline where the browser has one; elsewhere it stays chrome. The
// inline title repeats the page's h1, so it is hidden from assistive
// technology.
export function TopAppBar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="top-app-bar sticky top-0 z-10 -mx-4 flex h-16 items-center gap-2 border-b px-4 medium:-mx-6 medium:px-6 large:-mx-8 large:px-8">
      <div className="min-w-0 flex-1 overflow-hidden">
        <p aria-hidden="true" className="top-app-bar-title truncate text-title">
          {title}
        </p>
      </div>
      {actions}
    </div>
  );
}

import { Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Frame } from '@/components/layout';
import { OverlayScrollbar } from '@/components/overlay-scrollbar';
import { t } from '@/messages/t';
import { CommandLine } from './command-line.tsx';
import { Navigation } from './navigation.tsx';
import { StatusLine } from './status-line.tsx';
import { SummaryBar } from './summary-bar.tsx';
import { TitleStrip } from './title-strip.tsx';

// The signed-in frame (docs/ui.md §3). One CSS grid places the navigation
// pieces in the same row tracks as the summary bar, title strip and command
// line, so the alignment rules hold by construction:
//
//   wide / medium            compact
//   logo    summary          summary
//   nav     strip            strip
//   nav     content          content
//   foot    command          command
//   status  status           tabs
//
// Container queries run on the frame, with px thresholds (600 / 1000).

/** `children` replaces the routed screen, for the gallery and tests. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <Frame className="h-dvh">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        {t('nav.skip')}
      </a>
      <div
        data-shell
        className={[
          'grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_var(--h-strip)_minmax(0,1fr)_auto_auto]',
          'medium:grid-cols-[4.5rem_minmax(0,1fr)] medium:grid-rows-[var(--h-topbar)_var(--h-strip)_minmax(0,1fr)_auto_auto]',
          'wide:grid-cols-[13.25rem_minmax(0,1fr)]',
        ].join(' ')}
      >
        <Navigation />
        <SummaryBar />
        <TitleStrip />
        <main
          id="content"
          tabIndex={-1}
          className="min-h-0 min-w-0 outline-none medium:col-start-2 medium:row-start-3"
        >
          <OverlayScrollbar label={t('shell.content')} className="h-full">
            {children ?? <Outlet />}
          </OverlayScrollbar>
        </main>
        <CommandLine />
        <StatusLine />
      </div>
    </Frame>
  );
}

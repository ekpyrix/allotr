import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { iconButtonVariants } from '@/components/ui/icon-button';
import { t } from '@/messages/t';
import { TopAppBar } from './top-app-bar.tsx';

// The top of every view inside the shell: the top app bar, one large h1
// and an optional intro.
export function Page({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: string;
  /** Icon buttons for the top app bar. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <TopAppBar title={title} actions={actions} />
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-headline">{title}</h1>
        {/* Settings opens from the header on phones (ADR 0023); wider
            screens have it at the foot of the sidebar. */}
        <Link
          to="/settings"
          aria-label={t('nav.settings')}
          className={`${iconButtonVariants()} -mt-1 -mr-3 medium:hidden`}
        >
          <Settings aria-hidden="true" />
        </Link>
      </div>
      {intro === undefined ? null : (
        <p className="mt-3 max-w-prose text-body-lg text-text-muted">{intro}</p>
      )}
      {children}
    </>
  );
}

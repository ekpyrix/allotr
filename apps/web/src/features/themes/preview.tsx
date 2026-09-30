import { formatMoney, money, type Role } from '@allotr/shared';
import type { CSSProperties } from 'react';
import { roleProperties } from '@/lib/theme-mode';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// A small Today in a theme's resolved role colours. The roles are set as
// custom properties on this box only, so the page around it keeps its own
// theme. It is a picture: the editor says the same in words, so screen
// readers skip it and nothing in it takes focus.

const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;

function amount(minor: number): string {
  return formatMoney(money(minor, 'EUR'), locale);
}

/** The roles as a style that paints this element and what is inside it. */
export function roleStyle(
  roles: Readonly<Record<Role, string>>,
): CSSProperties {
  return Object.fromEntries(roleProperties(roles));
}

export function ThemePreview({
  roles,
  compact = false,
  testId,
  className,
}: {
  roles: Readonly<Record<Role, string>>;
  /** The family cards' size: the hero figure and one row. */
  compact?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      style={roleStyle(roles)}
      className={cn(
        'grid gap-3 rounded-lg bg-canvas text-text',
        compact ? 'p-3 text-sm' : 'p-5',
        className,
      )}
    >
      <div className={cn('rounded-lg bg-card', compact ? 'p-3' : 'p-4')}>
        <p className="text-label text-text-muted">{t('themes.previewHero')}</p>
        <p
          className={cn(
            'font-mono font-semibold tracking-tight text-hero-ok',
            compact ? 'text-2xl' : 'text-5xl',
          )}
        >
          {amount(4250)}
        </p>
        {compact ? null : (
          <p className="mt-1 text-label text-text-muted">
            {t('themes.previewMuted')}
          </p>
        )}
      </div>
      <ul className="overflow-hidden rounded-lg bg-card">
        <li className="flex justify-between gap-3 border-b border-outline-variant px-3 py-2">
          <span className="min-w-0 truncate">{t('themes.previewCaption')}</span>
          <span className="shrink-0 font-mono whitespace-nowrap text-negative">
            {amount(-1890)}
          </span>
        </li>
        {compact ? null : (
          <li className="flex justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate">
              {t('themes.previewIncome')}
            </span>
            <span className="shrink-0 font-mono whitespace-nowrap text-positive">
              {amount(210000)}
            </span>
          </li>
        )}
      </ul>
      {compact ? null : (
        <>
          <p className="rounded-md bg-danger-container px-3 py-2 text-label text-on-danger-container">
            {t('themes.previewOver', { amount: amount(1200) })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-label text-on-primary outline-2 outline-offset-2 outline-ring">
              {t('themes.previewPrimary')}
            </span>
            <span className="inline-flex h-9 items-center rounded-full border border-outline px-4 text-label text-negative">
              {t('themes.previewDanger')}
            </span>
            <span className="rounded-md bg-inverse px-2 py-1 text-caption text-on-inverse">
              {amount(1200)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

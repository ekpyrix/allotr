import type { ComponentType, ReactNode } from 'react';
import type { IconProps } from '@/generated/icons';
import { cn } from '@/lib/utils';
import { LeftBar } from './bars.tsx';

export type Stat = Readonly<{
  label: string;
  icon?: ComponentType<IconProps>;
  figure: ReactNode;
  sub?: ReactNode;
  bar?: Readonly<{ fraction: number; label: string }>;
  /** Edge colour of the primary (first) stat. */
  tone?: 'positive' | 'primary' | 'neutral';
}>;

/** Four stat tiles: 2 × 2 on compact, in a row from medium. */
export function Stats({ stats }: { stats: readonly Stat[] }) {
  return (
    <div className="grid grid-cols-2 border-t border-l medium:grid-cols-4">
      {stats.map(({ label, icon: Icon, figure, sub, bar, tone }, index) => {
        const primary = index === 0;
        return (
          <div
            key={label}
            className={cn(
              'min-w-0 border-r border-b px-3 py-2',
              primary &&
                tone === 'positive' &&
                'border-l-[3px] border-l-positive',
              primary &&
                tone !== 'positive' &&
                tone !== 'neutral' &&
                'border-l-[3px] border-l-primary',
            )}
          >
            <div className="flex items-center gap-1 text-small text-text-muted">
              {Icon === undefined ? null : (
                <Icon className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{label}</span>
            </div>
            <div
              className={cn(
                'truncate font-semibold',
                primary ? 'text-stat' : 'text-stat-sub',
              )}
            >
              {figure}
            </div>
            {sub === undefined ? null : (
              <div className="truncate text-small text-text-muted">{sub}</div>
            )}
            {bar === undefined ? null : (
              <LeftBar
                fraction={bar.fraction}
                label={bar.label}
                className="mt-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One line of up to four label-over-figure pairs, each truncated. */
export function KeyFigures({
  figures,
}: {
  figures: readonly Readonly<{ label: string; figure: ReactNode }>[];
}) {
  return (
    <dl className="flex gap-4">
      {figures.slice(0, 4).map(({ label, figure }) => (
        <div key={label} className="min-w-0 flex-1">
          <dt className="truncate text-small text-text-muted">{label}</dt>
          <dd className="truncate text-base font-semibold">{figure}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `14 entries · spent $1,201.60 · …`: one truncated line from server figures. */
export function SummaryLine({
  parts,
  className,
}: {
  parts: readonly ReactNode[];
  className?: string;
}) {
  return (
    <p className={cn('truncate text-small text-text-muted', className)}>
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [<span key={`sep-${String(index)}`}> · </span>, part],
      )}
    </p>
  );
}

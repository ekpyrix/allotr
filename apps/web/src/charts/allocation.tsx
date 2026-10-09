import type { Money } from '@allotr/shared';
import { ShareBar, seriesBg, type SeriesColor } from '@/components/bars';
import { clampFraction, percent } from '@/components/bars-math';
import { formatMoney, type CurrencyDisplay } from '@/lib/format-money';
import { cn } from '@/lib/utils';

// The cycle allocation (docs/ui.md §4, §8 item 1). Every amount and share
// comes from the server; this component only lays them out. It never sums
// segments.

export type AllocationSegment = Readonly<{
  id: string;
  /** "Bills paid", "To savings", "Spent", "Bills set aside", "Free to spend". */
  label: string;
  amount: Money;
  /** The segment's share of the cycle start, 0..1, as the server computed it. */
  fraction: number;
  color: SeriesColor;
}>;

export type AllocationProps = Readonly<{
  /** In display order. The last two are the on-budget money still left. */
  segments: readonly AllocationSegment[];
  /** "On-budget left X of Y", both from the server. */
  left: Readonly<{ amount: Money; of: Money }>;
  /** Summary prefix for assistive technology. */
  label: string;
  /** Text before the figures, e.g. "on-budget left". */
  leftLabel: string;
  /** Joins the two figures, e.g. "of". */
  ofLabel: string;
  mode?: CurrencyDisplay;
  locale?: string;
  className?: string;
}>;

export function Allocation({
  segments,
  left,
  label,
  leftLabel,
  ofLabel,
  mode = 'symbol',
  locale,
  className,
}: AllocationProps) {
  const lead = segments.slice(0, -2);
  const tail = segments.slice(-2);
  return (
    <div className={cn('grid gap-2 px-3 py-2.5', className)}>
      <ShareBar segments={segments} label={label} className="h-3" />
      {tail.length > 0 ? (
        <div aria-hidden="true" className="flex h-4 w-full gap-px">
          {lead.map((s) => (
            <div
              key={s.id}
              className="min-w-px"
              style={{ flexGrow: clampFraction(s.fraction), flexBasis: 0 }}
            />
          ))}
          {tail.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                'min-w-px border-b border-outline',
                i === 0 && 'border-l',
                i === tail.length - 1 && 'border-r',
              )}
              style={{ flexGrow: clampFraction(s.fraction), flexBasis: 0 }}
            />
          ))}
        </div>
      ) : null}
      <p className="num text-right text-[11px] text-text">
        {leftLabel} {formatMoney(left.amount, mode, locale)} {ofLabel}{' '}
        {formatMoney(left.of, mode, locale)}
      </p>
      <ul className="grid grid-cols-5 gap-x-2 gap-y-1.5 compact:grid-cols-3">
        {segments.map((s) => (
          <li key={s.id} className="min-w-0">
            <div className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0', seriesBg[s.color])}
              />
              <span className="truncate text-[11px] text-text-muted">
                {s.label}
              </span>
            </div>
            <div className="num truncate text-text">
              {formatMoney(s.amount, mode, locale)}
            </div>
            <div className="num text-[11px] text-text-muted">
              {percent(s.fraction)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useState } from 'react';
import type { CalendarDayView, LocalDate } from '@allotr/shared';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import type { CurrencyDisplay } from '@/lib/format-money';
import { cn } from '@/lib/utils';
import { leadingBlanks, type MonthRange } from '@/features/calendar/model';

// A month grid (docs/ui.md §4). Spent amounts, heat and marks are the
// server's; the grid only places them. Every day has a text label and the
// whole month has a table view. The heat fills the cell; the text sits on
// opaque canvas chips so contrast never depends on how hot a day is.

/** Share of `negative` mixed into `canvas` for a heat level 0..4: 0–55 %. */
export function heatPercent(heat: number | null): number {
  if (heat === null) return 0;
  const level = Math.min(4, Math.max(0, Math.round(heat)));
  return (level * 55) / 4;
}

/** An opaque heat fill (a colour mix, never transparency). */
export function heatBackground(heat: number | null): string {
  return `color-mix(in srgb, var(--negative) ${String(heatPercent(heat))}%, var(--canvas))`;
}

/** The marks for a day: b bill, i IOU, $ payday. */
export function dayMarks(day: CalendarDayView): string[] {
  return [
    ...(day.bills.length > 0 ? ['b'] : []),
    ...(day.ious.length > 0 ? ['i'] : []),
    ...(day.payday ? ['$'] : []),
  ];
}

export type CalendarGridProps = Readonly<{
  month: MonthRange;
  /** The server's days for the month, in date order. */
  days: readonly CalendarDayView[];
  today: LocalDate;
  picked?: LocalDate | undefined;
  onPick?: (date: LocalDate) => void;
  /** Layer toggles. */
  showHeat?: boolean;
  showDue?: boolean;
  /** Monday-first short names, e.g. ["Mon", …, "Sun"]. */
  weekdays: readonly string[];
  /** Text for the toggle between the views. */
  gridLabel: string;
  tableLabel: string;
  /** Table headers: date, spent, due. */
  headers: Readonly<{ date: string; spent: string; due: string }>;
  /** Label for a day: its date, long form. */
  dateLabel: (date: LocalDate) => string;
  /** Label for the marks, e.g. { b: "bill", i: "IOU", $: "payday" }. */
  markNames: Readonly<Record<string, string>>;
  mode?: CurrencyDisplay;
  locale?: string;
  className?: string;
}>;

function dayLabel(
  day: CalendarDayView,
  props: Pick<CalendarGridProps, 'dateLabel' | 'markNames' | 'mode' | 'locale'>,
): string {
  const parts = [props.dateLabel(day.date)];
  if (day.spent !== null) {
    parts.push(formatMoney(day.spent, props.mode, props.locale));
  }
  for (const mark of dayMarks(day)) parts.push(props.markNames[mark] ?? mark);
  return parts.join(', ');
}

export function CalendarGrid(props: CalendarGridProps) {
  const {
    month,
    days,
    today,
    picked,
    onPick,
    showHeat = true,
    showDue = true,
    weekdays,
    gridLabel,
    tableLabel,
    headers,
    markNames,
    mode = 'symbol',
    locale,
    className,
  } = props;
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const blanks = leadingBlanks(month.from);
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex justify-end gap-px px-3 pt-2">
        {(['grid', 'table'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
            }}
            className={cn(
              'h-8 border border-outline px-2 text-[11px]',
              view === v ? 'bg-primary text-on-primary' : 'bg-canvas text-text',
            )}
          >
            {v === 'grid' ? gridLabel : tableLabel}
          </button>
        ))}
      </div>
      {view === 'grid' ? (
        <div
          role="group"
          aria-label={month.month}
          className="grid grid-cols-7 gap-px bg-outline-variant"
        >
          {weekdays.map((name) => (
            <div
              key={name}
              className="bg-chrome py-1 text-center text-[11px] text-text-muted"
            >
              {name}
            </div>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <div
              key={`blank-${String(i)}`}
              aria-hidden="true"
              className="bg-canvas"
            />
          ))}
          {days.map((day) => {
            const marks = showDue ? dayMarks(day) : [];
            const isToday = day.date === today;
            const isPicked = day.date === picked;
            return (
              <button
                key={day.date}
                type="button"
                aria-label={dayLabel(day, props)}
                aria-pressed={isPicked}
                onClick={() => {
                  onPick?.(day.date);
                }}
                className={cn(
                  'flex min-h-14 min-w-0 flex-col items-stretch gap-0.5 p-1 text-left compact:min-h-11',
                  isPicked
                    ? 'outline-2 -outline-offset-2 outline-text'
                    : isToday && 'outline-2 -outline-offset-2 outline-primary',
                )}
                style={{
                  backgroundColor: showHeat
                    ? heatBackground(day.heat)
                    : 'var(--canvas)',
                }}
              >
                <span className="flex items-center justify-between">
                  <span className="num bg-canvas px-0.5 text-[11px] text-text">
                    {Number(day.date.slice(8))}
                  </span>
                  <span
                    aria-hidden="true"
                    className="num bg-canvas px-0.5 text-[11px] text-text-muted"
                  >
                    {marks.join(' ')}
                  </span>
                </span>
                {day.spent === null || day.spent.amountMinor === 0 ? null : (
                  <span
                    aria-hidden="true"
                    className="num self-start truncate bg-canvas px-0.5 text-[11px] text-text"
                  >
                    {formatMoneyShort(day.spent, locale)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{month.month}</caption>
          <thead>
            <tr className="bg-chrome text-[11px] text-text-muted">
              <th scope="col" className="px-3 py-1 font-normal">
                {headers.date}
              </th>
              <th scope="col" className="px-3 py-1 text-right font-normal">
                {headers.spent}
              </th>
              <th scope="col" className="px-3 py-1 font-normal">
                {headers.due}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-t border-outline-variant">
                <th scope="row" className="num px-3 py-1 font-normal text-text">
                  {props.dateLabel(day.date)}
                </th>
                <td className="num px-3 py-1 text-right text-text">
                  {day.spent === null
                    ? ''
                    : formatMoney(day.spent, mode, locale)}
                </td>
                <td className="px-3 py-1 text-text-muted">
                  {dayMarks(day)
                    .map((mark) => markNames[mark] ?? mark)
                    .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

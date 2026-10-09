import { cn } from '@/lib/utils';
import { timelineLanes } from './math.ts';

// The cycle-day axis (docs/ui.md §4). Positions are fractions of the axis;
// nothing here derives money. Marks carry the colour; labels use `text` or
// muted only.

export type TimelineEvent = Readonly<{
  id: string;
  /** Zero-based cycle day. */
  day: number;
  kind: 'bill' | 'payday';
  /** Short text, e.g. "Rent". Hidden on phone. */
  label: string;
  /** Bills only: a paid bill is muted. */
  paid?: boolean;
}>;

export type TimelineProps = Readonly<{
  /** Cycle length in days. */
  days: number;
  /** Zero-based day of the cycle that is today (passed in, never read). */
  today: number;
  events: readonly TimelineEvent[];
  /** Date label for a cycle day, e.g. "Oct 9". */
  dayLabel: (day: number) => string;
  /** Summary for assistive technology. */
  label: string;
  className?: string;
}>;

/** Axis ticks: the first day, the last, and about every `step` between. */
export function tickDays(days: number, step = 7): number[] {
  if (days <= 0) return [];
  const last = days - 1;
  const ticks: number[] = [];
  for (let day = 0; day < last; day += step) ticks.push(day);
  ticks.push(last);
  // Drop a penultimate tick that would sit on top of the last label.
  const prev = ticks[ticks.length - 2];
  if (prev !== undefined && last - prev < step / 2) ticks.splice(-2, 1);
  return ticks;
}

function pos(day: number, days: number): number {
  const span = Math.max(1, days - 1);
  return Math.min(1, Math.max(0, day / span)) * 100;
}

const STEM = { 0: 'h-5', 1: 'h-11' } as const;

export function Timeline({
  days,
  today,
  events,
  dayLabel,
  label,
  className,
}: TimelineProps) {
  const lanes = timelineLanes(
    events.map((e) => ({ id: e.id, day: e.day })),
    days,
  );
  const byId = new Map(events.map((e) => [e.id, e]));
  const summary = `${label}: ${events
    .map(
      (e) => `${e.label}${e.paid === true ? ' (paid)' : ''} ${dayLabel(e.day)}`,
    )
    .join(', ')}`;
  return (
    <div
      role="img"
      aria-label={summary}
      className={cn('relative h-44 w-full px-3 compact:h-16', className)}
    >
      <div className="relative h-full">
        {/* Axis and elapsed fill */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-outline" />
        <div
          className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-primary"
          style={{ width: `${String(pos(today, days))}%` }}
        />
        {/* Ticks and dates */}
        {tickDays(days).map((day) => (
          <div
            key={day}
            className="absolute top-1/2 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${String(pos(day, days))}%` }}
          >
            <div className="h-1.5 w-px bg-outline" />
            <div className="num pt-0.5 text-[11px] whitespace-nowrap text-text-muted compact:hidden">
              {dayLabel(day)}
            </div>
          </div>
        ))}
        {/* Today */}
        <div
          className="absolute inset-y-0 w-px bg-primary"
          style={{ left: `${String(pos(today, days))}%` }}
        />
        {/* Events */}
        {lanes.map((lane) => {
          const event = byId.get(lane.id);
          if (event === undefined) return null;
          const muted = event.kind === 'bill' && event.paid === true;
          const up = lane.side === 'up';
          return (
            <div
              key={lane.id}
              className={cn(
                'absolute flex -translate-x-1/2 items-center',
                up ? 'bottom-1/2 flex-col-reverse' : 'top-1/2 flex-col',
              )}
              style={{ left: `${String(pos(event.day, days))}%` }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2',
                  event.kind === 'payday'
                    ? 'bg-positive'
                    : muted
                      ? 'bg-outline'
                      : 'bg-warning',
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'w-px bg-outline-variant compact:h-2',
                  STEM[lane.level],
                )}
              />
              <span
                className={cn(
                  'num text-[11px] whitespace-nowrap compact:hidden',
                  muted ? 'text-text-muted' : 'text-text',
                )}
              >
                {event.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

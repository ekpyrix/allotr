import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { accountHistoryQuery } from '@/lib/ledger';
import { cn } from '@/lib/utils';

// A 30-day balance sparkline (spec §10): a line and an end dot, no axes,
// from the server's end-of-day balances. It loads only once the card is on
// screen. It is decorative: the card states the balance in text.

const WIDTH = 120;
const HEIGHT = 32;
const PAD = 3;

function coord(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function Sparkline({
  accountId,
  offBudget,
  className,
}: {
  accountId: string;
  /** Off-budget accounts draw in the neutral pace colour, not a series. */
  offBudget: boolean;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  // Without IntersectionObserver it simply loads at once.
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  useEffect(() => {
    const element = box.current;
    if (element === null || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [visible]);
  const history = useQuery({
    ...accountHistoryQuery(accountId),
    enabled: visible,
  });

  const points = history.data?.points ?? [];
  const values = points.map((p) => p.balance.amountMinor);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const x = (at: number) =>
    PAD + (at / Math.max(1, points.length - 1)) * (WIDTH - 2 * PAD);
  const y = (value: number) =>
    span === 0
      ? HEIGHT / 2
      : HEIGHT - PAD - ((value - low) / span) * (HEIGHT - 2 * PAD);
  const d = values
    .map(
      (value, at) =>
        `${at === 0 ? 'M' : 'L'}${coord(x(at))},${coord(y(value))}`,
    )
    .join(' ');
  const last = values.at(-1);

  return (
    <span
      ref={box}
      aria-hidden="true"
      className={cn('block h-8 w-30', className)}
    >
      {values.length < 2 || last === undefined ? null : (
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          className="size-full"
        >
          <path
            d={d}
            fill="none"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={offBudget ? 'stroke-pace' : 'stroke-series-1'}
          />
          <circle
            cx={coord(x(values.length - 1))}
            cy={coord(y(last))}
            r="2.5"
            className={offBudget ? 'fill-pace' : 'fill-series-1'}
          />
        </svg>
      )}
    </span>
  );
}

import { formatMoney, type Money } from '@allotr/shared';
import type { TooltipContentProps } from 'recharts';
import { useMediaQuery } from '@/lib/media';
import { t } from '@/messages/t';

// What every chart's tooltip shares: a small card on the inverse surface,
// pinned by a tap on touch screens and by the arrow keys everywhere.

const COARSE = '(pointer: coarse)';

type Line = readonly [label: string, value: string];

export function TooltipBox({
  title,
  lines,
}: {
  title: string;
  lines: readonly Line[];
}) {
  return (
    <div className="grid max-w-64 gap-1 rounded-md bg-inverse px-3 py-2 text-sm text-on-inverse">
      <p className="font-medium">{title}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {lines.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="text-right font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The data row under the tooltip, or undefined while none is active. */
export function activeRow(
  props: Pick<TooltipContentProps, 'active' | 'payload'>,
): unknown {
  if (!props.active) return undefined;
  const [first] = props.payload;
  return first?.payload;
}

/** Hover shows the tooltip with a mouse; a tap pins it on touch screens. */
export function useTrigger(): 'hover' | 'click' {
  return useMediaQuery(COARSE) ? 'click' : 'hover';
}

export const shown = (amount: Money | null, locale: string) =>
  amount === null ? t('charts.none') : formatMoney(amount, locale);

// Starts at zero, or below it for a refund larger than the spending, and
// lets Recharts round the top to an even tick.
export const fromZero = [(min: number) => Math.min(0, min), 'auto'] as const;

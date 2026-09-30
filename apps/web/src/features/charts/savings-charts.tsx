import { formatMoney, type CurrencyCode } from '@allotr/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import type { SavingsCycle } from '@/features/cycles/chart-data';
import { chartColors, moneyTick, tickStyle } from './theme.ts';
import { activeRow, fromZero, TooltipBox, useTrigger } from './tooltip.tsx';
import { t } from '@/messages/t';

// The savings charts (ADR 0020): the off-budget total at the end of each
// cycle as an area, and each cycle's change as bars above or below zero.
// Savings draw in the info role, never a hero colour. Every point is the
// server's; Recharts only places it.

const margin = { top: 8, right: 8, bottom: 0, left: 0 };

function SavingsTooltip({
  row,
  locale,
}: {
  row: SavingsCycle;
  locale: string;
}) {
  return (
    <TooltipBox
      title={row.label}
      lines={[
        [t('savings.chart.total'), formatMoney(row.total, locale)],
        [t('savings.chart.change'), formatMoney(row.change, locale)],
      ]}
    />
  );
}

/** The off-budget total at the end of each cycle, oldest first. */
export function SavingsGrowthChart({
  cycles,
  currency,
  locale,
  title,
}: {
  cycles: readonly SavingsCycle[];
  currency: CurrencyCode;
  locale: string;
  title: string;
}) {
  const trigger = useTrigger();
  const data = cycles.map((row) => ({ ...row, value: row.total.amountMinor }));
  return (
    <AreaChart
      responsive
      data={data}
      title={title}
      margin={margin}
      style={{ width: '100%', height: '100%' }}
    >
      <CartesianGrid vertical={false} stroke={chartColors.grid} />
      <XAxis
        dataKey="short"
        tick={tickStyle}
        stroke={chartColors.baseline}
        minTickGap={16}
      />
      <YAxis
        tickFormatter={moneyTick(currency, locale)}
        tick={tickStyle}
        domain={fromZero}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Area
        dataKey="value"
        type="linear"
        stroke={chartColors.savings}
        strokeWidth={2}
        fill={chartColors.savingsFill}
        dot={{ r: 3, fill: chartColors.savings }}
        isAnimationActive={false}
      />
      <Tooltip
        trigger={trigger}
        isAnimationActive={false}
        cursor={{ stroke: chartColors.baseline }}
        content={(props) => {
          const row = activeRow(props) as SavingsCycle | undefined;
          return row === undefined ? null : (
            <SavingsTooltip row={row} locale={locale} />
          );
        }}
      />
    </AreaChart>
  );
}

/**
 * Each cycle's change in savings: up in the info colour, down in the
 * negative one. The tooltip and the table give the amounts with signs.
 */
export function SavingsChangeChart({
  cycles,
  currency,
  locale,
  title,
}: {
  cycles: readonly SavingsCycle[];
  currency: CurrencyCode;
  locale: string;
  title: string;
}) {
  const trigger = useTrigger();
  const data = cycles.map((row) => ({ ...row, value: row.change.amountMinor }));
  return (
    <BarChart
      responsive
      data={data}
      title={title}
      margin={margin}
      style={{ width: '100%', height: '100%' }}
    >
      <CartesianGrid vertical={false} stroke={chartColors.grid} />
      <XAxis
        dataKey="short"
        tick={tickStyle}
        stroke={chartColors.baseline}
        minTickGap={16}
      />
      <YAxis
        tickFormatter={moneyTick(currency, locale)}
        tick={tickStyle}
        domain={[
          (min: number) => Math.min(0, min),
          (max: number) => Math.max(0, max),
        ]}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <ReferenceLine y={0} stroke={chartColors.baseline} />
      <Bar
        dataKey="value"
        maxBarSize={40}
        isAnimationActive={false}
        shape={(props: BarShapeProps) => (
          <Rectangle
            {...props}
            radius={4}
            fill={
              (data[props.index]?.value ?? 0) < 0
                ? chartColors.over
                : chartColors.savings
            }
          />
        )}
      />
      <Tooltip
        trigger={trigger}
        isAnimationActive={false}
        cursor={{ fill: 'var(--card-raised)' }}
        content={(props) => {
          const row = activeRow(props) as SavingsCycle | undefined;
          return row === undefined ? null : (
            <SavingsTooltip row={row} locale={locale} />
          );
        }}
      />
    </BarChart>
  );
}

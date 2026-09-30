import {
  formatMoney,
  type CurrencyCode,
  type CycleDayView,
  type LocalDate,
} from '@allotr/shared';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Rectangle,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { isOver, type CategoryBar } from '@/features/cycles/chart-data';
import { formatLongDay } from '@/features/today/format';
import { t } from '@/messages/t';
import { chartColors, dayTick, moneyTick, tickStyle } from './theme.ts';
import {
  activeRow,
  fromZero,
  shown,
  TooltipBox,
  useTrigger,
} from './tooltip.tsx';

// The cycle's charts (ADR 0020), the only place Recharts is imported, so it
// loads with the first chart and never with the app. Every point is a
// server figure in minor units; the charts only place them. Recharts'
// accessibility layer makes each chart one tab stop whose arrow keys move
// between points and pin the tooltip; a tap pins it on touch screens.
// Recharts' own animations stay off: the frame draws the chart in by
// clip-path, which reduced motion turns off.

type DayRow = Readonly<{ date: LocalDate; day: CycleDayView }>;

/**
 * Spending so far against an even pace: an area for what was spent through
 * each day, a dashed line for the pace, and marks for bills due and today.
 */
export function SpendingChart({
  days,
  billDates,
  today,
  currency,
  locale,
  title,
}: {
  days: readonly CycleDayView[];
  /** Due dates of the cycle's bills, earliest first. */
  billDates: readonly LocalDate[];
  /** Today, while it falls in the cycle. */
  today: LocalDate | null;
  currency: CurrencyCode;
  locale: string;
  title: string;
}) {
  const trigger = useTrigger();
  const data = days.map((day) => ({
    date: day.date,
    day,
    spent: day.cumulativeSpent?.amountMinor ?? null,
    pace: day.pace.amountMinor,
  }));
  return (
    <ComposedChart
      responsive
      data={data}
      title={title}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      style={{ width: '100%', height: '100%' }}
    >
      <CartesianGrid vertical={false} stroke={chartColors.grid} />
      <XAxis
        dataKey="date"
        tickFormatter={dayTick(locale)}
        tick={tickStyle}
        stroke={chartColors.baseline}
        minTickGap={24}
      />
      <YAxis
        tickFormatter={moneyTick(currency, locale)}
        tick={tickStyle}
        domain={fromZero}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      {[...new Set(billDates)].map((date) => (
        <ReferenceLine
          key={date}
          x={date}
          stroke={chartColors.bill}
          strokeDasharray="2 4"
        />
      ))}
      {today === null ? null : (
        <ReferenceLine x={today} stroke={chartColors.today} />
      )}
      <Area
        dataKey="spent"
        type="linear"
        stroke={chartColors.series}
        strokeWidth={2}
        fill={chartColors.seriesFill}
        isAnimationActive={false}
      />
      <Line
        dataKey="pace"
        type="linear"
        stroke={chartColors.pace}
        strokeWidth={2}
        strokeDasharray="6 4"
        dot={false}
        isAnimationActive={false}
      />
      <Tooltip
        trigger={trigger}
        isAnimationActive={false}
        cursor={{ stroke: chartColors.baseline }}
        content={(props) => {
          const row = activeRow(props) as DayRow | undefined;
          if (row === undefined) return null;
          return (
            <TooltipBox
              title={formatLongDay(row.date, locale)}
              lines={[
                [
                  t('charts.spentSoFar'),
                  shown(row.day.cumulativeSpent, locale),
                ],
                [t('charts.pace'), formatMoney(row.day.pace, locale)],
              ]}
            />
          );
        }}
      />
    </ComposedChart>
  );
}

/**
 * Each day's spending as a bar against that day's allowance, a step line.
 * Days over their allowance are drawn in the negative colour; the tooltip
 * and the table say so in words.
 */
export function DailyChart({
  days,
  currency,
  locale,
  title,
}: {
  days: readonly CycleDayView[];
  currency: CurrencyCode;
  locale: string;
  title: string;
}) {
  const trigger = useTrigger();
  const data = days.map((day) => ({
    date: day.date,
    day,
    spent: day.spent?.amountMinor ?? null,
    allowance: day.allowance?.amountMinor ?? null,
    over: isOver(day),
  }));
  return (
    <ComposedChart
      responsive
      data={data}
      title={title}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      style={{ width: '100%', height: '100%' }}
    >
      <CartesianGrid vertical={false} stroke={chartColors.grid} />
      <XAxis
        dataKey="date"
        tickFormatter={dayTick(locale)}
        tick={tickStyle}
        stroke={chartColors.baseline}
        minTickGap={24}
      />
      <YAxis
        tickFormatter={moneyTick(currency, locale)}
        tick={tickStyle}
        domain={fromZero}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Bar
        dataKey="spent"
        radius={[4, 4, 0, 0]}
        isAnimationActive={false}
        shape={(props: BarShapeProps) => (
          <Rectangle
            {...props}
            fill={
              data[props.index]?.over === true
                ? chartColors.over
                : chartColors.series
            }
          />
        )}
      />
      <Line
        dataKey="allowance"
        type="stepAfter"
        stroke={chartColors.pace}
        strokeWidth={2}
        strokeDasharray="6 4"
        dot={false}
        isAnimationActive={false}
      />
      <Tooltip
        trigger={trigger}
        isAnimationActive={false}
        cursor={{ fill: 'var(--card-raised)' }}
        content={(props) => {
          const row = activeRow(props) as
            (DayRow & { over: boolean }) | undefined;
          if (row === undefined) return null;
          return (
            <TooltipBox
              title={formatLongDay(row.date, locale)}
              lines={[
                [t('charts.spent'), shown(row.day.spent, locale)],
                [t('charts.allowance'), shown(row.day.allowance, locale)],
                ...(row.over ? [[t('charts.overAllowance'), ''] as const] : []),
              ]}
            />
          );
        }}
      />
    </ComposedChart>
  );
}

// Long category names end in an ellipsis on the axis; the tooltip and the
// table show them whole.
function shortName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

/** The largest spending categories as ranked horizontal bars. */
export function CategoryChart({
  bars,
  currency,
  locale,
  title,
}: {
  bars: readonly CategoryBar[];
  currency: CurrencyCode;
  locale: string;
  title: string;
}) {
  const trigger = useTrigger();
  const data = bars.map((bar) => ({ ...bar, value: bar.amount.amountMinor }));
  return (
    <BarChart
      responsive
      layout="vertical"
      data={data}
      title={title}
      margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      style={{ width: '100%', height: '100%' }}
    >
      <CartesianGrid horizontal={false} stroke={chartColors.grid} />
      <XAxis
        type="number"
        tickFormatter={moneyTick(currency, locale)}
        tick={tickStyle}
        domain={fromZero}
        stroke={chartColors.baseline}
      />
      <YAxis
        type="category"
        dataKey="name"
        tickFormatter={shortName}
        tick={{
          ...tickStyle,
          fill: 'var(--text)',
          fontFamily: 'var(--font-sans)',
        }}
        axisLine={false}
        tickLine={false}
        width={128}
      />
      <Bar
        dataKey="value"
        fill={chartColors.series}
        radius={[0, 8, 8, 0]}
        maxBarSize={32}
        isAnimationActive={false}
      />
      <Tooltip
        trigger={trigger}
        isAnimationActive={false}
        cursor={{ fill: 'var(--card-raised)' }}
        content={(props) => {
          const row = activeRow(props) as CategoryBar | undefined;
          if (row === undefined) return null;
          return (
            <TooltipBox
              title={row.name}
              lines={[[t('charts.spent'), formatMoney(row.amount, locale)]]}
            />
          );
        }}
      />
    </BarChart>
  );
}

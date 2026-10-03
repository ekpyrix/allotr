import { formatMoney, type CurrencyCode } from '@allotr/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { t } from '@/messages/t';
import type { NetWorthRow } from '@/features/reports/plan-data';
import { chartColors, moneyTick, tickStyle } from './theme.ts';
import { activeRow, TooltipBox, useTrigger } from './tooltip.tsx';

// Net worth day by day (ADR 0020), in the info role like savings. Every
// point is the server's; Recharts only places it.
export function NetWorthChart({
  rows,
  currency,
  locale,
  title,
}: {
  rows: readonly NetWorthRow[];
  currency: CurrencyCode;
  locale: string;
  title: string;
}) {
  const trigger = useTrigger();
  const data = rows.map((row) => ({ ...row, value: row.amount.amountMinor }));
  return (
    <AreaChart
      responsive
      data={data}
      title={title}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      style={{ width: '100%', height: '100%' }}
    >
      <CartesianGrid vertical={false} stroke={chartColors.grid} />
      <XAxis
        dataKey="short"
        tick={tickStyle}
        stroke={chartColors.baseline}
        minTickGap={24}
      />
      <YAxis
        tickFormatter={moneyTick(currency, locale)}
        tick={tickStyle}
        domain={['auto', 'auto']}
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
        dot={false}
        isAnimationActive={false}
      />
      <Tooltip
        trigger={trigger}
        isAnimationActive={false}
        cursor={{ stroke: chartColors.baseline }}
        content={(props) => {
          const row = activeRow(props) as NetWorthRow | undefined;
          return row === undefined ? null : (
            <TooltipBox
              title={row.label}
              lines={[
                [
                  t('reports.plan.netWorth.total'),
                  formatMoney(row.amount, locale),
                ],
              ]}
            />
          );
        }}
      />
    </AreaChart>
  );
}

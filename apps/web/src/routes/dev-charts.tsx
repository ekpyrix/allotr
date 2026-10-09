import { localDate, money, type CalendarDayView } from '@allotr/shared';
import { useState } from 'react';
import { Allocation } from '@/charts/allocation';
import { CalendarGrid } from '@/charts/calendar-grid';
import { Chart } from '@/charts/chart';
import { Columns } from '@/charts/columns';
import { Sparkline } from '@/charts/sparkline';
import { Timeline } from '@/charts/timeline';
import { monthRange } from '@/features/calendar/model';
import { Grid, Tile } from '@/components/layout';
import { formatMoney } from '@/lib/format-money';

// Chart kit entries for the component gallery. Fixed synthetic data and a
// fixed "today", so screenshots are deterministic.

const spent = [0, 800, 1500, 1900, 3400, 4100, 4300, 5600, 6100, 6500].map(
  (y, x) => ({ x, y }),
);
const pace = { from: { x: 0, y: 0 }, to: { x: 14, y: 9000 } };
const dollars = (minor: number) => formatMoney(money(minor, 'USD'));

const month = monthRange('2026-03');
const heat = [0, 1, 2, 3, 4, 1, 0, 2, 4, 1] as const;
const days: CalendarDayView[] = Array.from({ length: 31 }, (_, i) => {
  const date = localDate(`2026-03-${String(i + 1).padStart(2, '0')}`);
  const level = i < 9 ? (heat[i] ?? 0) : null;
  return {
    date,
    spent: level === null ? null : money(level * 1200, 'USD'),
    heat: level,
    bills:
      i === 4
        ? [{ billId: 'bill-rent', amount: money(90000, 'USD'), paid: true }]
        : [],
    payday: i === 14,
    ious: [],
  };
});

export function ChartsGallery() {
  const [picked, setPicked] = useState(localDate('2026-03-05'));
  return (
    <section aria-label="Charts">
      <Grid>
        <Tile title="Chart" subtitle="spent against even pace" span={2}>
          <Chart
            label="Spent this cycle against an even pace"
            series={[
              {
                id: 'spent',
                label: 'Spent',
                color: 'series-1',
                points: spent,
                area: true,
                endLabel: dollars(6500),
              },
            ]}
            yTicks={[0, 3000, 6000, 9000].map((value) => ({
              value,
              label: dollars(value),
            }))}
            xTicks={[0, 7, 14].map((value) => ({
              value,
              label: `day ${String(value + 1)}`,
            }))}
            reference={pace}
            today={{ x: 9, label: 'today' }}
            table={{
              caption: 'Spent by cycle day',
              headers: ['Day', 'Spent'],
              rows: spent.map((p) => [String(p.x + 1), dollars(p.y)]),
            }}
          />
        </Tile>
        <Tile title="Columns" subtitle="spent per cycle">
          <Columns
            label="Spent per cycle"
            data={[
              { id: 'a', fraction: 0.6, valueLabel: '$610', xLabel: 'Jan' },
              { id: 'b', fraction: 0.85, valueLabel: '$860', xLabel: 'Feb' },
              { id: 'c', fraction: 0.4, valueLabel: '$410', xLabel: 'Mar' },
            ]}
          />
          <Sparkline
            label="Balance trend"
            points={spent.slice(0, 8)}
            color="series-2"
          />
        </Tile>
        <Tile title="Timeline" subtitle="bills this cycle" span="full">
          <Timeline
            days={30}
            today={9}
            dayLabel={(day) => `Mar ${String(day + 1)}`}
            label="Bills and payday across the cycle"
            events={[
              { id: 'rent', day: 4, kind: 'bill', label: 'Rent', paid: true },
              { id: 'power', day: 11, kind: 'bill', label: 'Power' },
              { id: 'pay', day: 14, kind: 'payday', label: 'Payday' },
              { id: 'net', day: 19, kind: 'bill', label: 'Internet' },
              { id: 'phone', day: 26, kind: 'bill', label: 'Phone' },
            ]}
          />
        </Tile>
        <Tile title="Calendar" subtitle="March 2026" span="full">
          <CalendarGrid
            month={month}
            days={days}
            today={localDate('2026-03-10')}
            picked={picked}
            onPick={setPicked}
            showHeat
            showDue
            weekdays={['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']}
            gridLabel="Grid"
            tableLabel="Table"
            headers={{ date: 'Date', spent: 'Spent', due: 'Due' }}
            dateLabel={(date) => date}
            markNames={{ b: 'bill', i: 'IOU', $: 'payday' }}
          />
        </Tile>
        <Tile title="Allocation" subtitle="this cycle" span="full">
          <Allocation
            label="Where the cycle's on-budget money went"
            leftLabel="on-budget left"
            ofLabel="of"
            left={{ amount: money(46200, 'USD'), of: money(124000, 'USD') }}
            segments={[
              {
                id: 'paid',
                label: 'Bills paid',
                amount: money(30000, 'USD'),
                fraction: 0.24,
                color: 'series-3',
              },
              {
                id: 'save',
                label: 'To savings',
                amount: money(20000, 'USD'),
                fraction: 0.16,
                color: 'series-2',
              },
              {
                id: 'spent',
                label: 'Spent',
                amount: money(27800, 'USD'),
                fraction: 0.22,
                color: 'series-1',
              },
              {
                id: 'set',
                label: 'Bills set aside',
                amount: money(41200, 'USD'),
                fraction: 0.33,
                color: 'series-4',
              },
              {
                id: 'free',
                label: 'Free to spend',
                amount: money(5000, 'USD'),
                fraction: 0.05,
                color: 'series-5',
              },
            ]}
          />
        </Tile>
      </Grid>
    </section>
  );
}

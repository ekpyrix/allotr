import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ToggleButton, Button } from 'react-aria-components';
import { localDate, type LocalDate } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon, EmptyState } from '@/components/states';
import { CalendarGrid } from '@/charts/calendar-grid';
import { monthRange, shiftMonth } from '@/features/calendar/model';
import { formatLongDay } from '@/features/today/format';
import {
  IconArrowRightSLine,
  IconMoneyDollarCircleLine,
} from '@/generated/icons';
import { seriesNumber } from '@/lib/category-style';
import {
  accountsQuery,
  calendarQuery,
  categoriesQuery,
  entriesOnQuery,
} from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { dashboardEntries } from '../dashboard/tiles/todays-entries-model.ts';
import {
  baseMonth,
  dayItems,
  defaultPick,
  findDay,
  formatMonth,
  inMonth,
  weekdayNames,
  type DayItem,
} from './calendar-model.ts';
import { PeriodMenu } from './period-menu.tsx';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';
const NONE = localDate('2000-01-01');

const layerClass = cn(
  'press inline-flex h-8 min-w-8 items-center border border-outline px-2 text-small',
  'selected:bg-primary selected:text-on-primary',
);
const stepClass =
  'press inline-flex h-8 min-w-8 items-center justify-center text-text';

const columns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: '7.5rem' },
  { width: 'auto' },
];

function itemKind(item: DayItem): string {
  switch (item.type) {
    case 'payday':
      return t('reportsCalendar.day.payday');
    case 'bill':
      return item.paid
        ? t('reportsCalendar.day.billPaid')
        : t('reportsCalendar.day.bill');
    case 'iou':
      return item.direction === 'owed-to-me'
        ? t('reportsCalendar.day.iouOwedToMe')
        : t('reportsCalendar.day.iouOwedByMe');
  }
}

function itemName(item: DayItem): string {
  switch (item.type) {
    case 'payday':
      return t('reportsCalendar.day.paydayName');
    case 'bill':
      return item.name === '' ? t('reportsCalendar.day.bill') : item.name;
    case 'iou':
      return item.person;
  }
}

// Reports · calendar (docs/ui.md §6): layer toggles, the month grid and the
// picked day's entries, bills and dues. Spending, heat and marks are the
// server's (`/v1/reports/calendar`); the month follows the period menu and
// can be stepped from the tile.
export function CalendarTab() {
  const { period, range, today, ready } = useReportRange();
  const navigate = useNavigate();
  const [showHeat, setShowHeat] = useState(true);
  const [showDue, setShowDue] = useState(true);
  // The month and day the user stepped to; each is dropped when the period
  // it was chosen under changes.
  const [stepped, setStepped] = useState<{
    period: string;
    month: string;
    picked: LocalDate | null;
  } | null>(null);

  const base =
    ready && today !== undefined ? baseMonth(range, today) : undefined;
  const month = stepped?.period === period ? stepped.month : base;
  const span = month === undefined ? undefined : monthRange(month);

  const calendar = useQuery({
    ...calendarQuery(span?.from ?? NONE, span?.to ?? NONE),
    enabled: span !== undefined,
  });
  const bills = useQuery(billsQuery);
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);

  const pickedRaw =
    stepped?.period === period && stepped.month === month
      ? stepped.picked
      : null;
  const picked: LocalDate | undefined =
    month === undefined || today === undefined
      ? undefined
      : pickedRaw !== null && inMonth(pickedRaw, month)
        ? pickedRaw
        : defaultPick(month, today);
  const entries = useQuery(entriesOnQuery(picked));

  const title = t('reportsCalendar.title');
  const step = (delta: -1 | 1) => {
    if (span === undefined) return;
    setStepped({
      period,
      month: shiftMonth(span, delta).month,
      picked: null,
    });
  };
  const pick = (date: LocalDate) => {
    if (month === undefined) return;
    setStepped({ period, month, picked: date });
  };

  if (calendar.isError) {
    return (
      <Stack className="h-full">
        <PeriodMenu />
        <Tile title={title}>
          <div role="alert" className="flex items-center gap-2 py-2 text-small">
            <span className="text-negative">{t('reportsCalendar.failed')}</span>
            <BracketButton
              onPress={() => {
                void calendar.refetch();
              }}
            >
              {t('reportsCalendar.retry')}
            </BracketButton>
          </div>
        </Tile>
      </Stack>
    );
  }
  if (
    span === undefined ||
    month === undefined ||
    today === undefined ||
    picked === undefined ||
    calendar.data === undefined
  ) {
    return (
      <Stack className="h-full">
        <PeriodMenu />
        <SkeletonTile rows={6} />
      </Stack>
    );
  }

  const billNames = new Map(
    (bills.data?.bills ?? []).map((b) => [b.id, b.name]),
  );
  const day = findDay(calendar.data.days, picked);
  const items = dayItems(day, billNames);
  const rows =
    entries.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
      ? []
      : dashboardEntries(
          entries.data.transactions,
          accounts.data.accounts,
          categories.data.categories,
        );
  const listLoading =
    entries.data === undefined &&
    !entries.isError &&
    accounts.data === undefined;

  return (
    <Stack className="h-full">
      <PeriodMenu />
      <Tile
        title={title}
        subtitle={formatMonth(month, locale)}
        bodyClassName="px-0 pb-0"
        actions={
          <div className="flex items-center">
            <Button
              aria-label={t('reportsCalendar.month.previous')}
              onPress={() => {
                step(-1);
              }}
              className={stepClass}
            >
              <IconArrowRightSLine className="size-4 rotate-180" />
            </Button>
            <Button
              aria-label={t('reportsCalendar.month.next')}
              onPress={() => {
                step(1);
              }}
              className={stepClass}
            >
              <IconArrowRightSLine className="size-4" />
            </Button>
          </div>
        }
      >
        <div
          role="group"
          aria-label={t('reportsCalendar.layers.label')}
          className="flex flex-wrap gap-1 px-3 pt-2"
        >
          <ToggleButton
            isSelected={showHeat}
            onChange={setShowHeat}
            className={layerClass}
          >
            {t('reportsCalendar.layers.heat')}
          </ToggleButton>
          <ToggleButton
            isSelected={showDue}
            onChange={setShowDue}
            className={layerClass}
          >
            {t('reportsCalendar.layers.due')}
          </ToggleButton>
        </div>
        <CalendarGrid
          month={span}
          days={calendar.data.days}
          today={today}
          picked={picked}
          onPick={pick}
          showHeat={showHeat}
          showDue={showDue}
          weekdays={weekdayNames(locale)}
          gridLabel={t('reportsCalendar.grid')}
          tableLabel={t('reportsCalendar.table')}
          headers={{
            date: t('reportsCalendar.headers.date'),
            spent: t('reportsCalendar.headers.spent'),
            due: t('reportsCalendar.headers.due'),
          }}
          dateLabel={(date) => formatLongDay(date, locale)}
          markNames={{
            b: t('reportsCalendar.marks.b'),
            i: t('reportsCalendar.marks.i'),
            $: t('reportsCalendar.marks.$'),
          }}
          locale={locale}
        />
      </Tile>
      {listLoading ? (
        <SkeletonTile rows={3} />
      ) : (
        <Tile
          title={t('reportsCalendar.day.title')}
          subtitle={formatLongDay(picked, locale)}
          bodyClassName="px-0 pb-0"
        >
          {rows.length === 0 && items.length === 0 ? (
            <EmptyState
              title={t('reportsCalendar.day.nothing')}
              hint={t('reportsCalendar.day.nothingHint')}
            />
          ) : (
            <div>
              {rows.map((row) => {
                const colour =
                  row.style === null
                    ? undefined
                    : seriesNumber(row.style.colour);
                const name = row.payee ?? t('reportsCalendar.day.untitled');
                return (
                  <Row
                    key={row.id}
                    columns={columns}
                    onPress={() => {
                      void navigate({
                        to: '/transactions',
                        search: { entry: row.id },
                      });
                    }}
                    cells={[
                      <span key="n" className="flex items-center gap-2">
                        {row.style?.icon == null ? (
                          <IconMoneyDollarCircleLine className="size-4 shrink-0 text-text-muted" />
                        ) : (
                          <CategoryIcon
                            name={row.style.icon}
                            {...(colour === undefined ? {} : { color: colour })}
                          />
                        )}
                        <span className="truncate font-sans">{name}</span>
                      </span>,
                      <span key="k" className="text-text-muted">
                        {row.time ?? t('reportsCalendar.day.entry')}
                      </span>,
                      row.amount === null ? null : (
                        <Amount
                          key="a"
                          amount={row.amount}
                          kind={
                            row.kind === 'transfer'
                              ? 'transfer'
                              : row.amount.amountMinor < 0
                                ? 'expense'
                                : 'income'
                          }
                          locale={locale}
                        />
                      ),
                    ]}
                  />
                );
              })}
              {items.map((item) => (
                <Row
                  key={item.key}
                  columns={columns}
                  cells={[
                    <span key="n" className="font-sans">
                      {itemName(item)}
                    </span>,
                    <span key="k" className="text-text-muted">
                      {itemKind(item)}
                    </span>,
                    item.type === 'payday' ? null : (
                      <Amount key="a" amount={item.amount} locale={locale} />
                    ),
                  ]}
                />
              ))}
            </div>
          )}
        </Tile>
      )}
    </Stack>
  );
}

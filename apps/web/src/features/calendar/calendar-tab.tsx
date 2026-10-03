import {
  formatMoney,
  formatMoneyCompact,
  type AccountView,
  type CalendarDayView,
  type CalendarView,
  type CategoryView,
  type LocalDate,
} from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  ChartColumn,
  Receipt,
  Table2,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ChartTable } from '@/features/charts/chart-frame';
import { formatLongDay } from '@/features/ledger/format';
import { entryRows } from '@/features/today/entries';
import { calendarQuery, entriesOnQuery } from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import {
  leadingBlanks,
  monthRange,
  shiftMonth,
  type MonthRange,
} from './model.ts';

// The calendar (FR-W2): a month grid with two layers that can be switched
// on and off. Spending heat is what each day spent, linked bill payments
// left out; bills and dues are bills, payday and IOU due dates. Every
// figure is the server's, every cell has its text, and a table shows the
// same days.

// Heat is the primary container, thickened with the level; the text on it
// stays the page's text colour, and the amount is written out as well.
const HEAT = [
  '',
  'bg-primary-container/25',
  'bg-primary-container/50',
  'bg-primary-container/75',
  'bg-primary-container',
];

function monthTitle(range: MonthRange, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${range.from}T00:00:00Z`));
}

// Monday to Sunday, as short names in the user's locale.
function weekdays(locale: string): { short: string; long: string }[] {
  const short = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const long = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 5, 1 + i));
    return { short: short.format(date), long: long.format(date) };
  });
}

/** What falls due that day, in words. */
export function dueText(
  day: CalendarDayView,
  billNames: ReadonlyMap<string, string>,
  locale: string,
): string[] {
  return [
    ...day.bills.map((b) =>
      t(b.paid ? 'calendar.billPaid' : 'calendar.billDue', {
        name: billNames.get(b.billId) ?? t('calendar.bill'),
        amount: formatMoney(b.amount, locale),
      }),
    ),
    ...(day.payday ? [t('calendar.payday')] : []),
    ...day.ious.map((i) =>
      t(
        i.direction === 'owed-to-me' ? 'calendar.iouToMe' : 'calendar.iouByMe',
        { person: i.person, amount: formatMoney(i.outstanding, locale) },
      ),
    ),
  ];
}

function cellLabel(
  day: CalendarDayView,
  layers: { heat: boolean; dues: boolean },
  billNames: ReadonlyMap<string, string>,
  locale: string,
): string {
  const parts = [formatLongDay(day.date, locale)];
  if (layers.heat && day.spent !== null)
    parts.push(t('calendar.spent', { amount: formatMoney(day.spent, locale) }));
  if (layers.dues) parts.push(...dueText(day, billNames, locale));
  return parts.join('. ');
}

function Grid({
  calendar,
  layers,
  selected,
  billNames,
  locale,
  onSelect,
}: {
  calendar: CalendarView;
  layers: { heat: boolean; dues: boolean };
  selected: LocalDate | null;
  billNames: ReadonlyMap<string, string>;
  locale: string;
  onSelect: (date: LocalDate) => void;
}) {
  const blanks = leadingBlanks(calendar.from);
  const names = weekdays(locale);
  return (
    <div
      role="group"
      aria-label={t('calendar.gridLabel')}
      className="grid grid-cols-7 gap-1"
    >
      {names.map((n) => (
        <abbr
          key={n.long}
          title={n.long}
          className="text-center text-caption text-text-muted no-underline"
        >
          {n.short}
        </abbr>
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <span key={`blank-${String(i)}`} aria-hidden="true" />
      ))}
      {calendar.days.map((day) => {
        const heat = layers.heat && day.heat !== null ? day.heat : 0;
        const due = layers.dues;
        return (
          <button
            key={day.date}
            type="button"
            data-testid="calendar-day"
            data-date={day.date}
            data-heat={layers.heat ? (day.heat ?? '') : ''}
            aria-label={cellLabel(day, layers, billNames, locale)}
            aria-pressed={selected === day.date}
            onClick={() => {
              onSelect(day.date);
            }}
            className={`flex min-h-14 flex-col items-center justify-between rounded-md border p-1 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${HEAT[heat] ?? ''} ${selected === day.date ? 'border-primary border-2' : 'border-outline-variant'} ${day.date === calendar.today ? 'font-bold' : ''}`}
          >
            <span className="text-body">
              {day.date.slice(8).replace(/^0/, '')}
            </span>
            {layers.heat && day.spent !== null && day.spent.amountMinor > 0 ? (
              <span
                aria-hidden="true"
                className="font-mono text-[0.6875rem] leading-none"
              >
                {formatMoneyCompact(day.spent, locale)}
              </span>
            ) : null}
            {due &&
            (day.bills.length > 0 || day.payday || day.ious.length > 0) ? (
              <span aria-hidden="true" className="flex gap-0.5">
                {day.bills.length > 0 ? <Receipt className="size-3.5" /> : null}
                {day.payday ? <Banknote className="size-3.5" /> : null}
                {day.ious.length > 0 ? (
                  <HandCoins className="size-3.5" />
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function DayDetail({
  day,
  billNames,
  accounts,
  categories,
  locale,
}: {
  day: CalendarDayView;
  billNames: ReadonlyMap<string, string>;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  locale: string;
}) {
  const heading = useId();
  const entries = useQuery(entriesOnQuery(day.date));
  const rows =
    entries.data === undefined
      ? []
      : entryRows(entries.data.transactions, accounts, categories);
  const dues = dueText(day, billNames, locale);
  return (
    <section
      aria-labelledby={heading}
      className="grid gap-2"
      data-testid="calendar-detail"
    >
      <h3 id={heading} className="text-title">
        {formatLongDay(day.date, locale)}
      </h3>
      {day.spent === null ? (
        <p className="text-text-muted">{t('calendar.future')}</p>
      ) : (
        <p>{t('calendar.spent', { amount: formatMoney(day.spent, locale) })}</p>
      )}
      {dues.length === 0 ? null : (
        <ul className="list-disc pl-5">
          {dues.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {entries.data === undefined ? null : rows.length === 0 ? (
        <p className="text-text-muted">{t('calendar.noEntries')}</p>
      ) : (
        <ul className="border-y border-outline-variant">
          {rows.map((row) => (
            <li
              key={row.id}
              className="border-b border-outline-variant last:border-b-0"
            >
              <Link
                to="/transactions"
                search={{ entry: row.id }}
                className="flex min-h-11 items-center justify-between gap-3 px-1 py-2"
              >
                <span className="min-w-0 wrap-anywhere">
                  {row.title ??
                    row.note ??
                    t(`today.entries.kinds.${row.kind}`)}
                </span>
                {row.amount === null ? null : (
                  <span className="font-mono">
                    {formatMoney(row.amount, locale)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CalendarTab({
  today,
  accounts,
  categories,
  locale,
}: {
  today: LocalDate;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  locale: string;
}) {
  const [range, setRange] = useState(() => monthRange(today.slice(0, 7)));
  const [layers, setLayers] = useState({ heat: true, dues: true });
  const [selected, setSelected] = useState<LocalDate | null>(null);
  const [asTable, setAsTable] = useState(false);
  const heatId = useId();
  const duesId = useId();
  const calendar = useQuery(calendarQuery(range.from, range.to));
  const bills = useQuery(billsQuery);
  const billNames = new Map(bills.data?.bills.map((b) => [b.id, b.name]));
  const title = monthTitle(range, locale);
  const day = calendar.data?.days.find((d) => d.date === selected);

  return (
    <Card
      className="grid gap-4"
      role="region"
      aria-label={t('calendar.title')}
      data-testid="calendar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="text"
            size="icon"
            aria-label={t('calendar.previous')}
            onClick={() => {
              setRange(shiftMonth(range, -1));
              setSelected(null);
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h2 className="min-w-36 text-center text-title" aria-live="polite">
            {title}
          </h2>
          <Button
            variant="text"
            size="icon"
            aria-label={t('calendar.next')}
            onClick={() => {
              setRange(shiftMonth(range, 1));
              setSelected(null);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <Button
          variant="text"
          size="dense"
          onClick={() => {
            setAsTable((shown) => !shown);
          }}
        >
          {asTable ? (
            <ChartColumn aria-hidden="true" />
          ) : (
            <Table2 aria-hidden="true" />
          )}
          {asTable ? t('calendar.showGrid') : t('calendar.showTable')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <Switch
            id={heatId}
            checked={layers.heat}
            onCheckedChange={(heat) => {
              setLayers((current) => ({ ...current, heat }));
            }}
          />
          <label htmlFor={heatId} className="text-body">
            {t('calendar.layers.heat')}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id={duesId}
            checked={layers.dues}
            onCheckedChange={(dues) => {
              setLayers((current) => ({ ...current, dues }));
            }}
          />
          <label htmlFor={duesId} className="text-body">
            {t('calendar.layers.dues')}
          </label>
        </div>
      </div>
      <p className="text-caption text-text-muted">{t('calendar.heatNote')}</p>
      {calendar.data === undefined ? (
        <p role="status" className="text-text-muted">
          {calendar.isError ? t('errors.network') : t('reports.loading')}
        </p>
      ) : asTable ? (
        // A table that scrolls sideways must be reachable by keyboard.
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={t('calendar.tableCaption', { month: title })}
        >
          <ChartTable
            caption={t('calendar.tableCaption', { month: title })}
            columns={[
              t('calendar.day'),
              t('calendar.spentColumn'),
              t('calendar.dueColumn'),
            ]}
            rows={calendar.data.days.map((d) => [
              d.date,
              formatLongDay(d.date, locale),
              d.spent === null
                ? t('calendar.none')
                : formatMoney(d.spent, locale),
              dueText(d, billNames, locale).join('; ') || t('calendar.none'),
            ])}
          />
        </div>
      ) : (
        <Grid
          calendar={calendar.data}
          layers={layers}
          selected={selected}
          billNames={billNames}
          locale={locale}
          onSelect={setSelected}
        />
      )}
      {day === undefined ? null : (
        <DayDetail
          day={day}
          billNames={billNames}
          accounts={accounts}
          categories={categories}
          locale={locale}
        />
      )}
    </Card>
  );
}

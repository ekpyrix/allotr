import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { LeftBar, SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { KeyFigures } from '@/components/stats';
import { Timeline } from '@/charts/timeline';
import { formatDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import { billsView, cycleDayDate, type DueItem } from './bills-model.ts';

const locale = 'en';
const money = (amount: Parameters<typeof formatMoney>[0]) =>
  formatMoney(amount, 'symbol', locale);

const upcomingColumns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: '4rem', from: 'medium' },
  { width: 'auto' },
];

function UpcomingRow({ item }: { item: DueItem }) {
  const name = item.name === '' ? t('budgetBills.timeline.unknown') : item.name;
  return (
    <li>
      <Row
        columns={upcomingColumns}
        cells={[
          <span key="n" className="font-sans">
            {name}
          </span>,
          <span key="d" className="text-text-muted">
            {formatDay(item.dueOn, locale)}
          </span>,
          <Amount key="a" amount={item.amount} locale={locale} />,
        ]}
      />
      {item.reserve === null ? null : (
        <div className="border-b px-3 pb-1.5">
          <p className="num truncate text-tiny text-text-muted">
            {t('budgetBills.upcoming.setAsideOf', {
              reserve: money(item.reserve),
              amount: money(item.amount),
            })}
          </p>
          <LeftBar
            fraction={item.fraction}
            label={t('budgetBills.upcoming.setAsideLabel', { name })}
            className="mt-0.5"
          />
        </div>
      )}
    </li>
  );
}

function PaidRow({ item }: { item: DueItem }) {
  const name = item.name === '' ? t('budgetBills.timeline.unknown') : item.name;
  return (
    <li>
      <Row
        columns={upcomingColumns}
        cells={[
          <span key="n" className="font-sans">
            {name}
          </span>,
          <span key="d" className="text-text-muted">
            {item.paidOn === null ? '' : formatDay(item.paidOn, locale)}
          </span>,
          <Amount key="a" amount={item.amount} locale={locale} />,
        ]}
      />
    </li>
  );
}

// Budget · bills (docs/ui.md §6): the cycle's timeline with set aside, paid
// and next; the unpaid due dates with a "set aside of" bar; and what was
// paid this cycle. Figures are the server's (`reserved`, `allocation.paidBills`).
export function BillsTab() {
  const today = useQuery(todayQuery);
  const bills = useQuery(billsQuery);

  if (today.isError || bills.isError) {
    return (
      <Tile title={t('nav.budget')}>
        <EmptyState
          title={t('budgetBills.failed')}
          hint=""
          action={
            <BracketButton
              onPress={() => {
                void today.refetch();
                void bills.refetch();
              }}
            >
              {t('budgetBills.retry')}
            </BracketButton>
          }
        />
      </Tile>
    );
  }
  if (today.data === undefined || bills.data === undefined) {
    return (
      <Grid>
        <SkeletonTile rows={4} span="full" />
        <SkeletonTile rows={3} />
        <SkeletonTile rows={3} />
      </Grid>
    );
  }

  const view = billsView(today.data, bills.data.bills, {
    payday: t('budgetBills.timeline.payday'),
    unknown: t('budgetBills.timeline.unknown'),
  });
  const opened = today.data.cycle.openedOn;
  const { next } = view;
  const nextName =
    next === null
      ? ''
      : next.name === ''
        ? t('budgetBills.timeline.unknown')
        : next.name;

  return (
    <Grid>
      <Tile
        title={t('budgetBills.timeline.title')}
        subtitle={t('budgetBills.timeline.subtitle', {
          day: view.timeline.today + 1,
          length: view.timeline.days,
        })}
        span="full"
        primary
        bodyClassName="grid content-start gap-3 pt-2.5"
      >
        <KeyFigures
          figures={[
            {
              label: t('budgetBills.figures.setAside'),
              figure: money(today.data.reserved),
            },
            {
              label: t('budgetBills.figures.paid'),
              figure: money(today.data.allocation.paidBills),
            },
            {
              label: t('budgetBills.figures.next'),
              figure:
                next === null
                  ? t('budgetBills.figures.none')
                  : t('budgetBills.figures.nextValue', {
                      name: nextName,
                      date: formatDay(next.dueOn, locale),
                    }),
            },
          ]}
        />
        <Timeline
          days={view.timeline.days}
          today={view.timeline.today}
          events={view.timeline.events}
          dayLabel={(day) => formatDay(cycleDayDate(opened, day), locale)}
          label={t('budgetBills.timeline.label')}
        />
      </Tile>
      <Tile
        title={t('budgetBills.upcoming.title')}
        subtitle={t('budgetBills.upcoming.subtitle')}
        bodyClassName="px-0 pb-0"
      >
        {view.upcoming.length === 0 ? (
          <EmptyState
            title={t('budgetBills.upcoming.empty')}
            hint={t('budgetBills.upcoming.emptyHint')}
          />
        ) : (
          <ul>
            {view.upcoming.map((item) => (
              <UpcomingRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Tile>
      <Tile title={t('budgetBills.paid.title')} bodyClassName="px-0 pb-0">
        {view.paid.length === 0 ? (
          <EmptyState
            title={t('budgetBills.paid.empty')}
            hint={t('budgetBills.paid.emptyHint')}
          />
        ) : (
          <ul>
            {view.paid.map((item) => (
              <PaidRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Tile>
      {view.later.length === 0 ? null : (
        <Tile
          title={t('budgetBills.later.title')}
          subtitle={t('budgetBills.later.subtitle')}
          bodyClassName="px-0 pb-0"
        >
          <ul>
            {view.later.map((bill) => (
              <li key={bill.id}>
                <Row
                  columns={upcomingColumns}
                  cells={[
                    <span key="n" className="font-sans">
                      {bill.name}
                    </span>,
                    <span key="d" className="text-text-muted">
                      {t('budgetBills.later.day', { day: bill.dueDay })}
                    </span>,
                    <Amount key="a" amount={bill.amount} locale={locale} />,
                  ]}
                />
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </Grid>
  );
}

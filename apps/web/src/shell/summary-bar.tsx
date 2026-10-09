import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Amount } from '@/components/amount';
import { LeftBar, Skeleton } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { formatDay } from '@/features/today/format';
import { poolsQuery } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { barFraction } from './summary-math.ts';

// The summary bar (docs/ui.md §3). Priority order, left to right: left
// today, the on-budget total, the pools, then the payday where there is
// room. It shows figures the server sent and derives none: the pools' and
// the on-budget total's "left of" bars arrive with the API additions in
// docs/ui.md §8, so for now they show balances only.

const locale = 'en';

const cell = 'flex min-w-0 flex-col justify-center gap-0.5 border-r px-3';

function Item({
  to,
  label,
  className,
  children,
}: {
  to: '/' | '/accounts';
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} aria-label={label} className={cn('press', cell, className)}>
      {children}
    </Link>
  );
}

export function SummaryBar() {
  const today = useQuery(todayQuery);
  const pools = useQuery(poolsQuery);
  const data = today.data;

  return (
    <section
      aria-label={t('shell.slots.summary')}
      data-slot="summary"
      className="flex min-h-bar min-w-0 flex-col border-b bg-canvas medium:col-start-2 medium:row-start-1 medium:flex-row"
    >
      {today.isError ? (
        <div role="alert" className="flex items-center gap-2 px-3 text-small">
          <span className="text-negative">{t('shell.summary.loadFailed')}</span>
          <BracketButton onPress={() => void today.refetch()}>
            {t('shell.summary.retry')}
          </BracketButton>
        </div>
      ) : data === undefined ? (
        <div
          aria-busy="true"
          className="flex w-full flex-col justify-center gap-1 px-3 py-2"
        >
          <Skeleton width="40%" height="1.25rem" />
          <Skeleton width="25%" height="0.75rem" />
        </div>
      ) : (
        <>
          <div className="flex min-w-0 medium:contents">
            <Item
              to="/"
              label={t('shell.summary.leftToday')}
              className="min-w-[10rem] flex-1 border-l-[3px] border-l-positive medium:flex-none"
            >
              <span className="truncate text-tiny text-text-muted">
                {t('shell.summary.leftToday')}
              </span>
              <span className="truncate text-hero font-semibold">
                <Amount amount={data.leftToday} />
                <span className="text-hero-sub text-text-muted">
                  {' / '}
                  {formatMoney(data.todayAllowance, 'symbol', locale)}
                </span>
              </span>
              <span className="truncate text-tiny text-text-muted">
                {t('shell.summary.spent', {
                  amount: formatMoney(data.spentToday, 'symbol', locale),
                })}
                {' · '}
                {data.overdue
                  ? t('shell.summary.overdue')
                  : t('shell.summary.daysToPayday', { count: data.daysLeft })}
              </span>
              <LeftBar
                fraction={barFraction(
                  data.leftToday.amountMinor,
                  data.todayAllowance.amountMinor,
                )}
                label={t('shell.summary.leftTodayBar')}
              />
            </Item>
            <Item
              to="/accounts"
              label={t('shell.summary.onBudget')}
              className="min-w-[8rem] flex-1 medium:flex-none"
            >
              <span className="truncate text-tiny text-text-muted">
                {t('shell.summary.onBudget')}
              </span>
              <span className="truncate text-stat font-semibold">
                <Amount amount={data.onBudget} />
              </span>
              <span className="truncate text-tiny text-text-muted">
                {t('shell.summary.onBudgetSub', {
                  reserved: formatMoney(data.reserved, 'symbol', locale),
                  free: formatMoney(data.available, 'symbol', locale),
                })}
              </span>
            </Item>
          </div>
          <ul
            aria-label={t('shell.summary.pools')}
            className="scroll grid min-w-0 auto-cols-[minmax(7rem,1fr)] grid-flow-col grid-rows-1 border-t medium:flex-1 medium:grid-rows-2 medium:border-t-0 medium:[&:has(>li:nth-child(-n+2):last-child)]:grid-rows-1"
          >
            {pools.data?.pools
              .filter((pool) => !pool.archived)
              .map((pool) => (
                <li key={pool.id} className="min-w-0 border-r border-b">
                  <Link
                    to="/budget/$sub"
                    params={{ sub: 'pools' }}
                    className="press flex h-full min-h-hit min-w-0 flex-col justify-center px-2"
                  >
                    <span className="flex min-w-0 items-center gap-1 text-tiny text-text-muted">
                      <span className="truncate font-ui">{pool.name}</span>
                      {pool.counts ? (
                        <span
                          role="img"
                          aria-label={t('shell.summary.countsDaily')}
                          className="text-positive"
                        >
                          ●
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-small">
                      <Amount amount={pool.balance.amount} />
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
          <Link
            to="/reports/$sub"
            params={{ sub: 'cycles' }}
            aria-label={t('shell.summary.payday')}
            className={cn(
              'press hidden wide:flex',
              cell,
              'min-w-[7rem] border-l',
            )}
          >
            <span className="truncate text-tiny text-text-muted">
              {t('shell.summary.payday')}
            </span>
            <span className="truncate text-base font-semibold">
              {formatDay(data.cycleEnd, locale)}
            </span>
          </Link>
        </>
      )}
    </section>
  );
}

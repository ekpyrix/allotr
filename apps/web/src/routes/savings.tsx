import { formatMoney } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { Page } from '@/components/page';
import { groupAccounts } from '@/features/accounts/groups';
import { formatRange } from '@/features/cycles/format';
import { linkClass, MissingRates, PageState } from '@/features/cycles/parts';
import { formatLongDay } from '@/features/ledger/format';
import {
  accountsQuery,
  cyclesQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { t } from '@/messages/t';

// The savings view (FR-W2, G3): off-budget accounts, their total and how
// it moved each cycle. Goals come in M4. Figures are the server's.
export function SavingsPage() {
  const settings = useQuery(ledgerSettingsQuery);
  const accounts = useQuery(accountsQuery);
  const cycles = useQuery(cyclesQuery);
  const today = useQuery(todayQuery);
  const accountsHeading = useId();
  const cyclesHeading = useId();

  if (
    settings.data === undefined ||
    accounts.data === undefined ||
    cycles.data === undefined ||
    today.data === undefined
  )
    return (
      <PageState
        title={t('savings.title')}
        loading={t('savings.loading')}
        queries={[settings, accounts, cycles, today]}
      />
    );

  const { locale, defaultCurrency } = settings.data;
  const savings = groupAccounts(accounts.data.accounts).off;
  const total = accounts.data.totals.off;

  return (
    <Page title={t('savings.title')} intro={t('savings.intro')}>
      <p className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 rounded-md bg-plot p-4">
        <span className="text-muted-foreground">{t('savings.total')}</span>
        <span
          data-testid="savings-total"
          className="font-mono text-2xl font-semibold tabular-nums wrap-anywhere"
        >
          {formatMoney(total.amount, locale)}
        </span>
      </p>
      <MissingRates
        currencies={total.missingRates}
        defaultCurrency={defaultCurrency}
        date={formatLongDay(today.data.today, locale)}
      />

      <section aria-labelledby={accountsHeading} className="mt-10">
        <h2 id={accountsHeading} className="text-xl font-semibold">
          {t('savings.accounts')}
        </h2>
        {savings.length === 0 ? (
          <p className="mt-3 max-w-prose text-muted-foreground">
            {t('savings.none')}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {savings.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-md bg-plot px-4 py-3"
              >
                <Link
                  to="/ledger"
                  search={{ account: account.id }}
                  className={`${linkClass} min-w-0 wrap-anywhere`}
                >
                  {account.name}
                </Link>
                <span className="font-mono tabular-nums wrap-anywhere">
                  {formatMoney(account.balance, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4">
          <Link to="/accounts" className={linkClass}>
            {t('savings.manage')}
          </Link>
        </p>
      </section>

      <section aria-labelledby={cyclesHeading} className="mt-10">
        <h2 id={cyclesHeading} className="text-xl font-semibold">
          {t('savings.byCycle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('savings.byCycleHint')}
        </p>
        <ul className="mt-3 grid gap-2">
          {cycles.data.cycles.map((cycle) => (
            <li
              key={cycle.openedOn}
              data-cycle={cycle.openedOn}
              className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-md bg-plot px-4 py-3"
            >
              <Link
                to="/cycle"
                search={
                  cycle.closedOn === null ? {} : { start: cycle.openedOn }
                }
                className={linkClass}
              >
                {cycle.closedOn === null
                  ? t('savings.thisCycle')
                  : formatRange(cycle.openedOn, cycle.lastDay, locale)}
              </Link>
              <span className="font-mono tabular-nums wrap-anywhere">
                {formatMoney(cycle.savingsNetChange, locale)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}

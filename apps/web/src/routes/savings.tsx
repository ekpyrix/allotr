import { formatMoney } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PiggyBank } from 'lucide-react';
import { lazy, useId } from 'react';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { List, ListRowButton } from '@/components/ui/list';
import { groupAccounts } from '@/features/accounts/groups';
import { ChartFrame, ChartTable } from '@/features/charts/chart-frame';
import {
  savingsCycles,
  savingsRows,
  type SavingsCycle,
} from '@/features/cycles/chart-data';
import { linkClass, MissingRates, PageState } from '@/features/cycles/parts';
import { formatLongDay } from '@/features/ledger/format';
import {
  accountsQuery,
  cyclesQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { t } from '@/messages/t';

// The savings view (FR-W2, G3, spec §11.5): the off-budget total, how it
// grew over the last cycles and how much each cycle added, and the
// off-budget accounts. Savings draw in the info role, never a hero colour:
// they are never counted in what can be spent. Goals come in M4. Every
// figure is the server's.

// Recharts loads with the first chart, never with the app.
const charts = () => import('@/features/charts/savings-charts');
const SavingsGrowthChart = lazy(() =>
  charts().then((m) => ({ default: m.SavingsGrowthChart })),
);
const SavingsChangeChart = lazy(() =>
  charts().then((m) => ({ default: m.SavingsChangeChart })),
);

function tableOf(cycles: readonly SavingsCycle[], locale: string) {
  return {
    columns: [
      t('savings.cycle'),
      t('savings.chart.total'),
      t('savings.chart.change'),
    ],
    rows: savingsRows(cycles, locale),
  };
}

function Charts({
  cycles,
  locale,
}: {
  cycles: readonly SavingsCycle[];
  locale: string;
}) {
  const first = cycles.at(0);
  const last = cycles.at(-1);
  if (first === undefined || last === undefined) return null;
  const currency = last.total.currency;
  const added = cycles.filter((cycle) => cycle.change.amountMinor > 0).length;
  const growthTitle = t('savings.growth.title');
  const changeTitle = t('savings.byCycle');
  const table = tableOf(cycles, locale);
  return (
    <>
      <ChartFrame
        testId="savings-growth"
        title={growthTitle}
        summary={
          first === last
            ? t('savings.growth.single', {
                end: formatMoney(last.total, locale),
              })
            : t('savings.growth.summary', {
                start: formatMoney(first.total, locale),
                from: first.label,
                end: formatMoney(last.total, locale),
              })
        }
        table={<ChartTable caption={t('savings.growth.caption')} {...table} />}
        chart={
          <SavingsGrowthChart
            cycles={cycles}
            currency={currency}
            locale={locale}
            title={growthTitle}
          />
        }
      />
      <ChartFrame
        testId="savings-change"
        title={changeTitle}
        summary={
          added === 0
            ? t('savings.change.none', {
                count: cycles.length,
                total: cycles.length,
              })
            : t('savings.change.summary', {
                count: added,
                total: cycles.length,
              })
        }
        table={<ChartTable caption={t('savings.change.caption')} {...table} />}
        chart={
          <SavingsChangeChart
            cycles={cycles}
            currency={currency}
            locale={locale}
            title={changeTitle}
          />
        }
      />
    </>
  );
}

export function SavingsPage() {
  const settings = useQuery(ledgerSettingsQuery);
  const accounts = useQuery(accountsQuery);
  const cycles = useQuery(cyclesQuery);
  const today = useQuery(todayQuery);
  const accountsHeading = useId();

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
      <div className="mt-6 grid gap-4">
        <Card className="grid gap-2 bg-info-container">
          <p className="flex items-center gap-2 text-label">
            <PiggyBank aria-hidden className="size-5" />
            {t('savings.total')}
          </p>
          <p
            data-testid="savings-total"
            className="font-mono text-display tabular-nums wrap-anywhere"
          >
            {formatMoney(total.amount, locale)}
          </p>
          <p>{t('savings.neverCounted')}</p>
        </Card>
        <MissingRates
          currencies={total.missingRates}
          defaultCurrency={defaultCurrency}
          date={formatLongDay(today.data.today, locale)}
        />

        {savings.length === 0 ? (
          <Card>
            <EmptyState
              icon={<PiggyBank />}
              title={t('savings.none')}
              action={
                <Button asChild variant="tonal">
                  <Link to="/accounts">{t('savings.manage')}</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <Charts
              cycles={savingsCycles(cycles.data.cycles, locale)}
              locale={locale}
            />
            <section aria-labelledby={accountsHeading} className="grid gap-3">
              <h2 id={accountsHeading} className="text-title">
                {t('savings.accounts')}
              </h2>
              <List>
                {savings.map((account) => (
                  <ListRowButton
                    key={account.id}
                    title={account.name}
                    trailing={formatMoney(account.balance, locale)}
                    render={({ className, children }) => (
                      <Link
                        to="/ledger"
                        search={{ account: account.id }}
                        className={className}
                      >
                        {children}
                      </Link>
                    )}
                  />
                ))}
              </List>
              <p>
                <Link to="/accounts" className={linkClass}>
                  {t('savings.manage')}
                </Link>
              </p>
            </section>
          </>
        )}
      </div>
    </Page>
  );
}

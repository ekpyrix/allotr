import { useQuery } from '@tanstack/react-query';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { LoadingBlock } from '@/components/route-skeleton';
import { Button } from '@/components/ui/button';
import { BudgetsSection } from '@/features/budget/budgets-section';
import { CoverOrder } from '@/features/budget/cover-order';
import { PaydaySection } from '@/features/payday/payday-section';
import { PoolsSection } from '@/features/budget/pools-section';
import { BillsSection } from '@/features/settings/bills';
import { budgetsQuery, poolsQuery } from '@/lib/budgets';
import { iousQuery } from '@/lib/ious';
import { IousSection } from '@/features/ious/ious-section';
import {
  allAccountsQuery,
  allCategoriesQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { billsQuery, ratesQuery } from '@/lib/settings';
import { t } from '@/messages/t';

// The Budget tab (ADR 0021, 0023): budgets for the period, the cover order,
// pools and the bills that reserve money from the daily number. Every
// figure comes from the server, so nothing here is a placeholder.
export function BudgetPage() {
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const bills = useQuery(billsQuery);
  const rates = useQuery(ratesQuery);
  // Merged and archived too: a bill can still name one.
  const categories = useQuery(allCategoriesQuery);
  const accounts = useQuery(allAccountsQuery);
  const budgets = useQuery(budgetsQuery);
  const pools = useQuery(poolsQuery);
  const ious = useQuery(iousQuery);
  const all = [
    settings,
    today,
    bills,
    rates,
    categories,
    accounts,
    budgets,
    pools,
    ious,
  ];

  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <Page title={t('budget.title')}>
        <div className="mt-6 grid justify-items-start gap-4">
          <FormError message={errorMessage(failed.error)} />
          <Button
            onClick={() => {
              for (const q of all) if (q.isError) void q.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
        </div>
      </Page>
    );

  if (
    settings.data === undefined ||
    today.data === undefined ||
    bills.data === undefined ||
    rates.data === undefined ||
    categories.data === undefined ||
    accounts.data === undefined ||
    budgets.data === undefined ||
    pools.data === undefined ||
    ious.data === undefined
  )
    return (
      <Page title={t('budget.title')}>
        <LoadingBlock label={t('budget.loading')} />
      </Page>
    );

  return (
    <Page title={t('budget.title')} intro={t('budget.intro')}>
      <BudgetsSection
        status={budgets.data}
        categories={categories.data.categories}
        currency={settings.data.defaultCurrency}
        locale={settings.data.locale}
      />
      <PaydaySection
        budgets={budgets.data}
        categories={categories.data.categories}
        accounts={accounts.data.accounts}
        currency={settings.data.defaultCurrency}
        locale={settings.data.locale}
      />
      <CoverOrder items={budgets.data.coverOrder} />
      <PoolsSection list={pools.data} locale={settings.data.locale} />
      <IousSection
        list={ious.data}
        accounts={accounts.data.accounts}
        categories={categories.data.categories}
        currency={settings.data.defaultCurrency}
        locale={settings.data.locale}
        today={today.data.today}
      />
      <BillsSection
        bills={bills.data.bills}
        accounts={accounts.data.accounts}
        categories={categories.data.categories}
        rates={rates.data.rates}
        today={today.data}
        locale={settings.data.locale}
      />
    </Page>
  );
}

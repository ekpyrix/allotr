import { type SessionUser } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, SkeletonCard, SkeletonRows } from '@/components/ui/skeleton';
import {
  EmergencyFundCard,
  NetWorthCard,
  PaydayCard,
  WeeklyReviewCard,
} from '@/features/today/insight-cards';
import { BudgetCards } from '@/features/today/budget-cards';
import { AttentionList } from '@/features/today/attention-list';
import { entryRows } from '@/features/today/entries';
import {
  FirstPaycheck,
  needsFirstPaycheck,
} from '@/features/today/first-paycheck';
import { FigureTiles } from '@/features/today/figure-tiles';
import { formatLongDay } from '@/features/today/format';
import { HeroCard } from '@/features/today/hero-card';
import { heroState, paceAhead } from '@/features/today/state';
import { TodaysEntries } from '@/features/today/todays-entries';
import { Waterfall } from '@/features/today/waterfall';
import { budgetsQuery, poolsQuery } from '@/lib/budgets';
import { iousQuery } from '@/lib/ious';
import {
  accountsQuery,
  categoriesQuery,
  cycleDaysQuery,
  entriesOnQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import {
  emergencyFundQuery,
  netWorthQuery,
  paydayPlanQuery,
  weeklyReviewQuery,
} from '@/lib/plan';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { LazySheet } from '@/motion/lazy-sheet';

// The Today view (FR-W1, spec §11.1): one number first, then what backs it,
// what needs a look and what was logged today. Every figure comes from the
// server (`/v1/today`, the cycle's day series and the accounts' totals), so
// the web app never works out money on its own. From the expanded size
// class it has two panes, with the waterfall open in the second.
export function TodayPage({ user }: { user: SessionUser }) {
  const today = useQuery(todayQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const entries = useQuery(entriesOnQuery(today.data?.today));
  const days = useQuery(cycleDaysQuery(today.data?.cycle.openedOn));
  // Cards that add to the page, so a failure here never blocks it.
  const budgets = useQuery(budgetsQuery);
  const pools = useQuery(poolsQuery);
  const ious = useQuery(iousQuery);
  const review = useQuery(weeklyReviewQuery);
  const fund = useQuery(emergencyFundQuery);
  const worth = useQuery(netWorthQuery(30));
  const plan = useQuery(paydayPlanQuery);
  const [explaining, setExplaining] = useState(false);
  const all = [today, settings, accounts, categories, entries];

  // A failed refetch keeps what is on screen; only a first load fails here.
  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <Page title={t('today.heading')}>
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

  if (today.data === undefined || settings.data === undefined)
    return (
      <Page title={t('today.heading')}>
        <div role="status" aria-busy="true" className="mt-4 grid gap-4">
          <p className="sr-only">{t('today.loading')}</p>
          <Card variant="hero" className="grid gap-4" aria-hidden="true">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16 w-48" />
            <Skeleton className="h-6 w-40" />
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonRows rows={3} />
        </div>
      </Page>
    );

  const figures = today.data;
  const { locale } = settings.data;
  const series = days.data;
  const state = heroState(
    figures,
    series === undefined ? false : paceAhead(series.days),
  );
  const noAccounts = accounts.data?.accounts.length === 0;
  const savings = accounts.data?.totals.off.amount ?? null;

  return (
    <Page
      title={t('today.heading')}
      intro={formatLongDay(figures.today, locale)}
    >
      <div className="mt-4 grid gap-6 expanded:grid-cols-2 expanded:items-start">
        <div className="grid gap-6">
          <HeroCard
            figures={figures}
            state={state}
            days={series?.days}
            budget={series?.budget}
            locale={locale}
            explain={
              <Button
                variant="link"
                className="mt-4 expanded:hidden"
                onClick={() => {
                  setExplaining(true);
                }}
              >
                {t('today.howWorkedOut')}
              </Button>
            }
          />
          <FigureTiles
            figures={figures}
            locale={locale}
            onExplain={() => {
              setExplaining(true);
            }}
          />
          {noAccounts ? (
            <p className="max-w-prose text-body-lg">
              {t('today.greeting', { name: user.name })}
            </p>
          ) : null}
          {accounts.data !== undefined &&
          categories.data !== undefined &&
          needsFirstPaycheck(
            figures.cycle.openedBy,
            accounts.data.accounts,
            categories.data.categories,
          ) ? (
            <FirstPaycheck />
          ) : null}
          <AttentionList
            figures={figures}
            locale={locale}
            ious={ious.data?.ious}
          />
          {plan.data !== undefined && plan.data.income.amountMinor > 0 ? (
            <PaydayCard />
          ) : null}
          {review.data === undefined || categories.data === undefined ? null : (
            <WeeklyReviewCard
              review={review.data}
              categories={categories.data.categories}
              today={figures.today}
              locale={locale}
            />
          )}
          <BudgetCards
            status={budgets.data}
            pools={pools.data}
            locale={locale}
          />
        </div>
        <div className="grid gap-6">
          {entries.data === undefined ||
          accounts.data === undefined ||
          categories.data === undefined ? null : (
            <TodaysEntries
              rows={entryRows(
                entries.data.transactions,
                accounts.data.accounts,
                categories.data.categories,
              )}
              locale={locale}
              cycleOpenedBy={figures.cycle.openedBy}
            />
          )}
          {fund.data === undefined ? null : (
            <EmergencyFundCard fund={fund.data} locale={locale} />
          )}
          {worth.data === undefined ? null : (
            <NetWorthCard worth={worth.data} locale={locale} />
          )}
          <Card className="hidden expanded:block">
            <h2 className="text-title">{t('today.waterfall.title')}</h2>
            <Waterfall
              figures={figures}
              savings={savings}
              locale={locale}
              className="mt-2"
            />
          </Card>
        </div>
      </div>
      <LazySheet
        open={explaining}
        onOpenChange={setExplaining}
        title={t('today.waterfall.title')}
        detents={['large', 'medium']}
        defaultDetent="large"
      >
        <Waterfall figures={figures} savings={savings} locale={locale} />
      </LazySheet>
    </Page>
  );
}

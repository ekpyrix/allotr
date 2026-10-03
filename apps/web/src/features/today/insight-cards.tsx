import {
  formatMoney,
  type CategoryView,
  type EmergencyFundView,
  type LocalDate,
  type NetWorthView,
  type WeeklyReviewView,
} from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LinearProgress } from '@/components/ui/progress';
import { t } from '@/messages/t';
import { formatDay } from './format.ts';
import { loadDismissed, reviewDue, saveDismissed } from './review-dismissal.ts';

const linkClass = 'w-fit font-medium underline underline-offset-4';

/** Last seven days against the seven before; once a week, dismissible. */
export function WeeklyReviewCard({
  review,
  categories,
  today,
  locale,
}: {
  review: WeeklyReviewView;
  categories: readonly CategoryView[];
  today: LocalDate;
  locale: string;
}) {
  const heading = useId();
  const [dismissed, setDismissed] = useState(loadDismissed);
  if (!reviewDue(dismissed, today) || review.entries === 0) return null;
  const name = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ??
    t('today.review.uncategorised');
  return (
    <section aria-labelledby={heading}>
      <Card className="grid gap-2 text-body">
        <div className="flex items-start justify-between gap-3">
          <h2 id={heading} className="text-title">
            {t('today.review.title', {
              from: formatDay(review.from, locale),
              to: formatDay(review.to, locale),
            })}
          </h2>
          <Button
            variant="text"
            size="icon"
            className="-mt-2 -mr-3"
            aria-label={t('today.review.dismiss')}
            onClick={() => {
              saveDismissed(today);
              setDismissed(today);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <p>
          {t('today.review.spent', {
            spent: formatMoney(review.spent, locale),
            previous: formatMoney(review.previousSpent, locale),
          })}
        </p>
        {review.topCategories.length === 0 ? null : (
          <p>
            {t('today.review.top', {
              list: review.topCategories
                .map(
                  (c) =>
                    `${name(c.categoryId)} ${formatMoney(c.amount, locale)}`,
                )
                .join(', '),
            })}
          </p>
        )}
        {review.overBudget > 0 ? (
          <p>{t('today.review.over', { count: review.overBudget })}</p>
        ) : null}
        {review.covered.amountMinor > 0 ? (
          <p>
            {t('today.review.covered', {
              amount: formatMoney(review.covered, locale),
            })}
          </p>
        ) : null}
        <Link to="/reports" search={{ tab: 'plan' }} className={linkClass}>
          {t('today.review.more')}
        </Link>
      </Card>
    </section>
  );
}

/** Savings against a target of months of expenses, from the server. */
export function EmergencyFundCard({
  fund,
  locale,
}: {
  fund: EmergencyFundView;
  locale: string;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="text-title">
        {t('today.fund.title')}
      </h2>
      <Card className="mt-3 grid gap-2 text-body">
        {fund.historyCycles === 0 ? (
          <p className="text-text-muted">{t('today.fund.noHistory')}</p>
        ) : (
          <>
            <p>
              {t('today.fund.saved', {
                saved: formatMoney(fund.saved, locale),
                target: formatMoney(fund.target, locale),
                months: fund.months,
              })}
            </p>
            <LinearProgress
              value={fund.progressBasisPoints / 100}
              label={t('today.fund.progress')}
            />
            <p className="text-caption text-text-muted">
              {t('today.fund.range', {
                low: formatMoney(fund.targetLow, locale),
                high: formatMoney(fund.targetHigh, locale),
              })}
            </p>
          </>
        )}
      </Card>
    </section>
  );
}

export function NetWorthCard({
  worth,
  locale,
}: {
  worth: NetWorthView;
  locale: string;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="text-title">
        {t('today.netWorth.title')}
      </h2>
      <Card className="mt-3 grid gap-2 text-body">
        <p className="font-mono text-title" data-testid="net-worth">
          {formatMoney(worth.amount, locale)}
        </p>
        <p className="text-caption text-text-muted">
          {t('today.netWorth.hint')}
        </p>
        <Link to="/reports" search={{ tab: 'plan' }} className={linkClass}>
          {t('today.netWorth.over')}
        </Link>
      </Card>
    </section>
  );
}

/** A nudge to the payday sheet once a paycheck has arrived this cycle. */
export function PaydayCard() {
  const heading = useId();
  return (
    <section aria-labelledby={heading}>
      <Card className="grid gap-2 text-body">
        <h2 id={heading} className="text-title">
          {t('today.paydayCard.title')}
        </h2>
        <p>{t('today.paydayCard.body')}</p>
        <Link to="/budget" hash="payday" className={linkClass}>
          {t('today.paydayCard.open')}
        </Link>
      </Card>
    </section>
  );
}

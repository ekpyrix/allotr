import { useQuery } from '@tanstack/react-query';
import type { CategoryView, WeeklyReviewView } from '@allotr/shared';
import { Sheet } from '@/components/sheet';
import { formatDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { categoriesQuery } from '@/lib/ledger';
import { weeklyReviewQuery } from '@/lib/plan';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';

const locale = 'en';

function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b px-3 py-2">
      <span className="text-small text-text-muted">{label}</span>
      <span className="num text-stat-sub font-semibold">{value}</span>
      {sub === undefined ? null : (
        <span className="num text-small text-text-muted">{sub}</span>
      )}
    </div>
  );
}

/** The last seven days (ADR 0021). Every figure is the server's. */
export function WeeklyReviewSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const review = useQuery({ ...weeklyReviewQuery, enabled: open });
  const categories = useQuery({ ...categoriesQuery, enabled: open });
  return (
    <Sheet
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('budgetGoalsIous.weekly.title')}
      closeLabel={t('budgetGoalsIous.close')}
    >
      {review.data === undefined ? (
        <p
          role={review.isError ? 'alert' : 'status'}
          className="px-3 py-4 text-small text-text-muted"
        >
          {review.isError
            ? describeProblem(review.error).message
            : t('budgetGoalsIous.weekly.loading')}
        </p>
      ) : (
        <Review
          review={review.data}
          categories={categories.data?.categories ?? []}
        />
      )}
    </Sheet>
  );
}

function Review({
  review,
  categories,
}: {
  review: WeeklyReviewView;
  categories: readonly CategoryView[];
}) {
  const money = (m: WeeklyReviewView['spent']) =>
    formatMoney(m, 'symbol', locale);
  const nameOf = (id: string | null) =>
    id === null
      ? t('budgetGoalsIous.weekly.uncategorised')
      : (categories.find((c) => c.id === id)?.name ?? '');
  return (
    <div>
      <p className="border-b px-3 py-2 text-small text-text-muted">
        {t('budgetGoalsIous.weekly.period', {
          from: formatDay(review.from, locale),
          to: formatDay(review.to, locale),
        })}
      </p>
      <Figure
        label={t('budgetGoalsIous.weekly.spent')}
        value={money(review.spent)}
        sub={`${t('budgetGoalsIous.weekly.previous')}: ${money(review.previousSpent)} · ${t(
          'budgetGoalsIous.weekly.spentSub',
          { count: review.entries },
        )}`}
      />
      <Figure
        label={t('budgetGoalsIous.weekly.leftToday')}
        value={money(review.leftToday)}
        sub={t('budgetGoalsIous.weekly.leftTodaySub', {
          days: review.daysLeft,
        })}
      />
      <section
        aria-label={t('budgetGoalsIous.weekly.topCategories')}
        className="border-b"
      >
        <h3 className="px-3 pt-2 text-small text-text-muted">
          {t('budgetGoalsIous.weekly.topCategories')}
        </h3>
        {review.topCategories.length === 0 ? (
          <p className="px-3 py-2 font-sans text-small">
            {t('budgetGoalsIous.weekly.noCategories')}
          </p>
        ) : (
          <ul>
            {review.topCategories.map((c) => (
              <li
                key={c.categoryId ?? 'none'}
                className="flex min-h-row items-center justify-between gap-2 px-3"
              >
                <span className="min-w-0 truncate font-sans text-small">
                  {nameOf(c.categoryId)}
                </span>
                <span className="num text-small">{money(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-col gap-1 px-3 py-2 text-small">
        <p className="font-sans">
          {review.overBudget === 0
            ? t('budgetGoalsIous.weekly.onTrack')
            : t('budgetGoalsIous.weekly.overBudget', {
                count: review.overBudget,
              })}
        </p>
        {review.covered.amountMinor > 0 ? (
          <p className="num text-text-muted">
            {t('budgetGoalsIous.weekly.covered', {
              amount: money(review.covered),
            })}
          </p>
        ) : null}
        {review.uncovered.amountMinor > 0 ? (
          <p className="num text-negative">
            {t('budgetGoalsIous.weekly.uncovered', {
              amount: money(review.uncovered),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

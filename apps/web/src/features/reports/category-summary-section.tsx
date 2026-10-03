import type { CategoryView, LocalDate } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { SkeletonCard } from '@/components/ui/skeleton';
import { formatRange } from '@/features/cycles/format';
import { useDevicePref } from '@/lib/device-prefs';
import { categorySummaryQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { CategoryCards } from './category-cards.tsx';

// The category summaries of a Reports page: per cycle (the one shown, by
// default) or per calendar month, as the device setting says.
export function CategorySummarySection({
  openedOn,
  categories,
  locale,
}: {
  openedOn: LocalDate;
  categories: readonly CategoryView[];
  locale: string;
}) {
  const [period] = useDevicePref('reportPeriod');
  const summary = useQuery(categorySummaryQuery(period, openedOn));
  if (summary.data === undefined) {
    if (summary.isError) return null;
    return (
      <div role="status" aria-busy="true" className="grid gap-3">
        <p className="sr-only">{t('reports.loading')}</p>
        <div className="grid gap-3 medium:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }
  const { spending, income, from, to } = summary.data;
  const range = formatRange(from, to, locale);
  return (
    <div className="grid gap-6" data-testid="category-summary">
      <CategoryCards
        kind="spending"
        title={t('reports.spendingTitle', { range })}
        empty={t('reports.noSpending')}
        groups={spending}
        categories={categories}
        locale={locale}
      />
      {income.length === 0 ? null : (
        <CategoryCards
          kind="income"
          title={t('reports.incomeTitle', { range })}
          empty={t('reports.noIncome')}
          groups={income}
          categories={categories}
          locale={locale}
        />
      )}
    </div>
  );
}

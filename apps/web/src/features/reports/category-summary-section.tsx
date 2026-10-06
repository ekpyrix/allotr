import type { CategoryView, LocalDate } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { SkeletonCard } from '@/components/ui/skeleton';
import { formatRange } from '@/features/cycles/format';
import { categorySummaryQuery, ledgerSettingsQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { CategoryCards } from './category-cards.tsx';

// The category summaries of a Reports page: per cycle (the one shown, by
// default) or per calendar month, as the user's report settings say.
export function CategorySummarySection({
  openedOn,
  categories,
  locale,
}: {
  openedOn: LocalDate;
  categories: readonly CategoryView[];
  locale: string;
}) {
  const settings = useQuery(ledgerSettingsQuery);
  const period = settings.data?.reportPeriod ?? 'cycle';
  const summary = useQuery({
    ...categorySummaryQuery(period, openedOn),
    enabled: settings.data !== undefined,
  });
  if (settings.data === undefined || summary.data === undefined) {
    if (summary.isError || settings.isError) return null;
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
        expandAll={settings.data.categoryCards === 'all'}
        kind="spending"
        title={t('reports.spendingTitle', { range })}
        empty={t('reports.noSpending')}
        groups={spending}
        categories={categories}
        locale={locale}
      />
      {income.length === 0 ? null : (
        <CategoryCards
          expandAll={settings.data.categoryCards === 'all'}
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

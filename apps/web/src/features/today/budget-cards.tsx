import {
  formatMoney,
  type BudgetStatusView,
  type PoolListView,
} from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { Card } from '@/components/ui/card';
import { LinearProgress } from '@/components/ui/progress';
import { spentShare } from '@/features/budget/share';
import { t } from '@/messages/t';

const linkClass = 'w-fit font-medium underline underline-offset-4';

/**
 * Budgets, pools and what cover paid this period, from `/v1/budgets` and
 * `/v1/pools`. A card shows only when it has something real to say: no
 * budgets planned, no budgets card.
 */
export function BudgetCards({
  status,
  pools,
  locale,
}: {
  status: BudgetStatusView | undefined;
  pools: PoolListView | undefined;
  locale: string;
}) {
  const budgetsId = useId();
  const poolsId = useId();
  const coveredId = useId();
  const planned = (status?.budgets ?? []).filter(
    (b) => b.target.kind !== 'buffer' || b.planned.amountMinor > 0,
  );
  const covered = status?.covered;
  const showCovered =
    covered !== undefined && covered.shortfall.amountMinor > 0;
  return (
    <>
      {planned.length === 0 ? null : (
        <section aria-labelledby={budgetsId}>
          <h2 id={budgetsId} className="text-title">
            {t('budget.dashboard.budgets')}
          </h2>
          <Card className="mt-3 grid gap-4">
            <ul className="grid gap-4">
              {planned.slice(0, 5).map((b) => (
                <li key={b.id} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body wrap-anywhere">{b.name}</span>
                    <span className="font-mono text-body">
                      {t('budget.budgets.left', {
                        amount: formatMoney(b.left, locale),
                      })}
                    </span>
                  </div>
                  <LinearProgress
                    value={spentShare(b.spent, b.left)}
                    label={t('budget.budgets.progress', { name: b.name })}
                  />
                </li>
              ))}
            </ul>
            <Link to="/budget" hash="budgets" className={linkClass}>
              {t('budget.dashboard.seeBudget')}
            </Link>
          </Card>
        </section>
      )}
      {showCovered ? (
        <section aria-labelledby={coveredId}>
          <h2 id={coveredId} className="text-title">
            {t('budget.dashboard.covered')}
          </h2>
          <Card className="mt-3 grid gap-1 text-body">
            <p>
              {t('budget.dashboard.coveredBody', {
                amount: formatMoney(covered.shortfall, locale),
              })}
            </p>
            <p className="text-text-muted">
              {t('budget.dashboard.coveredFrom', {
                free: formatMoney(covered.fromFree, locale),
                buffer: formatMoney(covered.fromBuffer, locale),
                budgets: formatMoney(covered.fromBudgets, locale),
              })}
            </p>
            {covered.uncovered.amountMinor > 0 ? (
              <p>
                {t('budget.dashboard.uncovered', {
                  amount: formatMoney(covered.uncovered, locale),
                })}
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}
      {pools === undefined || pools.pools.length < 2 ? null : (
        <section aria-labelledby={poolsId}>
          <h2 id={poolsId} className="text-title">
            {t('budget.dashboard.pools')}
          </h2>
          <ul className="mt-3 border-y border-outline-variant">
            {pools.pools.map((p) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between gap-3 border-b border-outline-variant px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 text-body wrap-anywhere">
                  {p.name}
                  <span className="block text-caption text-text-muted">
                    {p.counts
                      ? t('budget.pools.inDaily')
                      : t('budget.pools.notInDaily')}
                  </span>
                </span>
                <span className="font-mono text-body">
                  {formatMoney(p.balance.amount, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

import { formatMoney, type Money } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { List, ListRow } from '@/components/ui/list';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { categoryName } from './format.ts';

// Pieces shared by the cycle, history and savings views.

export const linkClass = 'font-medium underline underline-offset-4';

interface Loadable {
  isError: boolean;
  error: unknown;
  data: unknown;
  refetch: () => Promise<unknown>;
}

/**
 * The page while its first load fails or runs; null once every query has
 * data. A failed refetch keeps what is on screen.
 */
export function PageState({
  title,
  loading,
  queries,
  children,
}: {
  title: string;
  loading: string;
  queries: readonly Loadable[];
  children?: ReactNode;
}) {
  const failed = queries.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <Page title={title}>
        <div className="mt-6 grid justify-items-start gap-4">
          <FormError message={errorMessage(failed.error)} />
          <Button
            onClick={() => {
              for (const q of queries) if (q.isError) void q.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
          {children}
        </div>
      </Page>
    );
  return (
    <Page title={title}>
      <p role="status" className="mt-6 text-text-muted">
        {loading}
      </p>
    </Page>
  );
}

export function Figures({
  label,
  items,
  locale,
}: {
  label: string;
  items: readonly (readonly [term: string, amount: Money, testId: string])[];
  locale: string;
}) {
  return (
    <dl
      aria-label={label}
      className="mt-6 grid grid-cols-2 gap-3 medium:grid-cols-4"
    >
      {items.map(([term, amount, testId]) => (
        <div key={term} className="rounded-md bg-card p-4">
          <dt className="text-sm text-text-muted">{term}</dt>
          <dd
            data-testid={testId}
            className="mt-1 font-mono text-lg tabular-nums wrap-anywhere"
          >
            {formatMoney(amount, locale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CategoryTotals({
  title,
  empty,
  totals,
  names,
  locale,
}: {
  title: string;
  empty: string;
  totals: readonly { categoryId: string | null; amount: Money }[];
  names: ReadonlyMap<string, string>;
  locale: string;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="grid gap-3">
      <h2 id={heading} className="text-title">
        {title}
      </h2>
      {totals.length === 0 ? (
        <p className="text-text-muted">{empty}</p>
      ) : (
        <List>
          {totals.map(({ categoryId, amount }) => (
            <ListRow
              key={categoryId ?? ''}
              title={categoryName(names, categoryId)}
              trailing={formatMoney(amount, locale)}
            />
          ))}
        </List>
      )}
    </section>
  );
}

/** Currencies left out of the figures for lack of a rate on `date`. */
export function MissingRates({
  currencies,
  defaultCurrency,
  date,
}: {
  currencies: readonly string[];
  defaultCurrency: string;
  date: string;
}) {
  if (currencies.length === 0) return null;
  return (
    <ul className="mt-6 grid gap-2">
      {currencies.map((currency) => (
        <li
          key={currency}
          className="flex gap-3 rounded-md bg-card p-3 text-sm"
        >
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-negative"
          />
          <span className="grid gap-1">
            <span>
              {t('cycle.missingRate', { currency, defaultCurrency, date })}
            </span>
            <Link to="/settings" hash="rates" className={linkClass}>
              {t('accounts.missingRateAction', { currency })}
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

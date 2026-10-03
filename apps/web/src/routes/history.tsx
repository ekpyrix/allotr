import { formatMoney, type CycleSummaryView } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PencilLine } from 'lucide-react';
import { Page } from '@/components/page';
import { formatRange } from '@/features/cycles/format';
import { linkClass, PageState } from '@/features/cycles/parts';
import { cyclesQuery, ledgerSettingsQuery } from '@/lib/ledger';
import { t } from '@/messages/t';

function PastCycle({
  cycle,
  locale,
}: {
  cycle: CycleSummaryView;
  locale: string;
}) {
  const range = formatRange(cycle.openedOn, cycle.lastDay, locale);
  const figures = [
    [t('cycle.income'), cycle.income, 'income'],
    [t('cycle.spending'), cycle.spending, 'spending'],
    [t('cycle.leftover'), cycle.leftover, 'leftover'],
    [t('cycle.savingsNetChange'), cycle.savingsNetChange, 'savings'],
  ] as const;
  return (
    <li
      data-cycle={cycle.openedOn}
      className="grid gap-3 rounded-md border border-outline-variant p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-medium">
          <Link
            to="/cycle"
            search={{ start: cycle.openedOn }}
            aria-label={t('history.open', { range })}
            className={linkClass}
          >
            {range}
          </Link>
        </h2>
        {cycle.amended ? (
          <span
            data-testid="amended"
            title={t('history.amendedHint')}
            className="inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <PencilLine aria-hidden className="size-4" />
            {t('history.amended')}
            <span className="sr-only">: {t('history.amendedHint')}</span>
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 medium:grid-cols-4">
        {figures.map(([term, amount, key]) => (
          <div key={key}>
            <dt className="text-sm text-text-muted">{term}</dt>
            <dd
              data-testid={`history-${key}`}
              className="font-mono tabular-nums wrap-anywhere"
            >
              {formatMoney(amount, locale)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

// Past cycles (FR-W2, FR-C6): each closed cycle's snapshot, newest first,
// marked when an entry recorded after it closed changed it.
export function HistoryPage() {
  const settings = useQuery(ledgerSettingsQuery);
  const cycles = useQuery(cyclesQuery);

  if (settings.data === undefined || cycles.data === undefined)
    return (
      <PageState
        title={t('history.title')}
        loading={t('history.loading')}
        queries={[settings, cycles]}
      />
    );

  const { locale } = settings.data;
  const past = cycles.data.cycles.filter((cycle) => cycle.closedOn !== null);

  return (
    <Page title={t('history.title')} intro={t('history.intro')}>
      <p className="mt-4">
        <Link to="/cycle" className={linkClass}>
          {t('history.current')}
        </Link>
      </p>
      {past.length === 0 ? (
        <p className="mt-6 max-w-prose text-text-muted">{t('history.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {past.map((cycle) => (
            <PastCycle key={cycle.openedOn} cycle={cycle} locale={locale} />
          ))}
        </ul>
      )}
    </Page>
  );
}

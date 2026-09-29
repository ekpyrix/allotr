import { formatMoney, type SessionUser } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { AttentionList } from '@/features/today/attention-list';
import { entryRows } from '@/features/today/entries';
import { formatAbs, formatDay } from '@/features/today/format';
import { PaceMeter } from '@/features/today/pace-meter';
import { TodaysEntries } from '@/features/today/todays-entries';
import {
  accountsQuery,
  categoriesQuery,
  entriesOnQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';

// Scales with the phone's width, and a very long amount wraps rather than
// scrolling the page sideways.
const heroClass =
  'mt-1 font-mono text-[min(16vw,4.5rem)] leading-[0.9] font-semibold tracking-tighter tabular-nums wrap-anywhere sm:text-8xl';

// The Today view (FR-W1): one number first, what backs it, what needs a
// look, and what was logged today. Every figure comes from `/v1/today`, so
// the web app never works out money on its own.
export function TodayPage({ user }: { user: SessionUser }) {
  const today = useQuery(todayQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const entries = useQuery(entriesOnQuery(today.data?.today));
  const all = [today, settings, accounts, categories, entries];

  // A failed refetch keeps what is on screen; only a first load fails here.
  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <>
        <h1 className="text-lg font-medium text-muted-foreground">
          {t('today.title')}
        </h1>
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
      </>
    );

  if (today.data === undefined || settings.data === undefined)
    return (
      <>
        <h1 className="text-lg font-medium text-muted-foreground">
          {t('today.title')}
        </h1>
        <p className={`${heroClass} text-muted-foreground`} aria-hidden>
          —
        </p>
        <p className="sr-only">{t('today.loading')}</p>
      </>
    );

  const figures = today.data;
  const { locale } = settings.data;
  const over = figures.leftToday.amountMinor < 0;
  const noAccounts = accounts.data?.accounts.length === 0;

  return (
    <>
      <h1 className="text-lg font-medium text-muted-foreground">
        {t('today.title')}
      </h1>
      <p
        data-testid="left-today"
        className={`${heroClass} ${over ? 'text-over' : 'text-today'}`}
      >
        {over
          ? t('today.over', { amount: formatAbs(figures.leftToday, locale) })
          : formatMoney(figures.leftToday, locale)}
      </p>
      {over ? <p className="mt-4 max-w-prose">{t('today.overHint')}</p> : null}
      <p className="mt-4 font-mono text-lg tabular-nums">
        {t('today.liveDaily', {
          amount: formatMoney(figures.liveDaily, locale),
          count: figures.daysLeft,
        })}
      </p>

      <dl
        aria-label={t('today.figuresLabel')}
        className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          [t('today.allowance'), formatMoney(figures.todayAllowance, locale)],
          [t('today.spentToday'), formatMoney(figures.spentToday, locale)],
          [t('today.daysLeft'), String(figures.daysLeft)],
          [
            t('today.payday'),
            figures.overdue
              ? t('today.paydayOverdue')
              : formatDay(figures.cycleEnd, locale),
          ],
        ].map(([term, value]) => (
          <div key={term} className="rounded-md bg-plot p-4">
            <dt className="text-sm text-muted-foreground">{term}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {noAccounts ? (
        <p className="mt-8 max-w-prose text-lg">
          {t('today.greeting', { name: user.name })}
        </p>
      ) : null}

      <AttentionList figures={figures} locale={locale} />
      <PaceMeter figures={figures} locale={locale} />
      <p className="mt-3">
        <Link to="/cycle" className="font-medium underline underline-offset-4">
          {t('today.pace.details')}
        </Link>
      </p>
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
    </>
  );
}

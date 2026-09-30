import { formatMoney, type TransactionListView } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Landmark,
  Receipt,
  Repeat,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { formatLongDay, rowAmount, rowTitle } from './format.ts';
import { byDay, type LedgerRow } from './rows.ts';
import type { LedgerSearch } from './search.ts';

const kindIcons: Record<LedgerRow['kind'], LucideIcon> = {
  expense: Receipt,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  opening: Landmark,
  write_off: Receipt,
  reversal: Undo2,
  budget_switch: Repeat,
};

function Row({
  row,
  locale,
  search,
}: {
  row: LedgerRow;
  locale: string;
  search: LedgerSearch;
}) {
  const amount = rowAmount(row, locale);
  const Icon = kindIcons[row.kind];
  const muted = row.undone || row.kind === 'reversal';
  const details = [
    row.accounts.filter((name) => name !== '').join(' → '),
    row.kind === 'reversal' || row.title === null ? null : row.note,
  ].filter((part) => part !== null && part !== '');
  return (
    <li>
      <Link
        to="/ledger"
        search={{ ...search, entry: row.id }}
        data-entry-id={row.id}
        aria-current={search.entry === row.id ? 'true' : undefined}
        className="flex min-h-(--row-h) items-center gap-4 px-4 py-2 transition-colors duration-(--dur-fade) hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-[current=true]:bg-card-raised"
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card-raised text-text-muted"
        >
          <Icon className="size-5 stroke-[1.75]" />
        </span>
        <span className={cn('min-w-0 flex-1', muted && 'text-text-muted')}>
          <span
            className={cn(
              'block text-body-lg wrap-anywhere',
              row.undone && 'line-through',
            )}
          >
            {rowTitle(row)}
          </span>
          {details.length > 0 ? (
            <span className="block truncate text-body text-text-muted">
              {details.join(' · ')}
            </span>
          ) : null}
        </span>
        {amount === null ? null : (
          <span
            className={cn(
              'shrink-0 font-mono text-body-lg tabular-nums',
              muted && 'text-text-muted',
              row.undone && 'line-through',
              !muted && row.kind === 'income' && 'text-positive',
            )}
          >
            {amount}
          </span>
        )}
        {row.undone ? (
          <span className="shrink-0 text-body text-text-muted">
            {t('ledger.undone')}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

// Entries by day, newest first, a page at a time. After "Load more",
// focus moves to the first new entry so keyboard users carry on reading.
export function LedgerList({
  rows,
  dayTotals,
  locale,
  search,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  rows: LedgerRow[];
  /** The server's net total per day, over every matching entry. */
  dayTotals: ReadonlyMap<string, TransactionListView['dayTotals'][number]>;
  locale: string;
  search: LedgerSearch;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || rows.length <= from) return;
    focusFrom.current = null;
    const id = rows[from]?.id;
    if (id === undefined) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, [rows]);

  return (
    <div ref={list}>
      {byDay(rows).map((group) => {
        const headingId = `ledger-day-${group.day}`;
        const total = dayTotals.get(group.day);
        return (
          <section key={group.day} aria-labelledby={headingId} className="mt-4">
            <h2
              id={headingId}
              className="sticky top-16 z-[5] -mx-1 flex items-baseline justify-between gap-3 bg-canvas px-1 py-2 text-label text-text-muted"
            >
              <span>{formatLongDay(group.day, locale)}</span>
              {total === undefined ? null : (
                <span className="font-mono tabular-nums">
                  <span className="sr-only">{t('ledger.dayNet')} </span>
                  {formatMoney(total.net, locale, {
                    signDisplay: 'exceptZero',
                  })}
                </span>
              )}
            </h2>
            <ul className="overflow-hidden rounded-lg bg-card">
              {group.rows.map((row) => (
                <Row key={row.id} row={row} locale={locale} search={search} />
              ))}
            </ul>
          </section>
        );
      })}
      {hasMore ? (
        <Button
          variant="outlined"
          className="mt-6"
          disabled={loadingMore}
          onClick={() => {
            focusFrom.current = rows.length;
            onLoadMore();
          }}
        >
          {loadingMore ? t('ledger.loadingMore') : t('ledger.more')}
        </Button>
      ) : null}
    </div>
  );
}

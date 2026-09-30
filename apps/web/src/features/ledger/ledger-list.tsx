import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { formatLongDay, rowAmount, rowTitle } from './format.ts';
import { byDay, type LedgerRow } from './rows.ts';
import type { LedgerSearch } from './search.ts';

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
        className="flex items-start gap-3 rounded-md px-2 py-3 outline-none hover:bg-plot focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn('min-w-0 flex-1', muted && 'text-muted-foreground')}
        >
          <span
            className={cn('block font-medium', row.undone && 'line-through')}
          >
            {rowTitle(row)}
          </span>
          {details.length > 0 ? (
            <span className="block truncate text-sm text-muted-foreground">
              {details.join(' · ')}
            </span>
          ) : null}
        </span>
        {amount === null ? null : (
          <span
            className={cn(
              'font-mono tabular-nums',
              muted && 'text-muted-foreground',
              row.undone && 'line-through',
              !muted && row.kind === 'income' && 'text-positive',
            )}
          >
            {amount}
          </span>
        )}
        {row.undone ? (
          <span className="text-sm text-muted-foreground">
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
  locale,
  search,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  rows: LedgerRow[];
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
        return (
          <section key={group.day} aria-labelledby={headingId} className="mt-6">
            <h2
              id={headingId}
              className="border-b border-border pb-1 text-sm font-medium text-muted-foreground"
            >
              {formatLongDay(group.day, locale)}
            </h2>
            <ul className="mt-1">
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
